import { Kysely } from 'kysely';
import { ValidateError } from 'tsoa';

import { kdb } from '../../config/database';
import { DB } from '../../config/types/db';
import { UserMessageError } from '../../globals';
import { DivisionClassification, SeasonType } from '../enums';
import {
  aggregatePlayerGames,
  aggregatePlayerSeasons,
  aggregateTeamGames,
  aggregateTeamSeasons,
  PuntEvent,
  PuntFacts,
  PuntTeamGame,
} from './aggregate';
import {
  PlayerPuntingGame,
  PlayerPuntingSeason,
  PuntPlayQuery,
  PuntPlayerQuery,
  PuntTeamQuery,
  PuntingPlay,
  PuntParseStatus,
  TeamPuntingGame,
  TeamPuntingSeason,
} from './types';

export const MAX_PUNT_PLAYS = 10_000;
export const MAX_PUNT_RESPONSE_BYTES = 48 * 1024 * 1024;
type Mode = 'plays' | 'players' | 'teams';
type Scope = PuntPlayQuery & { playerId?: string };
const TOO_MANY_RESULTS = 'Too many results; add a week, team, or player filter';

function invalid(field: string, value: unknown, message: string): never {
  throw new ValidateError({ [field]: { value, message } }, 'Validation error');
}

function validate(query: Scope, mode: Mode): Scope {
  for (const key of ['gameId', 'year', 'week'] as const) {
    const value = query[key];
    const minimum = key === 'week' ? 0 : 1;
    if (
      value !== undefined &&
      (!Number.isSafeInteger(value) || value < minimum)
    )
      invalid(
        key,
        value,
        `${key} must be ${minimum ? 'a positive' : 'a non-negative'} integer`,
      );
  }
  for (const key of [
    'team',
    'puntingTeam',
    'receivingTeam',
    'conference',
    'punterId',
    'returnerId',
    'playerId',
  ] as const) {
    if (query[key] !== undefined && !query[key]?.trim())
      invalid(key, query[key], `${key} must not be empty`);
  }
  for (const key of ['punterId', 'returnerId', 'playerId'] as const) {
    const value = query[key]?.trim();
    if (
      value !== undefined &&
      (!/^[1-9]\d*$/.test(value) || BigInt(value) > 9223372036854775807n)
    )
      invalid(key, value, `${key} must be a numeric ID`);
  }
  if (
    query.year === undefined &&
    (mode !== 'plays' || query.gameId === undefined)
  )
    invalid(
      'year',
      query.year,
      mode === 'plays'
        ? 'year is required when gameId is not specified'
        : 'year is required',
    );
  if (
    mode === 'plays' &&
    query.gameId === undefined &&
    query.week === undefined &&
    [
      query.team,
      query.puntingTeam,
      query.receivingTeam,
      query.punterId,
      query.returnerId,
    ].every((value) => value === undefined)
  )
    invalid(
      'week',
      query.week,
      'week, team, punterId, or returnerId is required with year',
    );
  return {
    ...query,
    team: query.team?.trim(),
    puntingTeam: query.puntingTeam?.trim(),
    receivingTeam: query.receivingTeam?.trim(),
    conference: query.conference?.trim(),
    punterId: query.punterId?.trim(),
    returnerId: query.returnerId?.trim(),
    playerId: query.playerId?.trim(),
    classification: query.classification ?? DivisionClassification.FBS,
    seasonType: query.seasonType ?? SeasonType.Both,
  };
}

function gamesQuery(db: Kysely<DB>, scope: Scope) {
  let query = db
    .selectFrom('game as g')
    .innerJoin('gameTeam as gt', 'gt.gameId', 'g.id')
    .innerJoin('team as t', 't.id', 'gt.teamId')
    .select([
      'g.id as gameId',
      'g.season',
      'g.week',
      'g.seasonType',
      'g.status',
      'g.startDate',
      'gt.teamId',
      'gt.homeAway',
      't.school as team',
    ])
    // Aggregates use only games whose punts have been stored (backfilled).
    .select((eb) =>
      eb
        .exists(
          eb
            .selectFrom('puntPlay as stored')
            .select('stored.playId')
            .whereRef('stored.gameId', '=', 'g.id'),
        )
        .as('hasPunts'),
    );
  if (scope.gameId !== undefined) {
    query = query.where('g.id', '=', scope.gameId);
    if (scope.year !== undefined)
      query = query.where('g.season', '=', scope.year);
  } else {
    const year = scope.year!;
    // Resolve the division's teams once instead of per game.
    query = query
      .where('g.season', '=', year)
      .where('g.status', '=', 'completed')
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('gameTeam as eligible')
            .select('eligible.gameId')
            .whereRef('eligible.gameId', '=', 'g.id')
            .where(
              'eligible.teamId',
              'in',
              eb
                .selectFrom('conferenceTeam as ct')
                .innerJoin('conference as c', 'c.id', 'ct.conferenceId')
                .select('ct.teamId')
                .where('c.division', '=', scope.classification ?? 'fbs')
                .where((member) =>
                  member.or([
                    member('ct.startYear', 'is', null),
                    member('ct.startYear', '<=', year),
                  ]),
                )
                .where((member) =>
                  member.or([
                    member('ct.endYear', 'is', null),
                    member('ct.endYear', '>=', year),
                  ]),
                ),
            ),
        ),
      );
  }
  if (scope.week !== undefined) query = query.where('g.week', '=', scope.week);
  // Keep both participants; coarse game filters precede all source expansion.
  for (const team of [scope.team, scope.puntingTeam, scope.receivingTeam]) {
    if (team && scope.gameId === undefined)
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('gameTeam as selected')
            .innerJoin('team as st', 'st.id', 'selected.teamId')
            .select('selected.id')
            .whereRef('selected.gameId', '=', 'g.id')
            .where((selected) =>
              selected(
                selected.fn<string>('lower', ['st.school']),
                '=',
                team.toLowerCase(),
              ),
            ),
        ),
      );
  }
  // Player filters keep only games with a credited stored punt for that player.
  for (const [id, columns] of [
    [scope.punterId, ['pp.punterId']],
    [scope.returnerId, ['pp.returnerId']],
    [
      scope.playerId,
      ['pp.punterId', 'pp.receiverId', 'pp.returnerId', 'pp.blockerId'],
    ],
  ] as const) {
    if (!id || scope.gameId !== undefined) continue;
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom('puntPlay as pp')
          .select('pp.playId')
          .whereRef('pp.gameId', '=', 'g.id')
          .where((pp) => pp.or(columns.map((column) => pp(column, '=', id)))),
      ),
    );
  }
  return query.orderBy('g.startDate').orderBy('g.id').orderBy('gt.homeAway');
}

const factColumns = [
  'pp.playId',
  'pp.gameId',
  'pp.puntingTeamId',
  'pp.receivingTeamId',
  'pp.countsAsPunt',
  'pp.countsAsPlayerPunt',
  'pp.countsAsReturn',
  'pp.countsAsPlayerReturn',
  'pp.endYardLine',
  'pp.endingPossessionTeamId',
  'pp.puntYards',
  'pp.returnYards',
  'pp.netPuntYards',
  'pp.isTouchback',
  'pp.isFairCatch',
  'pp.isOutOfBounds',
  'pp.isDowned',
  'pp.isBlocked',
  'pp.isMuffed',
  'pp.isReturnTouchdown',
  'pp.isReceivingTeamTurnover',
  'pp.punterId',
  'pp.receiverId',
  'pp.returnerId',
  'pp.returnerYards',
  'pp.blockerId',
] as const;

/** Full play rows: stored punts joined to play detail and actor names. */
function playsQuery(db: Kysely<DB>, scope: Scope, gameIds: number[]) {
  let query = db
    .selectFrom('puntPlay as pp')
    .innerJoin('play as p', 'p.id', 'pp.playId')
    .innerJoin('drive as d', 'd.id', 'p.driveId')
    .innerJoin('playType as pt', 'pt.id', 'p.playTypeId')
    .leftJoin('athlete as punter', 'punter.id', 'pp.punterId')
    .leftJoin('athlete as receiver', 'receiver.id', 'pp.receiverId')
    .leftJoin('athlete as returner', 'returner.id', 'pp.returnerId')
    .leftJoin('athlete as blocker', 'blocker.id', 'pp.blockerId')
    .select(factColumns)
    .select([
      'p.driveId',
      'd.driveNumber',
      'p.playNumber',
      'p.period',
      'p.clock',
      'p.down',
      'p.distance',
      'pt.text as playType',
      'p.playText',
      'pp.startYardLine',
      'pp.kickEndYardLine',
      'pp.hasPenalty',
      'pp.parseStatus',
      'punter.name as punter',
      'receiver.name as receiver',
      'returner.name as returner',
      'blocker.name as blocker',
    ])
    .where((eb) => eb('pp.gameId', '=', eb.fn.any(eb.val(gameIds))));
  if (scope.punterId) query = query.where('pp.punterId', '=', scope.punterId);
  if (scope.returnerId)
    query = query.where('pp.returnerId', '=', scope.returnerId);
  return query.limit(MAX_PUNT_PLAYS + 1);
}

/** Aggregate rows: stored punts only, plus actor names for player routes. */
async function factsQuery(
  db: Kysely<DB>,
  gameIds: number[],
  withNames: boolean,
): Promise<PuntEvent[]> {
  const base = db
    .selectFrom('puntPlay as pp')
    .select(factColumns)
    .where((eb) => eb('pp.gameId', '=', eb.fn.any(eb.val(gameIds))))
    .limit(MAX_PUNT_PLAYS + 1);
  const rows = withNames
    ? await base
        .leftJoin('athlete as punter', 'punter.id', 'pp.punterId')
        .leftJoin('athlete as receiver', 'receiver.id', 'pp.receiverId')
        .leftJoin('athlete as returner', 'returner.id', 'pp.returnerId')
        .leftJoin('athlete as blocker', 'blocker.id', 'pp.blockerId')
        .select([
          'punter.name as punter',
          'receiver.name as receiver',
          'returner.name as returner',
          'blocker.name as blocker',
        ])
        .execute()
    : (await base.execute()).map((row) => ({
        ...row,
        punter: null,
        receiver: null,
        returner: null,
        blocker: null,
      }));
  if (rows.length > MAX_PUNT_PLAYS)
    throw new UserMessageError(TOO_MANY_RESULTS);
  return rows.map((row) => ({
    countsAsPlayerPunt: row.countsAsPlayerPunt,
    countsAsPlayerReturn: row.countsAsPlayerReturn,
    endingPossessionTeamId: row.endingPossessionTeamId,
    play: facts(row),
  }));
}

function facts(
  row: Omit<PuntFacts, 'endYardline'> & {
    playId: string;
    endYardLine: number | null;
  },
): PuntFacts {
  return {
    gameId: row.gameId,
    puntingTeamId: row.puntingTeamId,
    receivingTeamId: row.receivingTeamId,
    punterId: row.punterId,
    punter: row.punter,
    receiverId: row.receiverId,
    receiver: row.receiver,
    returnerId: row.returnerId,
    returner: row.returner,
    blockerId: row.blockerId,
    blocker: row.blocker,
    countsAsPunt: row.countsAsPunt,
    countsAsReturn: row.countsAsReturn,
    puntYards: row.puntYards,
    returnYards: row.returnYards,
    returnerYards: row.returnerYards,
    netPuntYards: row.netPuntYards,
    endYardline: row.endYardLine,
    isTouchback: row.isTouchback,
    isFairCatch: row.isFairCatch,
    isOutOfBounds: row.isOutOfBounds,
    isDowned: row.isDowned,
    isBlocked: row.isBlocked,
    isMuffed: row.isMuffed,
    isReturnTouchdown: row.isReturnTouchdown,
    isReceivingTeamTurnover: row.isReceivingTeamTurnover,
  };
}

const compareId = (left: string, right: string) => {
  return left < right ? -1 : left > right ? 1 : 0;
};
const compareOrder = (a: number | null, b: number | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b;

type PuntRead = {
  plays: PuntingPlay[];
  events: PuntEvent[];
  teamGames: PuntTeamGame[];
};
const emptyRead = (): PuntRead => ({ plays: [], events: [], teamGames: [] });

async function readPunts(
  db: Kysely<DB>,
  scope: Scope,
  mode: Mode,
  onProject?: (ms: number) => void,
): Promise<PuntRead> {
  // Valid positive safe-integer IDs outside the stored integer range are empty
  // matches, rather than PostgreSQL parameter-overflow errors. Time columns are smallints.
  if (
    (scope.gameId !== undefined && scope.gameId > 2147483647) ||
    (scope.year !== undefined && scope.year > 32767) ||
    (scope.week !== undefined && scope.week > 32767)
  )
    return emptyRead();
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .setAccessMode('read only')
    .execute(async (trx): Promise<PuntRead> => {
      const participants = await gamesQuery(trx, scope).execute();
      const gameRows = new Map<number, typeof participants>();
      for (const row of participants) {
        if (
          row.status !== 'completed' ||
          (row.seasonType !== 'regular' && row.seasonType !== 'postseason') ||
          (scope.seasonType !== SeasonType.Both &&
            row.seasonType !== scope.seasonType)
        )
          continue;
        const rows = gameRows.get(row.gameId) ?? [];
        rows.push(row);
        gameRows.set(row.gameId, rows);
      }
      for (const [id, rows] of gameRows) {
        if (
          rows.length !== 2 ||
          rows[0].teamId === rows[1].teamId ||
          rows.filter((row) => row.homeAway === 'home').length !== 1
        )
          gameRows.delete(id);
      }
      const gameIds = [...gameRows.keys()];
      if (!gameIds.length) return emptyRead();
      // A request selects one stored season, including gameId-only reads.
      const season = gameRows.get(gameIds[0])![0].season;
      const participantTeamIds = [
        ...new Set(
          [...gameRows.values()].flatMap((rows) =>
            rows.map((row) => row.teamId),
          ),
        ),
      ];
      const memberships = await trx
        .selectFrom('conferenceTeam as ct')
        .innerJoin('conference as c', 'c.id', 'ct.conferenceId')
        .select([
          'ct.teamId',
          'c.name as conference',
          'c.abbreviation',
          'c.division',
        ])
        .where((eb) =>
          eb('ct.teamId', '=', eb.fn.any(eb.val(participantTeamIds))),
        )
        .where((eb) =>
          eb.or([
            eb('ct.startYear', 'is', null),
            eb('ct.startYear', '<=', season),
          ]),
        )
        .where((eb) =>
          eb.or([eb('ct.endYear', 'is', null), eb('ct.endYear', '>=', season)]),
        )
        .execute();
      const byTeam = new Map<number, typeof memberships>();
      for (const membership of memberships) {
        const group = byTeam.get(membership.teamId) ?? [];
        group.push(membership);
        byTeam.set(membership.teamId, group);
      }
      const affiliation = new Map<
        number,
        {
          division: string | null;
          name: string | null;
          conference: string | null;
        }
      >();
      for (const teamId of participantTeamIds) {
        const matched = byTeam.get(teamId) ?? [];
        const divisions = new Set(matched.map((m) => m.division));
        const names = new Set(matched.map((m) => m.conference));
        // Ambiguous divisions are ineligible; ambiguous conferences are null.
        affiliation.set(teamId, {
          division: divisions.size === 1 ? [...divisions][0] : null,
          name: names.size === 1 ? [...names][0] : null,
          conference: names.size === 1 ? matched[0].abbreviation : null,
        });
      }
      const sameName = (value: string | undefined, name: string | null) =>
        value !== undefined && name?.toLowerCase() === value.toLowerCase();
      const sideMatches = {
        division: (teamId: number) =>
          affiliation.get(teamId)!.division === scope.classification,
        team: (team: string) =>
          scope.team === undefined || sameName(scope.team, team),
        conference: (teamId: number) => {
          const { name, conference } = affiliation.get(teamId)!;
          return (
            scope.conference === undefined ||
            sameName(scope.conference, name) ||
            sameName(scope.conference, conference)
          );
        },
      };
      // Play filters match either participant; aggregate filters match the
      // represented team. Aggregates omit games without stored punts.
      const teamGames: PuntTeamGame[] = [];
      const selectedIds: number[] = [];
      for (const [gameId, rows] of gameRows) {
        if (mode === 'plays') {
          if (
            rows.some((row) => sideMatches.division(row.teamId)) &&
            rows.some((row) => sideMatches.team(row.team)) &&
            rows.some((row) => sideMatches.conference(row.teamId))
          )
            selectedIds.push(gameId);
          continue;
        }
        for (const row of rows) {
          if (
            !row.hasPunts ||
            !sideMatches.division(row.teamId) ||
            !sideMatches.team(row.team) ||
            !sideMatches.conference(row.teamId)
          )
            continue;
          teamGames.push({
            gameId,
            season: row.season,
            week: row.week,
            seasonType: row.seasonType as SeasonType,
            startDate: row.startDate.toISOString(),
            teamId: row.teamId,
            team: row.team,
            conference: affiliation.get(row.teamId)!.conference,
            opponent: rows.find((other) => other.teamId !== row.teamId)!.team,
          });
          if (selectedIds.at(-1) !== gameId) selectedIds.push(gameId);
        }
      }
      if (!selectedIds.length) return emptyRead();
      if (mode !== 'plays') {
        const events = await factsQuery(trx, selectedIds, mode === 'players');
        return { plays: [], events, teamGames };
      }
      const source = await playsQuery(trx, scope, selectedIds).execute();
      if (source.length > MAX_PUNT_PLAYS)
        throw new UserMessageError(TOO_MANY_RESULTS);
      const projectionStarted = performance.now();
      const ordered: {
        play: PuntingPlay;
        startDate: string;
        driveNumber: number | null;
        playNumber: number | null;
      }[] = [];
      for (const row of source) {
        const teams = gameRows.get(row.gameId)!;
        const punting = teams.find((t) => t.teamId === row.puntingTeamId);
        const receiving = teams.find((t) => t.teamId === row.receivingTeamId);
        if (
          !punting ||
          !receiving ||
          (scope.puntingTeam && !sameName(scope.puntingTeam, punting.team)) ||
          (scope.receivingTeam &&
            !sameName(scope.receivingTeam, receiving.team))
        )
          continue;
        const fact = facts(row);
        ordered.push({
          startDate: punting.startDate.toISOString(),
          driveNumber: row.driveNumber,
          playNumber: row.playNumber,
          play: {
            gameId: row.gameId,
            playId: row.playId,
            driveId: row.driveId,
            season: punting.season,
            week: punting.week,
            seasonType: punting.seasonType as SeasonType,
            puntingTeamId: row.puntingTeamId,
            puntingTeam: punting.team,
            puntingConference: affiliation.get(row.puntingTeamId)!.conference,
            receivingTeamId: row.receivingTeamId,
            receivingTeam: receiving.team,
            receivingConference: affiliation.get(row.receivingTeamId)!
              .conference,
            period: row.period,
            // The interval parser omits zero components.
            clock: {
              minutes: row.clock.minutes ?? 0,
              seconds: row.clock.seconds ?? 0,
            },
            down: row.down,
            distance: row.distance,
            playType: row.playType,
            playText: row.playText,
            punterId: fact.punterId,
            punter: fact.punter,
            receiverId: fact.receiverId,
            receiver: fact.receiver,
            returnerId: fact.returnerId,
            returner: fact.returner,
            blockerId: fact.blockerId,
            blocker: fact.blocker,
            countsAsPunt: fact.countsAsPunt,
            countsAsReturn: fact.countsAsReturn,
            startYardsToGoal:
              row.startYardLine === null ? null : 100 - row.startYardLine,
            puntYards: fact.puntYards,
            returnYards: fact.returnYards,
            returnerYards: fact.returnerYards,
            netPuntYards: fact.netPuntYards,
            kickEndYardline: row.kickEndYardLine,
            endYardline: fact.endYardline,
            isTouchback: fact.isTouchback,
            isFairCatch: fact.isFairCatch,
            isOutOfBounds: fact.isOutOfBounds,
            isDowned: fact.isDowned,
            isBlocked: fact.isBlocked,
            isMuffed: fact.isMuffed,
            isReturnTouchdown: fact.isReturnTouchdown,
            isReceivingTeamTurnover: fact.isReceivingTeamTurnover,
            hasPenalty: row.hasPenalty,
            parseStatus: row.parseStatus as PuntParseStatus,
          },
        });
      }
      ordered.sort(
        (a, b) =>
          a.startDate.localeCompare(b.startDate) ||
          a.play.gameId - b.play.gameId ||
          compareOrder(a.driveNumber, b.driveNumber) ||
          compareOrder(a.playNumber, b.playNumber) ||
          compareId(a.play.playId, b.play.playId),
      );
      onProject?.(performance.now() - projectionStarted);
      return {
        plays: ordered.map(({ play }) => play),
        events: [],
        teamGames,
      };
    });
}

/** Times the aggregate reduction for the opt-in benchmark. */
function reduce<T>(
  onProject: ((ms: number) => void) | undefined,
  run: () => T,
) {
  const started = performance.now();
  const rows = run();
  onProject?.(performance.now() - started);
  return rows;
}

function boundedResponse<T>(rows: T[]): T[] {
  if (Buffer.byteLength(JSON.stringify(rows)) > MAX_PUNT_RESPONSE_BYTES)
    throw new UserMessageError(TOO_MANY_RESULTS);
  return rows;
}

export async function getPuntingPlays(
  query: PuntPlayQuery,
  db = kdb,
  onProject?: (ms: number) => void,
): Promise<PuntingPlay[]> {
  const scope = validate(query, 'plays');
  const { plays } = await readPunts(db, scope, 'plays', onProject);
  return boundedResponse(plays);
}

export async function getPlayerPuntingBySeason(
  query: PuntPlayerQuery,
  db = kdb,
  onProject?: (ms: number) => void,
): Promise<PlayerPuntingSeason[]> {
  const scope = validate(query, 'players');
  const { events, teamGames } = await readPunts(db, scope, 'players');
  return boundedResponse(
    reduce(onProject, () =>
      aggregatePlayerSeasons(events, teamGames, scope.playerId),
    ),
  );
}

export async function getPlayerPuntingByGame(
  query: PuntPlayerQuery,
  db = kdb,
  onProject?: (ms: number) => void,
): Promise<PlayerPuntingGame[]> {
  const scope = validate(query, 'players');
  const { events, teamGames } = await readPunts(db, scope, 'players');
  return boundedResponse(
    reduce(onProject, () =>
      aggregatePlayerGames(events, teamGames, scope.playerId),
    ),
  );
}

export async function getTeamPuntingBySeason(
  query: PuntTeamQuery,
  db = kdb,
  onProject?: (ms: number) => void,
): Promise<TeamPuntingSeason[]> {
  const scope = validate(query, 'teams');
  const { events, teamGames } = await readPunts(db, scope, 'teams');
  return boundedResponse(
    reduce(onProject, () => aggregateTeamSeasons(events, teamGames)),
  );
}

export async function getTeamPuntingByGame(
  query: PuntTeamQuery,
  db = kdb,
  onProject?: (ms: number) => void,
): Promise<TeamPuntingGame[]> {
  const scope = validate(query, 'teams');
  const { events, teamGames } = await readPunts(db, scope, 'teams');
  return boundedResponse(
    reduce(onProject, () => aggregateTeamGames(events, teamGames)),
  );
}

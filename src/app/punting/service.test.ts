import {
  CamelCasePlugin,
  CompiledQuery,
  DatabaseConnection,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  QueryResult,
  TransactionSettings,
} from 'kysely';
import { ValidateError } from 'tsoa';

import { DB } from '../../config/types/db';
import { interpretPuntRoles, normalizePunt, PuntSourcePlay } from './core';
import observed from './core/fixtures/observed.json';
import synthetic from './core/fixtures/synthetic.json';
import { UserMessageError } from '../../globals';
import { DivisionClassification, SeasonType } from '../enums';
import {
  getPlayerPuntingByGame,
  getPlayerPuntingBySeason,
  getPuntingPlays,
  getTeamPuntingByGame,
  getTeamPuntingBySeason,
  MAX_PUNT_PLAYS,
} from './service';
import { PlayerPuntingSeason, PuntPlayQuery } from './types';
import spec from '../../../build/swagger.json';

jest.mock('../../config/database', () => ({ kdb: {} }));

type Row = Record<string, unknown>;
const punterId = '90071992547409935';
const returnerId = '111';
const source = (name: string): PuntSourcePlay => {
  const fixture = synthetic.find((f) => f.name === name);
  if (!fixture) throw new Error(`Unknown fixture ${name}`);
  return fixture.source;
};
const role = (
  playId: string,
  athleteId: string,
  statTypeId: number,
  stat: number,
  name: string,
) => ({
  playId,
  athleteId,
  statTypeId,
  stat,
  name,
  firstName: null,
  lastName: null,
});

// Stored punt rows as the services writer produces them: normalized facts plus
// actors credited from owned roles and matched roster evidence.
function fixture(sources: PuntSourcePlay[], associated = true) {
  const participants: Row[] = [];
  const memberships: Row[] = [];
  const seen = new Set<number>();
  const plays: Row[] = [];
  sources.forEach((s, index) => {
    if (!seen.has(s.gameId)) {
      seen.add(s.gameId);
      for (const [teamId, homeAway] of [
        [s.homeTeamId, 'home'],
        [s.awayTeamId, 'away'],
      ] as const) {
        participants.push({
          gameId: s.gameId,
          season: 2026,
          week: 0,
          seasonType: 'regular',
          startDate: new Date('2026-09-01T00:00:00Z'),
          status: 'completed',
          teamId,
          team: `Team ${teamId}`,
          homeAway,
          hasPunts: true,
        });
        memberships.push({
          gameId: s.gameId,
          teamId,
          conference: `Conference ${teamId}`,
          abbreviation: `C${teamId}`,
          division: 'fbs',
        });
      }
    }
    const id =
      sources.length === 1 ? s.id : `${90071992547409930n + BigInt(index)}`;
    const e = normalizePunt({ ...s, id });
    if (!e || e.parseStatus === 'excluded') return;
    const roles: ReturnType<typeof role>[] = [];
    const names: Record<string, string> = {};
    const add = (
      athleteId: string,
      type: number,
      stat: number,
      name: string,
    ) => {
      roles.push(role(id, athleteId, type, stat, name));
      names[athleteId] = name;
    };
    if (associated) {
      if (e.punterToken) {
        add(punterId, 31, 1, 'Alex Punter');
        if (e.countsAsPlayerPunt === true) {
          add(punterId, 27, 1, 'Alex Punter');
          if (e.puntYards !== null)
            add(punterId, 16, e.puntYards, 'Alex Punter');
        }
      }
      if (e.receiverToken) add(returnerId, 30, 1, 'Ben Returner');
      if (e.countsAsPlayerReturn === true && e.returnerToken) {
        add(returnerId, 29, 1, 'Ben Returner');
        if (e.individualReturnYards !== null)
          add(returnerId, 28, e.individualReturnYards, 'Ben Returner');
      }
      if (e.blockerToken) add('112', 17, 1, 'Ben Blocker');
    }
    const matched = (athleteId: string) => ({
      athleteId,
      status: 'matched' as const,
    });
    const credit = interpretPuntRoles(
      e,
      roles,
      associated
        ? {
            punter: matched(punterId),
            receiver: matched(returnerId),
            returner: matched(returnerId),
            blocker: matched('112'),
          }
        : {},
    );
    const actor = (athleteId: string | null) =>
      athleteId === null ? null : names[athleteId];
    plays.push({
      playId: id,
      gameId: s.gameId,
      driveId: s.driveId,
      driveNumber: s.driveNumber,
      playNumber: s.playNumber,
      puntingTeamId: s.puntingTeamId,
      receivingTeamId: s.receivingTeamId,
      period: 1,
      clock: { minutes: 8, seconds: index } as {
        minutes?: number;
        seconds?: number;
      },
      down: 4,
      distance: s.distance,
      playType: 'Punt',
      playText: s.playText,
      countsAsPunt: e.countsAsPunt,
      countsAsPlayerPunt: e.countsAsPlayerPunt,
      countsAsReturn: e.countsAsReturn,
      countsAsPlayerReturn: e.countsAsPlayerReturn,
      startYardLine: e.startYardLine,
      kickEndYardLine: e.kickEndYardLine,
      endYardLine: e.endYardLine,
      endingPossessionTeamId: e.endingPossessionTeamId,
      puntYards: e.puntYards,
      returnYards: e.returnYards,
      netPuntYards: e.netPuntYards,
      isTouchback: e.touchback,
      isFairCatch: e.fairCatch,
      isOutOfBounds: e.outOfBounds,
      isDowned: e.downed,
      isBlocked: e.blocked,
      isMuffed: e.muffed,
      isReturnTouchdown: e.returnTouchdown,
      isReceivingTeamTurnover: e.receivingPossessionLost,
      hasPenalty: e.penaltyPresent,
      punterId: credit.punter.athleteId,
      punter: actor(credit.punter.athleteId),
      receiverId: credit.receiver.athleteId,
      receiver: actor(credit.receiver.athleteId),
      returnerId: credit.returner.athleteId,
      returner: actor(credit.returner.athleteId),
      returnerYards: credit.returner.yards,
      blockerId: credit.blocker.athleteId,
      blocker: actor(credit.blocker.athleteId),
      parseStatus: e.parseStatus,
    });
  });
  return { participants, memberships, plays };
}
type Fixture = ReturnType<typeof fixture>;

function database(data: Fixture) {
  const queries: CompiledQuery[] = [];
  const transactions: TransactionSettings[] = [];
  class FixtureDriver extends DummyDriver {
    async beginTransaction(
      _connection?: DatabaseConnection,
      settings?: TransactionSettings,
    ): Promise<void> {
      if (settings) transactions.push(settings);
    }
    async acquireConnection(): Promise<DatabaseConnection> {
      return {
        async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
          queries.push(query);
          if (!/^select /i.test(query.sql))
            throw new Error('Only reads are permitted');
          const table = query.sql.match(/from "([^"]+)"/)?.[1];
          const rows = query.sql.includes('from "game" as "g"')
            ? data.participants
            : table === 'conference_team'
              ? data.memberships
              : table === 'punt_play'
                ? data.plays
                : [];
          // Test-only rows for the real typed query compiler; no PostgreSQL I/O.
          return { rows: rows as R[] };
        },
        async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
          yield { rows: [] };
        },
      };
    }
  }
  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new FixtureDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin()],
  });
  return { db, queries, transactions };
}

const byPlayer = (rows: PlayerPuntingSeason[], playerId: string) =>
  rows.find((row) => row.playerId === playerId);

test.each([
  {},
  { year: 2026 },
  { year: 2026, conference: 'C1' },
  { year: 2026, team: ' ' },
  { gameId: 0 },
  { gameId: Number.MAX_SAFE_INTEGER + 1 },
  { year: 2026, week: -1 },
  { year: 2026, week: 0.5 },
  { year: 2026, week: 0, punterId: '123x' },
  { year: 2026, week: 0, returnerId: '9223372036854775808' },
])('rejects invalid scope before any database reads: %j', async (query) => {
  const { db, queries } = database(fixture([]));
  await expect(
    getPuntingPlays(query as PuntPlayQuery, db),
  ).rejects.toBeInstanceOf(ValidateError);
  expect(queries).toHaveLength(0);
  await db.destroy();
});

test('aggregates require year and validate player IDs', async () => {
  const { db, queries } = database(fixture([]));
  await expect(
    getTeamPuntingBySeason({} as { year: number }, db),
  ).rejects.toMatchObject({ fields: { year: expect.anything() } });
  await expect(
    getPlayerPuntingByGame({ year: 2026, playerId: 'abc' }, db),
  ).rejects.toMatchObject({ fields: { playerId: expect.anything() } });
  expect(queries).toHaveLength(0);
  await db.destroy();
});

test('week zero reads stored punts in three scoped queries inside one snapshot', async () => {
  const data = fixture([source('ordinary return')]);
  data.memberships.push(...data.memberships);
  const { db, queries, transactions } = database(data);
  const plays = await getPuntingPlays({ year: 2026, week: 0 }, db);
  expect(plays).toHaveLength(1);
  expect(plays[0]).toMatchObject({
    playId: '90071992547409930',
    punterId,
    punter: 'Alex Punter',
    returnerId,
    returner: 'Ben Returner',
    puntingConference: 'C1',
    receivingConference: 'C2',
    seasonType: 'regular',
    puntYards: 50,
    returnYards: 12,
    returnerYards: 12,
    netPuntYards: 38,
    startYardsToGoal: 70,
    clock: { minutes: 8, seconds: 0 },
  });
  expect(transactions).toEqual([
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  ]);
  expect(queries).toHaveLength(3);
  expect(queries[0].parameters).toContain(0);
  expect(queries[0].parameters).toContain('fbs');
  expect(queries[0].sql).toContain('"eligible"."game_id" = "g"."id"');
  expect(queries[0].sql).toContain(
    '"eligible"."team_id" in (select "ct"."team_id"',
  );
  expect(queries[0].sql).toContain('from "punt_play" as "stored"');
  expect(queries[0].sql).not.toContain('lateral');
  expect(queries[1].sql).toContain('"ct"."team_id" = any(');
  expect(queries[2].sql).toContain('from "punt_play" as "pp"');
  expect(queries[2].sql).toContain('"pp"."game_id" = any(');
  expect(queries[2].parameters).toContainEqual([100]);
  expect(queries[2].parameters).toContain(MAX_PUNT_PLAYS + 1);
  for (const query of queries) {
    expect(query.sql).not.toContain('~*');
    expect(query.sql).not.toContain('play_stat');
  }
  await db.destroy();
});

test('game-only reads use the stored season for affiliations', async () => {
  const data = fixture([source('ordinary return')]);
  data.participants.forEach((row) => {
    row.season = 2024;
  });
  const { db, queries } = database(data);
  const plays = await getPuntingPlays({ gameId: 100 }, db);
  expect(plays[0].season).toBe(2024);
  expect(queries[1].parameters).toEqual([[1, 2], 2024, 2024]);
  await db.destroy();
});

test('play filters match either participant; side filters match one side', async () => {
  const data = fixture([source('ordinary return')]);
  data.memberships[1].division = 'fcs';
  const { db } = database(data);
  const [play] = await getPuntingPlays({ gameId: 100 }, db);
  for (const query of [
    { classification: DivisionClassification.FCS },
    { team: ' team 2 ' },
    { receivingTeam: 'TEAM 2' },
    { puntingTeam: 'Team 1' },
    { conference: 'conference 2' },
    { conference: 'c1' },
  ])
    expect(await getPuntingPlays({ gameId: 100, ...query }, db)).toEqual([
      play,
    ]);
  for (const query of [
    { classification: DivisionClassification.II },
    { team: 'Team 3' },
    { puntingTeam: 'Team 2' },
    { receivingTeam: 'Team 1' },
    { conference: 'C3' },
  ])
    expect(await getPuntingPlays({ gameId: 100, ...query }, db)).toEqual([]);
  await db.destroy();
});

test('aggregate filters match the represented team', async () => {
  const data = fixture([source('ordinary return')]);
  data.memberships[1].division = 'fcs';
  const { db } = database(data);
  const teams = async (query: object) =>
    (await getTeamPuntingBySeason({ year: 2026, ...query }, db)).map(
      (row) => row.team,
    );
  expect(await teams({})).toEqual(['Team 1']);
  expect(await teams({ classification: DivisionClassification.FCS })).toEqual([
    'Team 2',
  ]);
  expect(await teams({ conference: 'C1' })).toEqual(['Team 1']);
  expect(await teams({ conference: 'C2' })).toEqual([]);
  const players = await getPlayerPuntingBySeason({ year: 2026 }, db);
  expect(players.map((row) => row.playerId)).toEqual([punterId]);
  await db.destroy();
});

test('zero clock components omitted by the interval parser remain zero', async () => {
  const data = fixture([source('ordinary return')]);
  data.plays[0].clock = {};
  const { db } = database(data);
  expect((await getPuntingPlays({ gameId: 100 }, db))[0].clock).toEqual({
    minutes: 0,
    seconds: 0,
  });
  await db.destroy();
});

test('gameId combines with year and week filters instead of rejecting', async () => {
  const { db, queries } = database(fixture([source('ordinary return')]));
  await getPuntingPlays({ gameId: 100, year: 2025, week: 3 }, db);
  expect(queries[0].sql).toContain('"g"."id" =');
  expect(queries[0].sql).toContain('"g"."season" =');
  expect(queries[0].sql).toContain('"g"."week" =');
  expect(queries[0].parameters).toEqual(expect.arrayContaining([100, 2025, 3]));
  await db.destroy();
});

test('aggregate reads use stored punts only; teams skip names', async () => {
  const { db, queries } = database(fixture([source('ordinary return')]));
  await getTeamPuntingBySeason({ year: 2026 }, db);
  expect(queries).toHaveLength(3);
  expect(queries[2].sql).toMatch(/^select .* from "punt_play" as "pp" where/);
  expect(queries[2].sql).not.toContain('join');
  queries.length = 0;
  const [punter] = await getPlayerPuntingBySeason({ year: 2026 }, db);
  expect(punter.player).toBe('Alex Punter');
  expect(queries[2].sql).toContain('left join "athlete" as "punter"');
  expect(queries[2].sql).not.toContain('"play"');
  expect(queries[2].sql).not.toContain('play_text');
  await db.destroy();
});

test('player filters use credited stored punts; no roster lookup', async () => {
  const { db, queries } = database(fixture([source('ordinary return')]));
  expect(
    await getPuntingPlays({ year: 2026, punterId, returnerId }, db),
  ).toHaveLength(1);
  expect(queries[0].sql).toContain('from "punt_play" as "pp"');
  expect(queries[0].sql).toContain('"pp"."punter_id" =');
  expect(queries[0].parameters).toEqual(
    expect.arrayContaining([punterId, returnerId]),
  );
  expect(queries[2].sql).toContain('"pp"."punter_id" =');
  expect(queries[2].sql).toContain('"pp"."returner_id" =');
  expect(queries.some((q) => q.sql.includes('athlete_team'))).toBe(false);
  queries.length = 0;
  await getPlayerPuntingBySeason({ year: 2026, playerId: punterId }, db);
  for (const column of [
    'punter_id',
    'receiver_id',
    'returner_id',
    'blocker_id',
  ])
    expect(queries[0].sql).toContain(`"pp"."${column}" =`);
  await db.destroy();
});

test('supported penalty return credit agrees across plays and reductions', async () => {
  const ordinary = source('ordinary return');
  const { db } = database(
    fixture([
      {
        ...ordinary,
        playText:
          ordinary.playText +
          ' PENALTY DEF Holding during the return 10 yards from DEF26 to DEF16',
      },
    ]),
  );
  const [play] = await getPuntingPlays({ gameId: 100 }, db);
  expect(play).toMatchObject({
    countsAsReturn: true,
    hasPenalty: true,
    returnYards: 6,
    returnerYards: 6,
    endYardline: 84,
    netPuntYards: 44,
  });
  const players = await getPlayerPuntingBySeason(
    { year: 2026, classification: DivisionClassification.FBS },
    db,
  );
  expect(byPlayer(players, returnerId)).toMatchObject({
    punting: null,
    returning: { returnYards: 6, returnYardsAvailable: 1, returns: 1 },
  });
  const teams = await getTeamPuntingBySeason({ year: 2026 }, db);
  expect(teams.map((row) => row.team)).toEqual(['Team 1', 'Team 2']);
  expect(teams[0].punting).toMatchObject({ returnYards: 6, netPuntYards: 44 });
  expect(teams[1].returning).toEqual(teams[0].punting);
  await db.destroy();
});

test('valid safe-integer IDs outside PostgreSQL storage return empty without an overflowing read', async () => {
  const { db, queries } = database(fixture([source('ordinary return')]));
  expect(
    await getPuntingPlays({ gameId: Number.MAX_SAFE_INTEGER }, db),
  ).toEqual([]);
  expect(queries).toHaveLength(0);
  await db.destroy();
});

test.each(observed)('projects observed canonical facts: $name', async (f) => {
  const { db } = database(fixture([f.source], false));
  const plays = await getPuntingPlays({ gameId: f.source.gameId }, db);
  const event = normalizePunt(f.source)!;
  if (event.parseStatus === 'excluded') {
    expect(plays).toEqual([]);
    return db.destroy();
  }
  expect(plays).toHaveLength(1);
  expect(plays[0]).toMatchObject({
    countsAsPunt: event.countsAsPunt,
    puntYards: event.puntYards,
    returnYards: event.returnYards,
    startYardsToGoal: event.yardsToGoal,
    endYardline: event.endYardLine,
    netPuntYards: event.netPuntYards,
    parseStatus: event.parseStatus,
  });
  expect(plays[0].punterId).toBeNull();
  await db.destroy();
});

test('team and player totals reduce the same events with independent denominators', async () => {
  const data = fixture(
    [
      'negative return',
      'zero return',
      'fair catch',
      'touchback',
      'unknown gross',
      'nullified touchback',
    ].map(source),
  );
  const { db } = database(data);
  const plays = await getPuntingPlays({ gameId: 100 }, db);
  expect(plays).toHaveLength(5);
  const [team, opponent] = await getTeamPuntingBySeason({ year: 2026 }, db);
  expect(team.punting).toMatchObject({
    punts: 5,
    puntYards: 220,
    puntYardsAvailable: 4,
    yardsPerPunt: 55,
    returns: 3,
    returnYards: 7,
    returnYardsAvailable: 3,
    longestReturn: 12,
    netPuntYards: 205,
    netPuntYardsAvailable: 4,
    netYardsPerPunt: 51.3,
    touchbacks: 1,
    fairCatches: 1,
  });
  expect(opponent.returning).toEqual(team.punting);
  expect(team.punting.puntYards).toBe(
    plays
      .filter((p) => p.countsAsPunt === true)
      .reduce((sum, p) => sum + (p.puntYards ?? 0), 0),
  );
  const [punter] = await getPlayerPuntingBySeason(
    { year: 2026, playerId: punterId },
    db,
  );
  expect(punter).toMatchObject({
    team: 'Team 1',
    conference: 'C1',
    returning: null,
    punting: {
      punts: team.punting.punts,
      puntYards: team.punting.puntYards,
      netPuntYards: team.punting.netPuntYards,
    },
  });
  const [returner] = await getPlayerPuntingBySeason(
    { year: 2026, playerId: returnerId },
    db,
  );
  expect(returner).toMatchObject({
    team: 'Team 2',
    punting: null,
    returning: { returns: 3, returnYards: 7, fairCatches: 1 },
  });
  await db.destroy();
});

test('negative-only longest returns remain negative; unknown yards do not become zero', async () => {
  const { db } = database(
    fixture([
      source('negative return'),
      source('return attempt unknown yards'),
    ]),
  );
  const [team] = await getTeamPuntingBySeason(
    { year: 2026, team: 'Team 1' },
    db,
  );
  expect(team.punting).toMatchObject({
    returns: 2,
    returnYards: -5,
    returnYardsAvailable: 1,
    yardsPerReturn: -5,
    longestReturn: -5,
    returns20Plus: 0,
  });
  await db.destroy();
});

test('known zero gross yards retain their own denominator alongside unknown gross attempts', async () => {
  const { db } = database(
    fixture([source('zero gross punt'), source('unknown gross')]),
  );
  const [player] = await getPlayerPuntingBySeason({ year: 2026 }, db);
  expect(player.punting).toMatchObject({
    punts: 2,
    puntYards: 0,
    puntYardsAvailable: 1,
    yardsPerPunt: 0,
    longestPunt: 0,
    punts50Plus: 0,
    netPuntYards: 0,
    netPuntYardsAvailable: 1,
  });
  await db.destroy();
});

test('chronology uses source order and a deterministic exact-ID fallback for missing order', async () => {
  const data = fixture(
    Array.from({ length: 3 }, () => source('ordinary return')),
  );
  data.plays[0].driveNumber = null;
  data.plays[0].playNumber = null;
  data.plays[1].driveNumber = 2;
  data.plays[2].driveNumber = 1;
  const { db } = database(data);
  const plays = await getPuntingPlays({ gameId: 100 }, db);
  expect(plays.map((play) => play.playId)).toEqual([
    data.plays[2].playId,
    data.plays[1].playId,
    data.plays[0].playId,
  ]);
  await db.destroy();
});

test('team-only accounting and fielding do not manufacture individual return allocation', async () => {
  const { db } = database(
    fixture([
      source('laterals with explicit team total'),
      source('blocked team punt'),
    ]),
  );
  const [team] = await getTeamPuntingBySeason(
    { year: 2026, team: 'Team 1' },
    db,
  );
  expect(team.punting.returnYards).toBe(27);
  const players = await getPlayerPuntingBySeason({ year: 2026 }, db);
  expect(byPlayer(players, returnerId)?.returning).toMatchObject({
    returns: 0,
    returnYardsAvailable: 0,
    returnYards: null,
  });
  expect(byPlayer(players, '112')?.returning).toMatchObject({
    blocks: 1,
    returns: 0,
    returnYards: null,
  });
  expect(byPlayer(players, punterId)?.punting).toMatchObject({
    punts: 1,
    blocked: 1,
  });
  await db.destroy();
});

test('blocked kicker identity supports blocks without individual punt production', async () => {
  const { db } = database(fixture([source('blocked team punt')]));
  const [player] = await getPlayerPuntingBySeason({ year: 2026 }, db);
  expect(player.punting).toEqual(
    expect.objectContaining({
      punts: 0,
      blocked: 1,
      puntYards: null,
      puntYardsAvailable: 0,
      netPuntYards: null,
      netPuntYardsAvailable: 0,
    }),
  );
  await db.destroy();
});

test('aggregates omit games without stored punts, such as seasons not yet backfilled', async () => {
  const data = fixture([source('ordinary return')], false);
  for (const gameId of [101, 102]) {
    data.participants.push(
      ...data.participants
        .slice(0, 2)
        .map((row) => ({ ...row, gameId, hasPunts: gameId === 102 })),
    );
  }
  const { db } = database(data);
  const query = { year: 2026, team: 'Team 1' };
  const [team] = await getTeamPuntingBySeason(query, db);
  expect(team.punting).toMatchObject({ punts: 1, puntYards: 50 });
  expect(
    (await getTeamPuntingByGame(query, db)).map((row) => [
      row.gameId,
      row.opponent,
      row.punting.punts,
    ]),
  ).toEqual([
    [100, 'Team 2', 1],
    [102, 'Team 2', 0],
  ]);
  data.plays = [];
  data.participants = data.participants.filter((row) => row.gameId === 101);
  expect(await getTeamPuntingBySeason(query, db)).toEqual([]);
  data.participants.forEach((row) => {
    row.hasPunts = true;
  });
  expect((await getTeamPuntingBySeason(query, db))[0].punting).toMatchObject({
    punts: 0,
    returns: 0,
    puntYards: null,
  });
  expect(await getPlayerPuntingBySeason({ year: 2026 }, db)).toEqual([]);
  await db.destroy();
});

test('row ceiling rejects the entire response instead of returning a prefix', async () => {
  const data = fixture([source('ordinary return')]);
  data.plays = Array.from({ length: MAX_PUNT_PLAYS + 1 }, () => data.plays[0]);
  const { db, queries } = database(data);
  await expect(
    getPuntingPlays({ year: 2026, week: 0 }, db),
  ).rejects.toBeInstanceOf(UserMessageError);
  expect(queries).toHaveLength(3);
  await db.destroy();
});

test('serialized byte ceiling rejects instead of returning a prefix', async () => {
  const data = fixture([source('ordinary return')]);
  data.plays[0].playText += ` ${'x'.repeat(48 * 1024 * 1024)}`;
  const { db } = database(data);
  await expect(getPuntingPlays({ gameId: 100 }, db)).rejects.toThrow(
    'Too many results',
  );
  await db.destroy();
});

test('query count stays fixed as the selected event population grows and ordering keeps exact IDs', async () => {
  for (const count of [1, 50]) {
    const data = fixture(
      Array.from({ length: count }, () => source('ordinary return')),
    );
    data.plays.reverse();
    const { db, queries } = database(data);
    const plays = await getPuntingPlays(
      { year: 2026, team: 'Team 1', receivingTeam: 'Team 2' },
      db,
    );
    expect(plays).toHaveLength(count);
    expect(plays.map((p) => p.playId)).toEqual(
      [...plays.map((p) => p.playId)].sort(),
    );
    expect(queries).toHaveLength(3);
    await db.destroy();
  }
});

test('generated contract matches the passing and rushing route shape', () => {
  const paths = spec.paths;
  const operations = {
    '/punting/plays': 'GetPuntingPlays',
    '/punting/players/season': 'GetPlayerPuntingBySeason',
    '/punting/players/games': 'GetPlayerPuntingByGame',
    '/punting/teams/season': 'GetTeamPuntingBySeason',
    '/punting/teams/games': 'GetTeamPuntingByGame',
  } as const;
  for (const [path, operationId] of Object.entries(operations)) {
    const route = paths[path as keyof typeof operations].get;
    expect(route.operationId).toBe(operationId);
    expect(route.responses['200'].content['application/json'].schema.type).toBe(
      'array',
    );
    expect(route.security).toEqual([{ apiKey: [] }]);
    const parameters: { name: string; required?: boolean; schema: object }[] =
      route.parameters;
    expect(parameters.find((p) => p.name === 'seasonType')?.schema).toEqual({
      $ref: '#/components/schemas/SeasonType',
    });
    expect(parameters.find((p) => p.name === 'classification')?.schema).toEqual(
      { $ref: '#/components/schemas/DivisionClassification' },
    );
    expect(parameters.some((p) => p.name === 'perspective')).toBe(false);
    expect(parameters.find((p) => p.name === 'year')?.required).toBe(
      path !== '/punting/plays',
    );
  }
  expect(
    Object.keys(spec.components.schemas).filter((name) =>
      /^Punt(Perspective|Classification|SeasonType)$/.test(name),
    ),
  ).toEqual([]);
  expect(spec.components.schemas.PuntingPlay.properties.week).toEqual({
    type: 'integer',
    format: 'int32',
  });
});

test('excluded candidates are omitted; unresolved accounting does not count', async () => {
  const { db } = database(
    fixture(
      ['fake punt', 'nullified touchback', 'ambiguous candidate'].map(source),
      false,
    ),
  );
  expect(await getPuntingPlays({ gameId: 100 }, db)).toHaveLength(1);
  const [team] = await getTeamPuntingBySeason(
    { year: 2026, team: 'Team 1' },
    db,
  );
  expect(team.punting).toMatchObject({
    punts: 0,
    puntYards: null,
    puntYardsAvailable: 0,
    touchbacks: 0,
  });
  expect(
    Object.values(team.punting).some(
      (value) => typeof value === 'number' && !Number.isFinite(value),
    ),
  ).toBe(false);
  await db.destroy();
});

test('inside-20 uses final receiving possession strictly past 80 and excludes touchbacks', async () => {
  const { db } = database(
    fixture(['negative return', 'zero return', 'touchback'].map(source)),
  );
  const [team] = await getTeamPuntingBySeason(
    { year: 2026, team: 'Team 1' },
    db,
  );
  expect(team.punting.inside20).toBe(1);
  await db.destroy();
});

test('event-time teams keep transferred athletes in separate rows', async () => {
  const ordinary = source('ordinary return');
  const data = fixture([
    ordinary,
    {
      ...ordinary,
      gameId: 101,
      puntingTeamId: 2,
      receivingTeamId: 1,
      yardLine: 70,
      playText:
        'A.Punter punt 50 yards to OFF20 B.Returner return 12 yards to OFF32',
    },
  ]);
  const { db } = database(data);
  const seasons = await getPlayerPuntingBySeason(
    { year: 2026, playerId: punterId },
    db,
  );
  expect(
    seasons.map((player) => [
      player.team,
      player.playerId,
      player.punting?.punts,
    ]),
  ).toEqual([
    ['Team 1', punterId, 1],
    ['Team 2', punterId, 1],
  ]);
  const games = await getPlayerPuntingByGame(
    { year: 2026, playerId: punterId },
    db,
  );
  expect(
    games.map((player) => [player.gameId, player.team, player.opponent]),
  ).toEqual([
    [100, 'Team 1', 'Team 2'],
    [101, 'Team 2', 'Team 1'],
  ]);
  await db.destroy();
});

test.each([
  'empty',
  'scheduled',
  'spring',
  'invalid participants',
  'ambiguous division',
  'postseason excluded',
])('valid empty scope preserves honest eligibility: %s', async (reason) => {
  const data = fixture([source('ordinary return')]);
  if (reason === 'empty') data.participants = [];
  if (reason === 'scheduled')
    data.participants.forEach((row) => {
      row.status = 'scheduled';
    });
  if (reason === 'spring')
    data.participants.forEach((row) => {
      row.seasonType = 'spring_regular';
    });
  if (reason === 'invalid participants')
    data.participants.push(data.participants[0]);
  if (reason === 'ambiguous division')
    data.memberships.push(
      { ...data.memberships[0], division: 'fcs' },
      { ...data.memberships[1], division: 'fcs' },
    );
  if (reason === 'postseason excluded')
    data.participants.forEach((row) => {
      row.seasonType = 'postseason';
    });
  const { db } = database(data);
  expect(
    await getPuntingPlays({ gameId: 100, seasonType: SeasonType.Regular }, db),
  ).toEqual([]);
  await db.destroy();
});

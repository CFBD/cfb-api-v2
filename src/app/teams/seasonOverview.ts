import { CamelCasePlugin, Kysely } from 'kysely';
import { ValidateError } from 'tsoa';
import { kdb } from '../../config/database';
import { DB } from '../../config/types/db';
import { isTeamSeasonSnapshotPayload } from './seasonOverviewPayload';
import { formatSeasonAdvancedStats } from './seasonOverviewFormatting';
import { seasonOverviewRatings } from './seasonOverviewRatings';
import { TeamSeasonOverview } from './seasonOverviewTypes';

export const seasonOverviewQuery = (
  db: Kysely<DB>,
  year: number,
  team: string,
) =>
  seasonOverviewRatings(
    db
      .withoutPlugins()
      .withPlugin(new CamelCasePlugin({ maintainNestedObjectKeys: true })),
    year,
  )
    .selectFrom('team as t')
    .leftJoin('teamSeasonSnapshot as snapshot', (join) =>
      join
        .onRef('snapshot.teamId', '=', 't.id')
        .on('snapshot.season', '=', year),
    )
    .leftJoin('rankedCore as core', (join) =>
      join
        .onRef('core.teamId', '=', 'snapshot.teamId')
        .onRef('core.year', '=', 'snapshot.season'),
    )
    .leftJoin('rankedSrs as srs', (join) =>
      join
        .onRef('srs.teamId', '=', 'snapshot.teamId')
        .onRef('srs.year', '=', 'snapshot.season'),
    )
    .leftJoin('rankedSp as sp', (join) =>
      join
        .onRef('sp.teamId', '=', 'snapshot.teamId')
        .onRef('sp.year', '=', 'snapshot.season'),
    )
    .leftJoin('rankedFpi as fpi', (join) =>
      join
        .onRef('fpi.teamId', '=', 'snapshot.teamId')
        .onRef('fpi.year', '=', 'snapshot.season'),
    )
    .leftJoinLateral(
      (eb) =>
        eb
          .selectFrom('game as g')
          .innerJoin('gameTeam as gt', 'gt.gameId', 'g.id')
          .innerJoin('gameTeam as opponent', (join) =>
            join
              .onRef('opponent.gameId', '=', 'g.id')
              .onRef('opponent.id', '<>', 'gt.id'),
          )
          .whereRef('gt.teamId', '=', 'snapshot.teamId')
          .whereRef('g.season', '=', 'snapshot.season')
          .where('g.status', '=', 'completed')
          .select((eb) => [
            eb.fn.countAll().as('games'),
            eb.fn.countAll().filterWhere('gt.winner', '=', true).as('wins'),
            eb.fn
              .countAll()
              .filterWhere('opponent.winner', '=', true)
              .as('losses'),
            eb.fn
              .countAll()
              .filterWhere(
                eb.and([
                  eb('gt.winner', '<>', true),
                  eb('opponent.winner', '<>', true),
                ]),
              )
              .as('ties'),
          ])
          .as('record'),
      (join) => join.onTrue(),
    )
    .leftJoinLateral(
      (eb) =>
        eb
          .selectFrom('game as eg')
          .innerJoin('gameTeam as egt', 'egt.gameId', 'eg.id')
          .whereRef('egt.teamId', '=', 'snapshot.teamId')
          .whereRef('eg.season', '=', 'snapshot.season')
          .where('eg.status', '=', 'completed')
          .where('egt.endElo', 'is not', null)
          .orderBy('eg.startDate', 'desc')
          .orderBy('eg.id', 'desc')
          .select('egt.endElo')
          .limit(1)
          .as('elo'),
      (join) => join.onTrue(),
    )
    .where((eb) =>
      eb(eb.fn<string>('lower', ['t.school']), '=', team.toLowerCase()),
    )
    .select([
      't.id as teamId',
      't.school as team',
      'snapshot.teamId as snapshotTeamId',
      'snapshot.season',
      'snapshot.formatVersion',
      'snapshot.payload',
      'record.games',
      'record.wins',
      'record.losses',
      'record.ties',
      'core.overall as coreOverall',
      'core.offense as coreOffense',
      'core.defense as coreDefense',
      'core.teamId as coreTeamId',
      'srs.rating as srsRating',
      'elo.endElo as eloRating',
      'sp.teamId as spTeamId',
      'sp.rating as spOverall',
      'sp.oRating as spOffense',
      'sp.dRating as spDefense',
      'sp.stRating as spSpecialTeams',
      'core.overallRank as coreOverallRank',
      'core.offenseRank as coreOffenseRank',
      'core.defenseRank as coreDefenseRank',
      'srs.ratingRank as srsRank',
      'sp.ratingRank as spOverallRank',
      'sp.oRatingRank as spOffenseRank',
      'sp.dRatingRank as spDefenseRank',
      'sp.stRatingRank as spSpecialTeamsRank',
      'fpi.teamId as fpiTeamId',
      'fpi.overallEfficiency as fpiOverall',
      'fpi.offensiveEfficiency as fpiOffense',
      'fpi.defensiveEfficiency as fpiDefense',
      'fpi.specialTeamsEfficiency as fpiSpecialTeams',
      'fpi.overallEfficiencyRank as fpiOverallRank',
      'fpi.offensiveEfficiencyRank as fpiOffenseRank',
      'fpi.defensiveEfficiencyRank as fpiDefenseRank',
      'fpi.specialTeamsEfficiencyRank as fpiSpecialTeamsRank',
    ])
    .limit(2);

export type TeamSeasonOverviewResult =
  | { status: 'found'; overview: TeamSeasonOverview }
  | { status: 'not-found' }
  | { status: 'unavailable' };

export const isTeamSeasonStorageError = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  (error.code === '42P01' || error.code === '42501') &&
  /(?:relation|table) "?(?:public\.)?team_season_snapshot"?(?: does not exist|$)/.test(
    error.message,
  );

const rankedRating = (value: string | number | null, rank: string | null) => ({
  rating: value == null ? null : Math.round(Number(value) * 100) / 100,
  rank: value == null || rank == null ? null : Number(rank),
});

type RatingRow = Awaited<
  ReturnType<ReturnType<typeof seasonOverviewQuery>['execute']>
>[number];
export const mapSeasonOverviewRatings = (
  row: Pick<
    RatingRow,
    | 'fpiTeamId'
    | 'coreTeamId'
    | 'spTeamId'
    | 'eloRating'
    | 'fpiOverall'
    | 'fpiOffense'
    | 'fpiDefense'
    | 'fpiSpecialTeams'
    | 'coreOverall'
    | 'coreOffense'
    | 'coreDefense'
    | 'srsRating'
    | 'spOverall'
    | 'spOffense'
    | 'spDefense'
    | 'spSpecialTeams'
    | 'fpiOverallRank'
    | 'fpiOffenseRank'
    | 'fpiDefenseRank'
    | 'fpiSpecialTeamsRank'
    | 'coreOverallRank'
    | 'coreOffenseRank'
    | 'coreDefenseRank'
    | 'srsRank'
    | 'spOverallRank'
    | 'spOffenseRank'
    | 'spDefenseRank'
    | 'spSpecialTeamsRank'
  >,
): TeamSeasonOverview['ratings'] => ({
  fpi:
    row.fpiTeamId == null
      ? null
      : {
          overall: rankedRating(row.fpiOverall, row.fpiOverallRank),
          offense: rankedRating(row.fpiOffense, row.fpiOffenseRank),
          defense: rankedRating(row.fpiDefense, row.fpiDefenseRank),
          specialTeams: rankedRating(
            row.fpiSpecialTeams,
            row.fpiSpecialTeamsRank,
          ),
        },
  core:
    row.coreTeamId == null
      ? null
      : {
          overall: rankedRating(row.coreOverall, row.coreOverallRank),
          offense: rankedRating(row.coreOffense, row.coreOffenseRank),
          defense: rankedRating(row.coreDefense, row.coreDefenseRank),
        },
  elo: row.eloRating ?? null,
  srs: row.srsRating == null ? null : rankedRating(row.srsRating, row.srsRank),
  sp:
    row.spTeamId == null
      ? null
      : {
          overall: rankedRating(row.spOverall, row.spOverallRank),
          offense: rankedRating(row.spOffense, row.spOffenseRank),
          defense: rankedRating(row.spDefense, row.spDefenseRank),
          specialTeams: rankedRating(
            row.spSpecialTeams,
            row.spSpecialTeamsRank,
          ),
        },
});

export const getTeamSeasonOverview = async (
  year: number,
  team: string,
  db: Kysely<DB> = kdb,
): Promise<TeamSeasonOverviewResult> => {
  if (!Number.isSafeInteger(year) || year <= 0)
    throw new ValidateError(
      {
        year: { value: year, message: 'year must be a positive safe integer' },
      },
      'Validation error',
    );
  if (typeof team !== 'string' || !team.trim())
    throw new ValidateError(
      { team: { value: team, message: 'team must be a nonblank school name' } },
      'Validation error',
    );
  const started = Date.now();
  const log = (reason: string, teamId?: number) =>
    console.info('Team season overview', {
      season: year,
      teamId,
      reason,
      elapsedMs: Date.now() - started,
    });
  let rows;
  try {
    rows = await seasonOverviewQuery(db, year, team.trim()).execute();
  } catch (error) {
    if (!isTeamSeasonStorageError(error)) throw error;
    log('snapshot-storage');
    return { status: 'unavailable' };
  }
  if (rows.length > 1)
    throw new ValidateError(
      { team: { value: team, message: 'Ambiguous school name' } },
      'Validation error',
    );
  const row = rows[0];
  const teamId = row?.teamId;
  if (!row || row.snapshotTeamId === null) {
    log(row ? 'missing-snapshot' : 'unknown-team', teamId);
    return { status: 'not-found' };
  }
  if (row.formatVersion !== 1) {
    log('unsupported-format', teamId);
    return { status: 'unavailable' };
  }
  if (
    row.season !== year ||
    row.snapshotTeamId !== row.teamId ||
    !isTeamSeasonSnapshotPayload(row.payload, year, row.team)
  ) {
    log('invalid-payload', teamId);
    return { status: 'unavailable' };
  }
  log('hit', teamId);
  return {
    status: 'found',
    overview: {
      teamId: row.teamId,
      team: row.team,
      season: year,
      record: {
        games: Number(row.games ?? 0),
        wins: Number(row.wins ?? 0),
        losses: Number(row.losses ?? 0),
        ties: Number(row.ties ?? 0),
      },
      ratings: mapSeasonOverviewRatings(row),
      advanced: formatSeasonAdvancedStats(row.payload.advanced),
      players: row.payload.players,
      passing: row.payload.passing,
      rushing: row.payload.rushing,
    },
  };
};

import { CamelCasePlugin, Kysely } from 'kysely';
import { DB } from '../../config/types/db';
import { BoxScoreWire } from './wire';

export const canonicalQuery = (db: Kysely<DB>, id: number) =>
  db
    .selectFrom('game as g')
    .innerJoin('gameTeam as home', (j) =>
      j.onRef('home.gameId', '=', 'g.id').on('home.homeAway', '=', 'home'),
    )
    .innerJoin('gameTeam as away', (j) =>
      j.onRef('away.gameId', '=', 'g.id').on('away.homeAway', '=', 'away'),
    )
    .innerJoin('team as ht', 'ht.id', 'home.teamId')
    .innerJoin('team as at', 'at.id', 'away.teamId')
    .where('g.id', '=', id)
    .select([
      'ht.school as homeTeam',
      'at.school as awayTeam',
      'home.points as homePoints',
      'away.points as awayPoints',
      'home.winProb as homeWinProb',
      'away.winProb as awayWinProb',
      'home.winner as homeWinner',
      'g.excitement',
    ]);

export const snapshotQuery = (db: Kysely<DB>, id: number) =>
  canonicalQuery(
    db
      .withoutPlugins()
      .withPlugin(new CamelCasePlugin({ maintainNestedObjectKeys: true })),
    id,
  )
    .leftJoin('advancedBoxScoreSnapshot as snapshot', 'snapshot.gameId', 'g.id')
    .select(['snapshot.formatVersion', 'snapshot.payload']);

type CanonicalRow = Awaited<
  ReturnType<ReturnType<typeof canonicalQuery>['execute']>
>[number];
export const mapGameInfo = (rows: CanonicalRow[]): BoxScoreWire['gameInfo'] => {
  if (rows.length !== 1)
    throw new Error('Missing or ambiguous box score participants');
  const row = rows[0];
  return {
    homeTeam: row.homeTeam,
    homePoints: row.homePoints,
    homeWinProb: Number(row.homeWinProb),
    awayTeam: row.awayTeam,
    awayPoints: row.awayPoints,
    awayWinProb: Number(row.awayWinProb),
    homeWinner: row.homeWinner,
    excitement: Number(row.excitement),
  };
};

export const isSnapshotStorageError = (error: unknown): boolean => {
  if (!(error instanceof Error) || !('code' in error)) return false;
  return (
    (error.code === '42P01' || error.code === '42501') &&
    /(?:relation|table) "?(?:public\.)?advanced_box_score_snapshot"?(?: does not exist|$)/.test(
      error.message,
    )
  );
};

import { Kysely } from 'kysely';
import { DB } from '../../config/types/db';
import { createPreviewCache } from '../games/previewCache';
import { previewRead } from '../games/previewRead';
import {
  calculateStatCohort,
  STAT_RANK_TTL,
  StatCohort,
  validStatCohort,
} from './seasonStatRankings';

export const seasonStatCohortQuery = (db: Kysely<DB>, season: number) =>
  db
    .with('statMembership', (qb) =>
      qb
        .selectFrom('conferenceTeam as ct')
        .innerJoin('conference as c', 'c.id', 'ct.conferenceId')
        .where('ct.startYear', '<=', season)
        .where((eb) =>
          eb.or([eb('ct.endYear', 'is', null), eb('ct.endYear', '>=', season)]),
        )
        .where('c.division', 'is not', null)
        .groupBy('ct.teamId')
        .select('ct.teamId')
        .select((eb) => eb.fn.min('c.division').as('division'))
        .having((eb) => eb.fn.count('c.division').distinct(), '=', 1),
    )
    .selectFrom('statMembership as m')
    .innerJoin('team as t', 't.id', 'm.teamId')
    .leftJoin('teamSeasonSnapshot as s', (join) =>
      join.onRef('s.teamId', '=', 'm.teamId').on('s.season', '=', season),
    )
    .select([
      'm.teamId',
      't.school as team',
      'm.division',
      's.teamId as snapshotTeamId',
      's.season',
      's.formatVersion',
      's.generatedAt',
    ])
    .select((eb) =>
      eb
        .fn<unknown>('jsonb_extract_path', [
          eb.ref('s.payload'),
          eb.val('advanced'),
        ])
        .as('advanced'),
    );

// Shared by overview and preview; never invoked inside a component cache refresh.
const cache = createPreviewCache(undefined, 'cfb-api:v1:team-stat-rankings:');
export async function getSeasonStatCohort(
  season: number,
  deadline = Date.now() + 3000,
): Promise<StatCohort | null> {
  const started = Date.now();
  let outcome = 'miss';
  try {
    return await cache(
      `catalog:1:season:${season}`,
      STAT_RANK_TTL,
      (v): v is StatCohort => validStatCohort(v, season),
      async () => {
        // Capture read time before the statement, preserving absolute expiry.
        const calculatedAt = Date.now();
        const rows = await previewRead(deadline, (db) =>
          seasonStatCohortQuery(db, season).execute(),
        );
        const result = calculateStatCohort(rows, season, calculatedAt);
        console.info('Team stat rankings', {
          season,
          catalogVersion: 1,
          reportingTeams: Object.keys(result.teams).length,
          elapsedMs: Date.now() - started,
          outcome,
        });
        return result;
      },
      deadline,
      (value) => {
        outcome = value;
      },
    );
  } catch {
    console.info('Team stat rankings', {
      season,
      reason: 'context-unavailable',
      elapsedMs: Date.now() - started,
      outcome,
    });
    return null;
  }
}

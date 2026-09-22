import { ExpressionBuilder, Kysely, StringReference } from 'kysely';
import { DB } from '../../config/types/db';

const rank = <Database, Table extends keyof Database>(
  eb: ExpressionBuilder<Database, Table>,
  division: StringReference<Database, Table>,
  metric: StringReference<Database, Table>,
  direction: 'asc' | 'desc' = 'desc',
) =>
  eb
    .case()
    .when(eb.or([eb(division, 'is', null), eb(metric, 'is', null)]))
    .then(null)
    .else(
      eb.fn
        .agg<string>('rank')
        .over((w) =>
          w
            .partitionBy(division)
            .orderBy(metric, (ob) =>
              (direction === 'asc' ? ob.asc() : ob.desc()).nullsLast(),
            ),
        ),
    )
    .end();

// Rank each full season/division cohort before the overview selects a team.
export const seasonOverviewRatings = (db: Kysely<DB>, year: number) =>
  db
    .with('ratingCohort', (qb) =>
      qb
        .selectFrom('conferenceTeam as ct')
        .innerJoin('conference as c', 'c.id', 'ct.conferenceId')
        .where('ct.startYear', '<=', year)
        .where((eb) =>
          eb.or([eb('ct.endYear', 'is', null), eb('ct.endYear', '>=', year)]),
        )
        .where('c.division', 'is not', null)
        .groupBy('ct.teamId')
        .select('ct.teamId')
        .select((eb) => eb.fn.min('c.division').as('division'))
        // Duplicate matching affiliations cannot inflate a cohort. Ambiguous
        // divisions receive no rank, rather than assigning one arbitrarily.
        .having((eb) => eb.fn.count('c.division').distinct(), '=', 1),
    )
    .with('rankedCore', (qb) =>
      qb
        .selectFrom('coreRatings as r')
        .leftJoin('ratingCohort as c', 'c.teamId', 'r.teamId')
        .where('r.year', '=', year)
        .select(['r.teamId', 'r.year', 'r.overall', 'r.offense', 'r.defense'])
        .select((eb) => [
          rank(eb, 'c.division', 'r.overall', 'desc').as('overallRank'),
          rank(eb, 'c.division', 'r.offense', 'desc').as('offenseRank'),
          rank(eb, 'c.division', 'r.defense', 'asc').as('defenseRank'),
        ]),
    )
    .with('rankedSrs', (qb) =>
      qb
        .selectFrom('srs as r')
        .leftJoin('ratingCohort as c', 'c.teamId', 'r.teamId')
        .where('r.year', '=', year)
        .select(['r.teamId', 'r.year', 'r.rating'])
        .select((eb) => [
          rank(eb, 'c.division', 'r.rating', 'desc').as('ratingRank'),
        ]),
    )
    .with('rankedSp', (qb) =>
      qb
        .selectFrom('ratings as r')
        .leftJoin('ratingCohort as c', 'c.teamId', 'r.teamId')
        .where('r.year', '=', year)
        .select([
          'r.teamId',
          'r.year',
          'r.rating',
          'r.oRating',
          'r.dRating',
          'r.stRating',
        ])
        .select((eb) => [
          rank(eb, 'c.division', 'r.rating', 'desc').as('ratingRank'),
          rank(eb, 'c.division', 'r.oRating', 'desc').as('oRatingRank'),
          rank(eb, 'c.division', 'r.dRating', 'asc').as('dRatingRank'),
          rank(eb, 'c.division', 'r.stRating', 'desc').as('stRatingRank'),
        ]),
    )
    .with('rankedFpi', (qb) =>
      qb
        .selectFrom('fpi as r')
        .leftJoin('ratingCohort as c', 'c.teamId', 'r.teamId')
        .where('r.year', '=', year)
        .select([
          'r.teamId',
          'r.year',
          'r.overallEfficiency',
          'r.offensiveEfficiency',
          'r.defensiveEfficiency',
          'r.specialTeamsEfficiency',
        ])
        .select((eb) => [
          rank(eb, 'c.division', 'r.overallEfficiency', 'desc').as(
            'overallEfficiencyRank',
          ),
          rank(eb, 'c.division', 'r.offensiveEfficiency', 'desc').as(
            'offensiveEfficiencyRank',
          ),
          rank(eb, 'c.division', 'r.defensiveEfficiency', 'desc').as(
            'defensiveEfficiencyRank',
          ),
          rank(eb, 'c.division', 'r.specialTeamsEfficiency', 'desc').as(
            'specialTeamsEfficiencyRank',
          ),
        ]),
    );

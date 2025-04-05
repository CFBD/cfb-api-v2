import { kdb } from '../../config/database';
import { SeasonType } from '../enums';
import { ConferenceSP, TeamElo, TeamFPI, TeamSP, TeamSRS } from './types';
import { ValidateError } from 'tsoa';

export const getSP = async (
  year?: number,
  team?: string,
): Promise<TeamSP[]> => {
  if (!year && !team) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year required when team not specified' },
        team: { value: team, message: 'team required when year not specified' },
      },
      'Validation error',
    );
  }

  let ratingsQuery = kdb
    .selectFrom('ratings')
    .innerJoin('team', 'ratings.teamId', 'team.id')
    .innerJoin('conferenceTeam', (join) =>
      join
        .onRef('team.id', '=', 'conferenceTeam.teamId')
        .on('conferenceTeam.endYear', 'is', null),
    )
    .innerJoin('conference', 'conferenceTeam.conferenceId', 'conference.id')
    .orderBy(['ratings.year', 'ratings.rating desc'])
    .select(['team.school as team', 'conference.name as conference'])
    .select((eb) =>
      eb.fn
        .agg<number>('rank')
        .over((ob) => ob.orderBy('ratings.rating', 'desc'))
        .as('overallRank'),
    )
    .select((eb) =>
      eb.fn
        .agg<number>('rank')
        .over((ob) => ob.orderBy('ratings.oRating', 'desc'))
        .as('offenseRank'),
    )
    .select((eb) =>
      eb.fn
        .agg<number>('rank')
        .over((ob) => ob.orderBy('ratings.dRating', 'desc'))
        .as('defenseRank'),
    )
    .selectAll('ratings');

  let averagesQuery = kdb
    .selectFrom('ratings')
    .groupBy('year')
    .select('year')
    .select((eb) => eb.fn.avg('rating').as('rating'))
    .select((eb) => eb.fn.avg('oRating').as('oRating'))
    .select((eb) => eb.fn.avg('dRating').as('dRating'))
    .select((eb) => eb.fn.avg('stRating').as('stRating'))
    .select((eb) => eb.fn.avg('sos').as('sos'))
    .select((eb) => eb.fn.avg('secondOrderWins').as('secondOrderWins'))
    .select((eb) => eb.fn.avg('oSuccess').as('oSuccess'))
    .select((eb) => eb.fn.avg('oExplosiveness').as('oExplosiveness'))
    .select((eb) => eb.fn.avg('oRushing').as('oRushing'))
    .select((eb) => eb.fn.avg('oPassing').as('oPassing'))
    .select((eb) => eb.fn.avg('oStandardDowns').as('oStandardDowns'))
    .select((eb) => eb.fn.avg('oPassingDowns').as('oPassingDowns'))
    .select((eb) => eb.fn.avg('oRunRate').as('oRunRate'))
    .select((eb) => eb.fn.avg('oPace').as('oPace'))
    .select((eb) => eb.fn.avg('dSuccess').as('dSuccess'))
    .select((eb) => eb.fn.avg('dExplosiveness').as('dExplosiveness'))
    .select((eb) => eb.fn.avg('dRushing').as('dRushing'))
    .select((eb) => eb.fn.avg('dPassing').as('dPassing'))
    .select((eb) => eb.fn.avg('dStandardDowns').as('dStandardDowns'))
    .select((eb) => eb.fn.avg('dPassingDowns').as('dPassingDowns'))
    .select((eb) => eb.fn.avg('dHavoc').as('dHavoc'))
    .select((eb) => eb.fn.avg('dFrontSevenHavoc').as('dFrontSevenHavoc'))
    .select((eb) => eb.fn.avg('dDbHavoc').as('dDbHavoc'))
    .orderBy('year');

  if (year) {
    ratingsQuery = ratingsQuery.where('year', '=', year);
    averagesQuery = averagesQuery.where('year', '=', year);
  }

  if (team) {
    ratingsQuery = ratingsQuery.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
  }

  const ratings = await ratingsQuery.execute();
  const averages = await averagesQuery.execute();

  ratings.push(
    // @ts-ignore
    ...averages.map((a) => ({
      team: 'nationalAverages',
      ...a,
    })),
  );

  return ratings.map(
    (r): TeamSP => ({
      year: r.year,
      team: r.team,
      conference: r.conference,
      rating: parseFloat(r.rating),
      ranking: r.overallRank ? Number(r.overallRank) : null,
      secondOrderWins: r.secondOrderWins ? parseFloat(r.secondOrderWins) : null,
      sos: r.sos ? parseFloat(r.sos) : null,
      offense: {
        ranking: r.offenseRank ? Number(r.offenseRank) : null,
        rating: parseFloat(r.oRating),
        success: r.oSuccess ? parseFloat(r.oSuccess) : null,
        explosiveness: r.oExplosiveness ? parseFloat(r.oExplosiveness) : null,
        rushing: r.oRushing ? parseFloat(r.oRushing) : null,
        passing: r.oPassing ? parseFloat(r.oPassing) : null,
        standardDowns: r.oStandardDowns ? parseFloat(r.oStandardDowns) : null,
        passingDowns: r.oPassingDowns ? parseFloat(r.oPassingDowns) : null,
        runRate: r.oRunRate ? parseFloat(r.oRunRate) : null,
        pace: r.oPace ? parseFloat(r.oPace) : null,
      },
      defense: {
        ranking: r.defenseRank ? Number(r.defenseRank) : null,
        rating: parseFloat(r.dRating),
        success: r.dSuccess ? parseFloat(r.dSuccess) : null,
        explosiveness: r.dExplosiveness ? parseFloat(r.dExplosiveness) : null,
        rushing: r.dRushing ? parseFloat(r.dRushing) : null,
        passing: r.dPassing ? parseFloat(r.dPassing) : null,
        standardDowns: r.dStandardDowns ? parseFloat(r.dStandardDowns) : null,
        passingDowns: r.dPassingDowns ? parseFloat(r.dPassingDowns) : null,
        havoc: {
          total: r.dHavoc ? parseFloat(r.dHavoc) : null,
          frontSeven: r.dFrontSevenHavoc
            ? parseFloat(r.dFrontSevenHavoc)
            : null,
          db: r.dDbHavoc ? parseFloat(r.dDbHavoc) : null,
        },
      },
      specialTeams: {
        rating: r.stRating ? parseFloat(r.stRating) : null,
      },
    }),
  );
};

export const getConferenceSP = async (
  year?: number,
  conference?: string,
): Promise<ConferenceSP[]> => {
  let query = kdb
    .selectFrom('ratings')
    .innerJoin('conferenceTeam', (join) =>
      join
        .onRef('ratings.teamId', '=', 'conferenceTeam.teamId')
        .onRef('conferenceTeam.startYear', '<=', 'ratings.year')
        .on((eb) =>
          eb.or([
            eb('conferenceTeam.endYear', '>=', eb.ref('ratings.year')),
            eb('conferenceTeam.endYear', 'is', null),
          ]),
        ),
    )
    .innerJoin('conference', (join) =>
      join
        .onRef('conferenceTeam.conferenceId', '=', 'conference.id')
        .on('conference.division', '=', 'fbs'),
    )
    .groupBy(['year', 'conference.name'])
    .select(['year', 'conference.name as conference'])
    .select((eb) => eb.fn.avg('rating').as('rating'))
    .select((eb) => eb.fn.avg('oRating').as('oRating'))
    .select((eb) => eb.fn.avg('dRating').as('dRating'))
    .select((eb) => eb.fn.avg('stRating').as('stRating'))
    .select((eb) => eb.fn.avg('sos').as('sos'))
    .select((eb) => eb.fn.avg('secondOrderWins').as('secondOrderWins'))
    .select((eb) => eb.fn.avg('oSuccess').as('oSuccess'))
    .select((eb) => eb.fn.avg('oExplosiveness').as('oExplosiveness'))
    .select((eb) => eb.fn.avg('oRushing').as('oRushing'))
    .select((eb) => eb.fn.avg('oPassing').as('oPassing'))
    .select((eb) => eb.fn.avg('oStandardDowns').as('oStandardDowns'))
    .select((eb) => eb.fn.avg('oPassingDowns').as('oPassingDowns'))
    .select((eb) => eb.fn.avg('oRunRate').as('oRunRate'))
    .select((eb) => eb.fn.avg('oPace').as('oPace'))
    .select((eb) => eb.fn.avg('dSuccess').as('dSuccess'))
    .select((eb) => eb.fn.avg('dExplosiveness').as('dExplosiveness'))
    .select((eb) => eb.fn.avg('dRushing').as('dRushing'))
    .select((eb) => eb.fn.avg('dPassing').as('dPassing'))
    .select((eb) => eb.fn.avg('dStandardDowns').as('dStandardDowns'))
    .select((eb) => eb.fn.avg('dPassingDowns').as('dPassingDowns'))
    .select((eb) => eb.fn.avg('dHavoc').as('dHavoc'))
    .select((eb) => eb.fn.avg('dFrontSevenHavoc').as('dFrontSevenHavoc'))
    .select((eb) => eb.fn.avg('dDbHavoc').as('dDbHavoc'))
    .orderBy('conference.name')
    .orderBy('year');

  if (year) {
    query = query.where('ratings.year', '=', year);
  }

  if (conference) {
    query = query.where((eb) =>
      eb(
        eb.fn('lower', ['conference.abbreviation']),
        '=',
        conference.toLowerCase(),
      ),
    );
  }

  const ratings = await query.execute();

  return ratings.map(
    (r): ConferenceSP => ({
      year: r.year,
      conference: r.conference,
      rating: Number(r.rating),
      secondOrderWins: r.secondOrderWins ? Number(r.secondOrderWins) : null,
      sos: r.sos ? Number(r.sos) : null,
      offense: {
        rating: Number(r.oRating),
        success: r.oSuccess ? Number(r.oSuccess) : null,
        explosiveness: r.oExplosiveness ? Number(r.oExplosiveness) : null,
        rushing: r.oRushing ? Number(r.oRushing) : null,
        passing: r.oPassing ? Number(r.oPassing) : null,
        standardDowns: r.oStandardDowns ? Number(r.oStandardDowns) : null,
        passingDowns: r.oPassingDowns ? Number(r.oPassingDowns) : null,
        runRate: r.oRunRate ? Number(r.oRunRate) : null,
        pace: r.oPace ? Number(r.oPace) : null,
      },
      defense: {
        rating: Number(r.dRating),
        success: r.dSuccess ? Number(r.dSuccess) : null,
        explosiveness: r.dExplosiveness ? Number(r.dExplosiveness) : null,
        rushing: r.dRushing ? Number(r.dRushing) : null,
        passing: r.dPassing ? Number(r.dPassing) : null,
        standardDowns: r.dStandardDowns ? Number(r.dStandardDowns) : null,
        passingDowns: r.dPassingDowns ? Number(r.dPassingDowns) : null,
        havoc: {
          total: r.dHavoc ? Number(r.dHavoc) : null,
          frontSeven: r.dFrontSevenHavoc ? Number(r.dFrontSevenHavoc) : null,
          db: r.dDbHavoc ? Number(r.dDbHavoc) : null,
        },
      },
      specialTeams: {
        rating: r.stRating ? Number(r.stRating) : null,
      },
    }),
  );
};

export const getSRS = async (
  year?: number,
  team?: string,
  conference?: string,
): Promise<TeamSRS[]> => {
  if (!year && !team) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year required when team not specified' },
        team: { value: team, message: 'team required when year not specified' },
      },
      'Validation error',
    );
  }

  let query = kdb
    .selectFrom('srs')
    .innerJoin('team', 'srs.teamId', 'team.id')
    .leftJoin('conferenceTeam', (join) =>
      join
        .onRef('team.id', '=', 'conferenceTeam.teamId')
        .onRef('conferenceTeam.startYear', '<=', 'srs.year')
        .on((eb) =>
          eb.or([
            eb('conferenceTeam.endYear', '>=', eb.ref('srs.year')),
            eb('conferenceTeam.endYear', 'is', null),
          ]),
        ),
    )
    .leftJoin('conference', 'conferenceTeam.conferenceId', 'conference.id')
    .select([
      'srs.year',
      'team.school as team',
      'conference.name as conference',
      'conferenceTeam.division',
      'srs.rating',
    ])
    .select((eb) =>
      eb.fn
        .agg<number>('rank')
        .over((ob) => ob.orderBy('srs.rating', 'desc'))
        .as('ranking'),
    );

  if (year) {
    query = query.where('srs.year', '=', year);
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
  }

  if (conference) {
    query = query.where((eb) =>
      eb(
        eb.fn('lower', ['conference.abbreviation']),
        '=',
        conference.toLowerCase(),
      ),
    );
  }

  const results = await query.execute();

  return results.map((r) => ({
    year: r.year,
    team: r.team,
    conference: r.conference,
    division: r.division,
    ranking: Number(r.ranking),
    rating: parseFloat(r.rating),
  }));
};

export const getElo = async (
  year?: number,
  week?: number,
  seasonType?: SeasonType,
  team?: string,
  conference?: string,
): Promise<TeamElo[]> => {
  let query = kdb
    .with('elos', (eb) => {
      let cte = eb
        .selectFrom('game')
        .innerJoin('gameTeam', 'game.id', 'gameTeam.gameId')
        .innerJoin('team', 'gameTeam.teamId', 'team.id')
        .innerJoin('conferenceTeam', (join) =>
          join
            .onRef('team.id', '=', 'conferenceTeam.teamId')
            .onRef('conferenceTeam.startYear', '<=', 'game.season')
            .on((eb) =>
              eb.or([
                eb('conferenceTeam.endYear', 'is', null),
                eb('conferenceTeam.endYear', '>=', eb.ref('game.season')),
              ]),
            ),
        )
        .innerJoin('conference', 'conferenceTeam.conferenceId', 'conference.id')
        .where('gameTeam.endElo', 'is not', null)
        .where('game.status', '=', 'completed')
        .select((eb) =>
          eb.fn
            .agg<number>('rank')
            .over((over) =>
              over
                .partitionBy(['game.season', 'team.school'])
                .orderBy('game.startDate', 'desc'),
            )
            .as('rowNum'),
        )
        .select([
          'game.season as year',
          'team.school as team',
          'conference.name as conference',
          'gameTeam.endElo as elo',
        ]);

      if (year) {
        cte = cte.where('game.season', '=', year);
      }

      if (week) {
        cte = cte.where('game.week', '<=', week);
      }

      if ((seasonType && seasonType === SeasonType.Regular) || week) {
        cte = cte.where('game.seasonType', '=', 'regular');
      }

      if (team) {
        cte = cte.where((eb) =>
          eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
        );
      }

      if (conference) {
        cte = cte.where((eb) =>
          eb(
            eb.fn('lower', ['conference.abbreviation']),
            '=',
            conference.toLowerCase(),
          ),
        );
      }

      return cte;
    })
    .selectFrom('elos')
    .select(['year', 'team', 'conference', 'elo'])
    .where('rowNum', '=', 1);

  const results = await query.execute();
  return results;
};

export const getFPI = async (
  /**
   * @isInt
   */
  year?: number,
  team?: string,
  conference?: string,
): Promise<TeamFPI[]> => {
  if (!year && !team) {
    throw new ValidateError(
      {
        year: { value: year, message: 'year required when team not specified' },
        team: { value: team, message: 'team required when year not specified' },
      },
      'Validation error',
    );
  }

  let query = kdb
    .selectFrom('fpi')
    .innerJoin('team', 'fpi.teamId', 'team.id')
    .leftJoin('conferenceTeam', (join) =>
      join
        .onRef('team.id', '=', 'conferenceTeam.teamId')
        .onRef('conferenceTeam.startYear', '<=', 'fpi.year')
        .on((eb) =>
          eb.or([
            eb('conferenceTeam.endYear', 'is', null),
            eb('conferenceTeam.endYear', '>=', eb.ref('fpi.year')),
          ]),
        ),
    )
    .leftJoin('conference', 'conferenceTeam.conferenceId', 'conference.id')
    .select(['team.school', 'conference.name as conference'])
    .selectAll('fpi');

  if (year) {
    query = query.where('fpi.year', '=', year);
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
  }

  if (conference) {
    query = query.where((eb) =>
      eb(
        eb.fn('lower', ['conference.abbreviation']),
        '=',
        conference.toLowerCase(),
      ),
    );
  }

  const results = await query.execute();

  return results.map(
    (r): TeamFPI => ({
      year: r.year,
      team: r.school,
      conference: r.conference,
      fpi: r.fpi ? parseFloat(r.fpi) : null,
      resumeRanks: {
        strengthOfRecord: r.strengthOfRecordRank,
        fpi: r.fpiResumeRank,
        averageWinProbability: r.avgWinProbRank,
        strengthOfSchedule: r.sosRank,
        remainingStrengthOfSchedule: r.remainingSosRank,
        gameControl: r.gameControlRank,
      },
      efficiencies: {
        overall: r.overallEfficiency ? parseFloat(r.overallEfficiency) : null,
        offense: r.offensiveEfficiency
          ? parseFloat(r.offensiveEfficiency)
          : null,
        defense: r.defensiveEfficiency
          ? parseFloat(r.defensiveEfficiency)
          : null,
        specialTeams: r.specialTeamsEfficiency
          ? parseFloat(r.specialTeamsEfficiency)
          : null,
      },
    }),
  );
};

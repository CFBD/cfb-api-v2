import { ValidateError } from 'tsoa';
import { kdb } from '../../config/database';
import { RecruitClassification } from '../enums';
import {
  AggregatedTeamRecruiting,
  Recruit,
  TeamRecruitingRanking,
} from './types';

export const getPlayerRankings = async (
  year?: number,
  team?: string,
  position?: string,
  state?: string,
  classification?: RecruitClassification,
): Promise<Recruit[]> => {
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
    .selectFrom('recruit')
    .leftJoin('recruitSchool', 'recruit.recruitSchoolId', 'recruitSchool.id')
    .leftJoin(
      'recruitPosition',
      'recruit.recruitPositionId',
      'recruitPosition.id',
    )
    .leftJoin('team', 'recruit.collegeId', 'team.id')
    .leftJoin('hometown', 'recruit.hometownId', 'hometown.id')
    .leftJoin('athlete', 'recruit.athleteId', 'athlete.id')
    .where(
      'recruit.recruitType',
      '=',
      classification ?? RecruitClassification.HighSchool,
    )
    .orderBy('recruit.ranking')
    .select([
      'recruit.id',
      'recruit.recruitType',
      'recruit.year',
      'recruit.ranking',
      'recruit.name',
      'recruitSchool.name as school',
      'recruitPosition.position',
      'recruit.height',
      'recruit.weight',
      'recruit.stars',
      'recruit.rating',
      'team.school as committedTo',
      'hometown.city',
      'hometown.state',
      'hometown.country',
      'hometown.latitude',
      'hometown.longitude',
      'hometown.countyFips',
      'athlete.id as athleteId',
    ]);

  if (year) {
    query = query.where('recruit.year', '=', year);
  }

  if (position) {
    query = query.where((eb) =>
      eb(
        eb.fn('lower', ['recruitPosition.position']),
        '=',
        position.toLowerCase(),
      ),
    );
  }

  if (state) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['hometown.state']), '=', state.toLowerCase()),
    );
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
  }

  const recruits = await query.execute();

  return recruits.map(
    (r): Recruit => ({
      id: r.id,
      athleteId: r.athleteId,
      // @ts-ignore
      recruitType: r.recruitType,
      year: r.year,
      ranking: r.ranking,
      name: r.name,
      school: r.school,
      committedTo: r.committedTo,
      position: r.position,
      height: r.height,
      weight: r.weight,
      stars: r.stars,
      rating: r.rating,
      city: r.city,
      stateProvince: r.state,
      country: r.country,
      hometownInfo: {
        latitude: r.latitude ? parseFloat(r.latitude) : null,
        longitude: r.longitude ? parseFloat(r.longitude) : null,
        fipsCode: r.countyFips,
      },
    }),
  );
};

export const getTeamRankings = async (
  year?: number,
  team?: string,
): Promise<TeamRecruitingRanking[]> => {
  let query = kdb
    .selectFrom('recruitingTeam')
    .innerJoin('team', 'recruitingTeam.teamId', 'team.id')
    .orderBy('recruitingTeam.year')
    .orderBy('recruitingTeam.rank')
    .select([
      'recruitingTeam.year',
      'recruitingTeam.rank',
      'team.school as team',
      'recruitingTeam.points',
    ]);

  if (year) {
    query = query.where('recruitingTeam.year', '=', year);
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
  }

  const ranks = await query.execute();

  return ranks.map((r) => ({
    year: r.year,
    team: r.team,
    rank: r.rank,
    points: parseFloat(r.points),
  }));
};

export const getAggregatedPlayerRatings = async (
  team?: string,
  conference?: string,
  recruitType?: RecruitClassification,
  startYear?: number,
  endYear?: number,
): Promise<AggregatedTeamRecruiting[]> => {
  let query = kdb
    .selectFrom('recruitPosition')
    .innerJoin('recruit', 'recruitPosition.id', 'recruit.recruitPositionId')
    .innerJoin('team', 'recruit.collegeId', 'team.id')
    .innerJoin('conferenceTeam', (join) =>
      join
        .onRef('team.id', '=', 'conferenceTeam.teamId')
        .on(
          'conferenceTeam.startYear',
          '<=',
          endYear ?? new Date().getFullYear(),
        )
        .on((eb) =>
          eb.or([
            eb('conferenceTeam.endYear', 'is', null),
            eb(
              'conferenceTeam.endYear',
              '>=',
              endYear ?? new Date().getFullYear(),
            ),
          ]),
        ),
    )
    .innerJoin('conference', 'conferenceTeam.conferenceId', 'conference.id')
    .where(
      'recruit.recruitType',
      '=',
      recruitType ?? RecruitClassification.HighSchool,
    )
    .where('recruit.year', '>=', startYear ?? 2000)
    .where('recruit.year', '<=', endYear ?? new Date().getFullYear())
    .groupBy([
      'team.school',
      'recruitPosition.positionGroup',
      'conference.name',
    ])
    .orderBy('team.school')
    .orderBy('recruitPosition.positionGroup')
    .select([
      'team.school',
      'recruitPosition.positionGroup',
      'conference.name as conference',
    ])
    .select((eb) => eb.fn.avg<number>('recruit.rating').as('averageRating'))
    .select((eb) => eb.fn.sum<number>('recruit.rating').as('totalRating'))
    .select((eb) => eb.fn.count<number>('recruit.id').as('totalCommits'))
    .select((eb) => eb.fn.avg<number>('recruit.stars').as('averageStars'));

  let totalsQuery = kdb
    .selectFrom('recruitPosition')
    .innerJoin('recruit', 'recruitPosition.id', 'recruit.recruitPositionId')
    .innerJoin('team', 'recruit.collegeId', 'team.id')
    .innerJoin('conferenceTeam', (join) =>
      join
        .onRef('team.id', '=', 'conferenceTeam.teamId')
        .on(
          'conferenceTeam.startYear',
          '<=',
          endYear ?? new Date().getFullYear(),
        )
        .on((eb) =>
          eb.or([
            eb('conferenceTeam.endYear', 'is', null),
            eb(
              'conferenceTeam.endYear',
              '>=',
              endYear ?? new Date().getFullYear(),
            ),
          ]),
        ),
    )
    .innerJoin('conference', 'conferenceTeam.conferenceId', 'conference.id')
    .where(
      'recruit.recruitType',
      '=',
      recruitType ?? RecruitClassification.HighSchool,
    )
    .where('recruit.year', '>=', startYear ?? 2000)
    .where('recruit.year', '<=', endYear ?? new Date().getFullYear())
    .groupBy([
      'team.school',
      'recruitPosition.positionGroup',
      'conference.name',
    ])
    .orderBy('team.school')
    .select(['team.school', 'conference.name as conference'])
    .select((eb) => eb.val('All Positions').as('positionGroup'))
    .select((eb) => eb.fn.avg<number>('recruit.rating').as('averageRating'))
    .select((eb) => eb.fn.sum<number>('recruit.rating').as('totalRating'))
    .select((eb) => eb.fn.count<number>('recruit.id').as('totalCommits'))
    .select((eb) => eb.fn.avg<number>('recruit.stars').as('averageStars'));

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
    totalsQuery = totalsQuery.where((eb) =>
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
    totalsQuery = totalsQuery.where((eb) =>
      eb(
        eb.fn('lower', ['conference.abbreviation']),
        '=',
        conference.toLowerCase(),
      ),
    );
  }

  let results = await query.execute();
  const totalResults = await totalsQuery.execute();

  results = [...results, ...totalResults];

  return results.map(
    (r): AggregatedTeamRecruiting => ({
      team: r.school,
      conference: r.conference,
      positionGroup: r.positionGroup,
      averageRating: r.averageRating,
      totalRating: r.totalRating,
      commits: r.totalCommits,
      averageStars: r.averageStars,
    }),
  );
};

import { sql } from 'kysely';
import { kdb } from '../../config/database';
import { Coach } from './types';

interface CoachRow {
  id: number;
  firstName: string;
  lastName: string;
  teamId: number;
  school: string;
  conference: string | null;
  year: number;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  preseasonRank: number | null;
  postseasonRank: number | null;
  srs: string | null;
  sp: string | null;
  spOffense: string | null;
  spDefense: string | null;
  hireDate: Date | null;
}

export const calculateWinPercentage = (
  wins: number,
  ties: number,
  games: number,
): number | null => {
  if (games === 0) {
    return null;
  }

  return Math.round(((wins + 0.5 * ties) / games) * 1000) / 1000;
};

const roundRating = (value: string | null): number | null =>
  value === null ? null : Math.round(parseFloat(value) * 10) / 10;

export const mapCoachRows = (results: CoachRow[]): Coach[] => {
  const coaches = new Map<number, Coach>();

  for (const row of results) {
    let coach = coaches.get(row.id);
    if (!coach) {
      coach = {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        hireDate: row.hireDate,
        seasons: [],
      };
      coaches.set(row.id, coach);
    }

    coach.seasons.push({
      teamId: row.teamId,
      school: row.school,
      conference: row.conference,
      year: row.year,
      games: row.games,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
      winPercentage: calculateWinPercentage(row.wins, row.ties, row.games),
      preseasonRank: row.preseasonRank,
      postseasonRank: row.postseasonRank,
      srs: roundRating(row.srs),
      spOverall: roundRating(row.sp),
      spOffense: roundRating(row.spOffense),
      spDefense: roundRating(row.spDefense),
    });
  }

  return Array.from(coaches.values());
};

export const getCoaches = async (
  firstName?: string,
  lastName?: string,
  team?: string,
  year?: number,
  minYear?: number,
  maxYear?: number,
): Promise<Coach[]> => {
  let query = kdb
    .selectFrom('coach')
    .innerJoin('coachSeason', 'coach.id', 'coachSeason.coachId')
    .innerJoin('team', 'coachSeason.teamId', 'team.id')
    .leftJoin('srs', (join) =>
      join
        .onRef('coachSeason.year', '=', 'srs.year')
        .onRef('team.id', '=', 'srs.teamId'),
    )
    .leftJoin('ratings', (join) =>
      join
        .onRef('coachSeason.year', '=', 'ratings.year')
        .onRef('team.id', '=', 'ratings.teamId'),
    )
    .select([
      'coach.id',
      'coach.firstName',
      'coach.lastName',
      'team.id as teamId',
      'team.school',
      'coachSeason.year',
      'coachSeason.games',
      'coachSeason.wins',
      'coachSeason.losses',
      'coachSeason.ties',
      'coachSeason.preseasonRank',
      'coachSeason.postseasonRank',
      'srs.rating as srs',
      'ratings.rating as sp',
      'ratings.oRating as spOffense',
      'ratings.dRating as spDefense',
    ])
    .select(
      sql<string | null>`(
        select case
          when count(distinct c.id) = 1 then min(c.name)
          else null
        end
        from conference_team ct
        inner join conference c on c.id = ct.conference_id
        where ct.team_id = coach_season.team_id
          and ct.start_year <= coach_season.year
          and (
            ct.end_year is null
            or ct.end_year >= coach_season.year
          )
      )`.as('conference'),
    )
    .select((eb) =>
      eb
        .selectFrom('coachTeam')
        .whereRef('coachTeam.coachId', '=', 'coach.id')
        .whereRef('coachTeam.teamId', '=', 'team.id')
        .where((eb) =>
          eb(
            'coachSeason.year',
            '>=',
            sql<number>`extract(year from coach_team.hire_date)`,
          ),
        )
        .orderBy('coachTeam.hireDate', 'desc')
        .limit(1)
        .select('coachTeam.hireDate')
        .as('hireDate'),
    )
    .orderBy('coach.lastName')
    .orderBy('coach.firstName')
    .orderBy('coach.id')
    .orderBy('coachSeason.year')
    .orderBy('team.id');

  if (firstName) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['coach.firstName']), '=', firstName.toLowerCase()),
    );
  }

  if (lastName) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['coach.lastName']), '=', lastName.toLowerCase()),
    );
  }

  if (team) {
    query = query.where((eb) =>
      eb(eb.fn('lower', ['team.school']), '=', team.toLowerCase()),
    );
  }

  if (year) {
    query = query.where('coachSeason.year', '=', year);
  }

  if (minYear) {
    query = query.where('coachSeason.year', '>=', minYear);
  }

  if (maxYear) {
    query = query.where('coachSeason.year', '<=', maxYear);
  }

  const results = await query.execute();

  return mapCoachRows(results);
};

import { sql } from 'kysely';
import { kdb } from '../../config/database';
import { Coach, CoachSeason } from './types';

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
        .onRef('srs.year', '=', 'ratings.year')
        .onRef('srs.teamId', '=', 'ratings.teamId'),
    )
    .select([
      'coach.id',
      'coach.firstName',
      'coach.lastName',
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
    .orderBy('coachSeason.year');

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

  let coaches: Coach[] = [];
  let ids = Array.from(new Set(results.map((r) => r.id)));
  for (let id of ids) {
    let coachSeasons = results.filter((r) => r.id == id);

    coaches.push({
      firstName: coachSeasons[0].firstName,
      lastName: coachSeasons[0].lastName,
      hireDate: coachSeasons[0].hireDate,
      seasons: coachSeasons.map((cs): CoachSeason => {
        return {
          school: cs.school,
          year: cs.year,
          games: cs.games,
          wins: cs.wins,
          losses: cs.losses,
          ties: cs.ties,
          preseasonRank: cs.preseasonRank,
          postseasonRank: cs.postseasonRank,
          srs: cs.srs ? Math.round(parseFloat(cs.srs) * 10) / 10 : null,
          spOverall: cs.sp ? Math.round(parseFloat(cs.sp) * 10) / 10 : null,
          spOffense: cs.spOffense
            ? Math.round(parseFloat(cs.spOffense) * 10) / 10
            : null,
          spDefense: cs.spDefense
            ? Math.round(parseFloat(cs.spDefense) * 10) / 10
            : null,
        };
      }),
    });
  }

  return coaches;
};

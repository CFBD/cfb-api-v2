import { sql } from 'kysely';
import { kdb } from '../../config/database';
import { DraftPick, DraftPosition, DraftTeam } from './types';

export const getTeams = async (): Promise<DraftTeam[]> => {
  const teams = await kdb
    .selectFrom('draftTeam')
    .select(['location', 'mascot', 'displayName', 'logo'])
    .distinct()
    .execute();

  return teams.map(
    (t): DraftTeam => ({
      location: t.location,
      nickname: t.mascot,
      displayName: t.displayName,
      logo: t.logo,
    }),
  );
};

export const getPositions = async (): Promise<DraftPosition[]> => {
  const positions = await kdb
    .selectFrom('draftPosition')
    .select(['name', 'abbreviation'])
    .distinct()
    .orderBy('name')
    .execute();

  return positions;
};

export const getPicks = async (
  year?: number,
  team?: string,
  school?: string,
  conference?: string,
  position?: string,
): Promise<DraftPick[]> => {
  let query = kdb
    .selectFrom('draftPicks')
    .innerJoin('draftTeam', 'draftPicks.nflTeamId', 'draftTeam.id')
    .innerJoin('draftPosition', 'draftPicks.positionId', 'draftPosition.id')
    .innerJoin('team', 'draftPicks.collegeTeamId', 'team.id')
    .leftJoin('conferenceTeam', (join) =>
      join
        .onRef('team.id', '=', 'conferenceTeam.id')
        .on(sql`(draft_picks.year - 1) >= conference_team.start_year`)
        .on(
          sql`conference_team.end_year is null or (draft_picks.year - 1) <= conference_team.end_year`,
        ),
    )
    .leftJoin('conference', 'conferenceTeam.conferenceId', 'conference.id')
    .leftJoin('athlete', 'draftPicks.collegeId', 'athlete.id')
    .leftJoin('hometown', 'athlete.hometownId', 'hometown.id')
    .select([
      'draftPicks.collegeId as collegeAthleteId',
      'draftPicks.id as nflAthleteId',
      'team.id as collegeId',
      'team.school as collegeTeam',
      'conference.name as conference',
      'draftPicks.nflTeamId',
      'draftTeam.location as nflTeam',
      'draftPicks.year',
      'draftPicks.overall',
      'draftPicks.round',
      'draftPicks.pick',
      'draftPicks.name',
      'draftPosition.name as positionName',
      'draftPicks.height',
      'draftPicks.weight',
      'draftPicks.overallRank',
      'draftPicks.positionRank',
      'draftPicks.grade',
      'hometown.city',
      'hometown.state',
      'hometown.country',
      'hometown.latitude',
      'hometown.longitude',
      'hometown.countyFips',
    ]);

  if (year) {
    query = query.where('draftPicks.year', '=', year);
  }

  if (team) {
    // @ts-ignore
    query = query.where(sql`LOWER(draft_team.location) = LOWER(${team})`);
  }

  if (school) {
    // @ts-ignore
    query = query.where(sql`LOWER(conference_team.school) = LOWER(${school})`);
  }

  if (conference) {
    // @ts-ignore
    query = query.where(sql`LOWER(conference.location) = LOWER(${conference})`);
  }

  if (position) {
    query = await query.where(
      // @ts-ignore
      sql`LOWER(draft_position.name) = LOWER(${position}) OR LOWER(draft_position.abbreviation) = LOWER(${position})`,
    );
  }

  const picks = await query.orderBy('draftPicks.overall').execute();

  return picks.map(
    (p): DraftPick => ({
      collegeAthleteId: p.collegeAthleteId,
      nflAthleteId: p.nflAthleteId,
      collegeId: p.collegeId,
      collegeTeam: p.collegeTeam,
      collegeConference: p.conference,
      nflTeamId: p.nflTeamId,
      nflTeam: p.nflTeam,
      year: p.year,
      overall: p.overall,
      round: p.round,
      pick: p.pick,
      name: p.name,
      position: p.positionName,
      height: p.height,
      weight: p.weight,
      preDraftRanking: p.overallRank,
      preDraftPositionRanking: p.positionRank,
      preDraftGrade: p.grade,
      hometownInfo: {
        city: p.city,
        state: p.state,
        country: p.country,
        latitude: p.latitude,
        longitude: p.longitude,
        countyFips: p.countyFips,
      },
    }),
  );
};

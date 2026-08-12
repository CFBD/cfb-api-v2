import { Controller, Get, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';

import {
  getTeams,
  getTeamConferenceAffiliations,
  getTeamConferenceChanges,
  getFBSTeams,
  getMatchup,
  getRoster,
  getConferences,
  getTalent,
  getVenues,
  getTeamsATS,
} from './service';
import {
  Conference,
  ConferenceClassification,
  Matchup,
  RosterPlayer,
  Team,
  TeamATS,
  TeamConferenceAffiliation,
  TeamConferenceChange,
  TeamTalent,
  Venue,
} from './types';
import { DivisionClassification } from '../enums';

@Route('teams')
@Middlewares(middlewares.standard)
@Tags('teams')
export class TeamsController extends Controller {
  /**
   * Returns team information and conference affiliations.
   * @param conference Conference abbreviation.
   * @param year Season year for historical conference affiliations.
   * @isInt year
   */
  @Get()
  public async getTeams(
    @Query() conference?: string,
    @Query() year?: number,
  ): Promise<Team[]> {
    return await getTeams(conference, year);
  }

  /**
   * Returns Football Bowl Subdivision (FBS) teams for a season.
   * @param year Season year.
   * @isInt year
   */
  @Get('fbs')
  public async getFBSTeams(@Query() year?: number): Promise<Team[]> {
    return await getFBSTeams(year);
  }

  /**
   * Returns historical matchup results between two teams.
   * @param team1 First team name.
   * @param team2 Second team name.
   * @param minYear Earliest season year to include.
   * @param maxYear Latest season year to include.
   * @isInt minYear
   * @isInt maxYear
   */
  @Get('matchup')
  public async getMatchup(
    @Query() team1: string,
    @Query() team2: string,
    @Query() minYear?: number,
    @Query() maxYear?: number,
  ): Promise<Matchup> {
    return await getMatchup(team1, team2, minYear, maxYear);
  }

  /**
   * Returns against-the-spread (ATS) records by team.
   * @param year Season year.
   * @param conference Conference name or abbreviation.
   * @param team Team name.
   * @isInt year
   */
  @Get('ats')
  public async getTeamsATS(
    @Query() year: number,
    @Query() conference?: string,
    @Query() team?: string,
  ): Promise<TeamATS[]> {
    return await getTeamsATS(year, conference, team);
  }
}

@Route('roster')
@Middlewares(middlewares.standard)
@Tags('teams')
export class RosterController extends Controller {
  /**
   * Returns historical roster data.
   * @param team Team name.
   * @param year Season year. Defaults to 2025.
   * @param classification Division classification: `fbs` or `fcs`.
   * @isInt year
   */
  @Get()
  public async getRoster(
    @Query() team?: string,
    @Query() year?: number,
    @Query() classification?: DivisionClassification,
  ): Promise<RosterPlayer[]> {
    return await getRoster(team, year, classification);
  }
}

@Route('conferences')
@Middlewares(middlewares.standard)
@Tags('conferences')
export class ConferencesController extends Controller {
  /**
   * Returns conferences and member counts.
   * @param year Season year used to calculate membership.
   * @param classification Conference classification.
   * @isInt year
   */
  @Get()
  public async getConferences(
    @Query() year?: number,
    @Query() classification?: ConferenceClassification,
  ): Promise<Conference[]> {
    return await getConferences(year, classification);
  }

  /**
   * Returns team conference changes by season.
   * @param year Season year.
   * @isInt year
   */
  @Get('changes')
  public async getTeamConferenceChanges(
    @Query() year: number,
  ): Promise<TeamConferenceChange[]> {
    return await getTeamConferenceChanges(year);
  }

  /**
   * Returns historical team conference affiliations.
   * @param team Team school name or abbreviation.
   * @param conference Conference name or abbreviation.
   * @param year Season year. Cannot be combined with `minYear` or `maxYear`.
   * @param minYear Earliest season year to include.
   * @param maxYear Latest season year to include.
   * @param classification Conference classification.
   * @isInt year
   * @isInt minYear
   * @isInt maxYear
   */
  @Get('affiliations')
  public async getTeamConferenceAffiliations(
    @Query() team?: string,
    @Query() conference?: string,
    @Query() year?: number,
    @Query() minYear?: number,
    @Query() maxYear?: number,
    @Query() classification?: ConferenceClassification,
  ): Promise<TeamConferenceAffiliation[]> {
    return await getTeamConferenceAffiliations(
      team,
      conference,
      year,
      minYear,
      maxYear,
      classification,
    );
  }
}

@Route('talent')
@Middlewares(middlewares.standard)
@Tags('teams')
export class TalentController extends Controller {
  /**
   * Returns 247Sports Team Talent Composite ratings for a season.
   * @param year Season year.
   * @isInt year
   */
  @Get()
  public async getTalent(@Query() year: number): Promise<TeamTalent[]> {
    return await getTalent(year);
  }
}

@Route('venues')
@Middlewares(middlewares.standard)
@Tags('venues')
export class VenueController extends Controller {
  /**
   * Returns college football venues.
   */
  @Get()
  public async getVenues(): Promise<Venue[]> {
    return await getVenues();
  }
}

import { Controller, Get, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';

import {
  getTeams,
  getFBSTeams,
  getMatchup,
  getRoster,
  getConferences,
  getTalent,
  getVenues,
} from './service';
import {
  Conference,
  Matchup,
  RosterPlayer,
  Team,
  TeamTalent,
  Venue,
} from './types';

@Route('teams')
@Middlewares(middlewares.standard)
@Tags('teams')
export class TeamsController extends Controller {
  /**
   * Retrieves team information
   * @param conference Optional conference abbreviation filter
   * @param year Optional year filter to get historical conference affiliations
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
   * Retrieves information on teams playing in the highest division of CFB
   * @param year Year or season
   * @isInt year
   */
  @Get('fbs')
  public async getFBSTeams(@Query() year?: number): Promise<Team[]> {
    return await getFBSTeams(year);
  }

  /**
   * Retrieves historical matchup details for two given teams
   * @param team1 First team to compare
   * @param team2 Second team to compare
   * @param minYear Optional starting year
   * @param maxYear Optional ending year
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
}

@Route('roster')
@Middlewares(middlewares.standard)
@Tags('teams')
export class RosterController extends Controller {
  /**
   * Retrieves historical roster data
   * @param team Optional team filter
   * @param year Optional year filter, defaults to 2025
   * @isInt year
   */
  @Get()
  public async getRoster(
    @Query() team?: string,
    @Query() year?: number,
  ): Promise<RosterPlayer[]> {
    return await getRoster(team, year);
  }
}

@Route('conferences')
@Middlewares(middlewares.standard)
@Tags('conferences')
export class ConferencesController extends Controller {
  /**
   * Retrieves list of conferences
   */
  @Get()
  public async getConferences(): Promise<Conference[]> {
    return await getConferences();
  }
}

@Route('talent')
@Middlewares(middlewares.standard)
@Tags('teams')
export class TalentController extends Controller {
  /**
   * Retrieve 247 Team Talent Composite for a given year
   * @param year Year filter
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
   * Retrieve list of venues
   */
  @Get()
  public async getVenues(): Promise<Venue[]> {
    return await getVenues();
  }
}

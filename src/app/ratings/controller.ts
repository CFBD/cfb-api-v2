import { Controller, Get, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';
import { ConferenceSP, TeamElo, TeamFPI, TeamSP, TeamSRS } from './types';
import { getConferenceSP, getElo, getFPI, getSP, getSRS } from './service';
import { SeasonType } from '../enums';

@Route('ratings')
@Middlewares(middlewares.standard)
@Tags('ratings')
export class RatingsController extends Controller {
  /**
   * Retrieves SP+ ratings for a given year or school
   * @param year Year filter, required if team not specified
   * @param team Team filter, required if year not specified
   * @isInt year
   */
  @Get('sp')
  public async getSP(
    @Query() year?: number,
    @Query() team?: string,
  ): Promise<TeamSP[]> {
    return await getSP(year, team);
  }

  /**
   * Retrieves aggregated historical conference SP+ data
   * @param year Optional year filter
   * @param conference Optional conference filter
   * @isInt year
   */
  @Get('sp/conferences')
  public async getConferenceSP(
    @Query() year?: number,
    @Query() conference?: string,
  ): Promise<ConferenceSP[]> {
    return await getConferenceSP(year, conference);
  }

  /**
   * Retrieves historical SRS for a year or team
   * @param year Year filter, required if team not specified
   * @param team Team filter, required if year not specified
   * @param conference Optional conference filter
   * @isInt year
   */
  @Get('srs')
  public async getSRS(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
  ): Promise<TeamSRS[]> {
    return await getSRS(year, team, conference);
  }

  /**
   * Retrieves historical Elo ratings
   * @param year Optional year filter
   * @param week Optional week filter, defaults to last available week in the season
   * @param seasonType Optional season type filter
   * @param team Optional team filter
   * @param conference Optional conference filter
   * @isInt year
   * @isInt week
   */
  @Get('elo')
  public async getElo(
    @Query() year?: number,
    @Query() week?: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() conference?: string,
  ): Promise<TeamElo[]> {
    return await getElo(year, week, seasonType, team, conference);
  }

  /**
   * Retrieves historical Football Power Index (FPI) ratings
   * @param year year filter, required if team not specified
   * @param team team filter, required if year not specified
   * @param conference Optional conference filter
   * @isInt year
   */
  @Get('fpi')
  public async getFPI(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
  ): Promise<TeamFPI[]> {
    return await getFPI(year, team, conference);
  }
}

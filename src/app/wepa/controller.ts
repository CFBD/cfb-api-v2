import { Controller, Get, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';
import {
  getAdjustedTeamStats,
  getKickerPaar,
  getPlayerPassingWepa,
  getPlayerRushingWepa,
} from './service';
import { AdjustedTeamMetrics, KickerPAAR, PlayerWeightedEPA } from './types';

@Route('wepa')
@Middlewares(middlewares.standard)
@Tags('adjustedMetrics')
export class WepaController extends Controller {
  /**
   * Retrieve opponent-adjusted team season statistics
   * @param year Optional year filter
   * @param team Optional team filter
   * @param conference Optional conference filter
   * @isInt year
   */
  @Get('team/season')
  public async getAdjustedTeamSeasonStats(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
  ): Promise<AdjustedTeamMetrics[]> {
    return await getAdjustedTeamStats(year, team, conference);
  }

  /**
   * Retrieve opponent-adjusted player passing statistics
   * @param year Optional year filter
   * @param team Optional team filter
   * @param conference Optional conference abbreviation filter
   * @param position Optional position abbreviation filter
   * @isInt year
   */
  @Get('players/passing')
  public async getAdjustedPlayerPassingStats(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() position?: string,
  ): Promise<PlayerWeightedEPA[]> {
    return await getPlayerPassingWepa(year, team, conference, position);
  }

  /**
   * Retrieve opponent-adjusted player rushing statistics
   * @param year Optional year filter
   * @param team Optional team filter
   * @param conference Optional conference abbreviation filter
   * @param position Optional position abbreviation filter
   * @isInt year
   */
  @Get('players/rushing')
  public async getAdjustedPlayerRushingStats(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() position?: string,
  ): Promise<PlayerWeightedEPA[]> {
    return await getPlayerRushingWepa(year, team, conference, position);
  }

  /**
   * Retrieve Points Added Above Replacement (PAAR) ratings for kickers
   * @param year Optional year filter
   * @param team Optional team filter
   * @param conference Optional conference abbreviation filter
   * @param position Optional position abbreviation filter
   * @isInt year
   */
  @Get('players/kicking')
  public async getKickerPaar(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
  ): Promise<KickerPAAR[]> {
    return await getKickerPaar(year, team, conference);
  }
}

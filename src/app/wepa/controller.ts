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
   * Returns opponent-adjusted team statistics by season.
   * @param year Season year.
   * @param team Team name.
   * @param conference Conference name or abbreviation.
   * @isInt year
   */
  @Get('team/season')
  @Middlewares(middlewares.requirePatreonTier(1))
  public async getAdjustedTeamSeasonStats(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
  ): Promise<AdjustedTeamMetrics[]> {
    return await getAdjustedTeamStats(year, team, conference);
  }

  /**
   * Returns opponent-adjusted player passing metrics.
   * @param year Season year.
   * @param team Team name.
   * @param conference Conference abbreviation.
   * @param position Player position abbreviation.
   * @isInt year
   */
  @Get('players/passing')
  @Middlewares(middlewares.requirePatreonTier(1))
  public async getAdjustedPlayerPassingStats(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() position?: string,
  ): Promise<PlayerWeightedEPA[]> {
    return await getPlayerPassingWepa(year, team, conference, position);
  }

  /**
   * Returns opponent-adjusted player rushing metrics.
   * @param year Season year.
   * @param team Team name.
   * @param conference Conference abbreviation.
   * @param position Player position abbreviation.
   * @isInt year
   */
  @Get('players/rushing')
  @Middlewares(middlewares.requirePatreonTier(1))
  public async getAdjustedPlayerRushingStats(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() position?: string,
  ): Promise<PlayerWeightedEPA[]> {
    return await getPlayerRushingWepa(year, team, conference, position);
  }

  /**
   * Returns Points Added Above Replacement (PAAR) ratings for kickers.
   * @param year Season year.
   * @param team Team name.
   * @param conference Conference abbreviation.
   * @isInt year
   */
  @Get('players/kicking')
  @Middlewares(middlewares.requirePatreonTier(1))
  public async getKickerPaar(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
  ): Promise<KickerPAAR[]> {
    return await getKickerPaar(year, team, conference);
  }
}

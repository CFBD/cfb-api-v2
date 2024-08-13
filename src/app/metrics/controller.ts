import { Controller, Get, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';
import {
  getPredictedPoints,
  getPredictedPointsAddedByGame,
  getPredictedPointsAddedByPlayerGame,
  getPredictedPointsAddedByPlayerSeason,
  getPredictedPointsAddedByTeam,
} from './service';
import {
  PlayerGamePredictedPointsAdded,
  PlayerSeasonPredictedPointsAdded,
  PredictedPointsValue,
  TeamGamePredictedPointsAdded,
  TeamSeasonPredictedPointsAdded,
} from './types';
import { SeasonType } from '../enums';

@Route('ppa')
@Middlewares(middlewares.standard)
@Tags('metrics')
export class PpaController extends Controller {
  /**
   * Query Predicted Points values by down and distance
   * @param down Down value
   * @param distance Distance value
   * @isInt down
   * @isInt distance
   */
  @Get('predicted')
  public async getPredictedPoints(
    @Query() down: number,
    @Query() distance: number,
  ): Promise<PredictedPointsValue[]> {
    return await getPredictedPoints(down, distance);
  }

  /**
   * Retrieves historical team PPA metrics by season
   * @param year Year filter, required if team not specified
   * @param team Team filter, required if year not specified
   * @param conference Conference abbreviation filter
   * @param excludeGarbageTime Exclude garbage time plays
   * @isInt year
   */
  @Get('teams')
  public async getPredictedPointsAddedByTeam(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() excludeGarbageTime?: boolean,
  ): Promise<TeamSeasonPredictedPointsAdded[]> {
    return await getPredictedPointsAddedByTeam(
      year,
      team,
      conference,
      excludeGarbageTime,
    );
  }

  /**
   * Retrieves historical team PPA metrics by game
   * @param year Required year filter
   * @param week Optional week filter
   * @param seasonType Optional season type filter
   * @param team Optional team filter
   * @param conference Optional conference abbreviation filter
   * @param excludeGarbageTime Optional flag to exclude garbage time plays
   * @isInt year
   * @isInt week
   */
  @Get('games')
  public async getPredictedPointsAddedByGame(
    @Query() year: number,
    @Query() week?: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() excludeGarbageTime?: boolean,
  ): Promise<TeamGamePredictedPointsAdded[]> {
    return await getPredictedPointsAddedByGame(
      year,
      week,
      seasonType,
      team,
      conference,
      excludeGarbageTime,
    );
  }

  /**
   * Queries player PPA statistics by game
   * @param year Required year filter
   * @param week Week filter, required if team not specified
   * @param seasonType Optional season type filter
   * @param team Team filter, required if week not specified
   * @param position Optional player position abbreviation filter
   * @param playerId Optional player ID filter
   * @param threshold Threshold value for minimum number of plays
   * @param excludeGarbageTime Optional flag to exclude garbage time plays
   * @isInt year
   * @isInt week
   */
  @Get('players/games')
  public async getPredictedPointsAddedByPlayerGame(
    @Query() year: number,
    @Query() week?: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() position?: string,
    @Query() playerId?: string,
    @Query() threshold?: number,
    @Query() excludeGarbageTime?: boolean,
  ): Promise<PlayerGamePredictedPointsAdded[]> {
    return await getPredictedPointsAddedByPlayerGame(
      year,
      week,
      seasonType,
      team,
      position,
      playerId,
      threshold,
      excludeGarbageTime,
    );
  }

  /**
   * Queries player PPA statistics by season
   * @param year Year filter, required if playerId not specified
   * @param conference Optional conference abbreviation filter
   * @param team Optional team filter
   * @param position Optional position abbreviation filter
   * @param playerId Player ID filter, required if year not specified
   * @param threshold Threshold value for minimum number of plays
   * @param excludeGarbageTime Optional flag to exclude garbage time plays
   * @isInt year
   */
  @Get('players/season')
  public async getPredictedPointsAddedByPlayerSeason(
    @Query() year?: number,
    @Query() conference?: string,
    @Query() team?: string,
    @Query() position?: string,
    @Query() playerId?: string,
    @Query() threshold?: number,
    @Query() excludeGarbageTime?: boolean,
  ): Promise<PlayerSeasonPredictedPointsAdded[]> {
    return await getPredictedPointsAddedByPlayerSeason(
      year,
      conference,
      team,
      position,
      playerId,
      threshold,
      excludeGarbageTime,
    );
  }
}

// @Route('metrics')
// @Middlewares(middlewares.standard)
// @Tags('metrics')
// export class MetricsController extends Controller {

// }

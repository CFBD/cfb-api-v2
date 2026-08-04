import { Controller, Get, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';
import {
  getFieldGoalEP,
  getPredictedPoints,
  getPredictedPointsAddedByGame,
  getPredictedPointsAddedByPlayerGame,
  getPredictedPointsAddedByPlayerSeason,
  getPredictedPointsAddedByTeam,
  getPregameWinProbabilities,
  getWinProbabilities,
} from './service';
import {
  FieldGoalEP,
  PlayerGamePredictedPointsAdded,
  PlayerSeasonPredictedPointsAdded,
  PlayWinProbability,
  PredictedPointsValue,
  PregameWinProbability,
  TeamGamePredictedPointsAdded,
  TeamSeasonPredictedPointsAdded,
} from './types';
import { DivisionClassification, SeasonType } from '../enums';

@Route('ppa')
@Middlewares(middlewares.standard)
@Tags('metrics')
export class PpaController extends Controller {
  /**
   * Returns predicted points values by down and distance.
   * @param down Down number.
   * @param distance Distance to gain, in yards.
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
   * Returns team Predicted Points Added (PPA) metrics by season.
   * @param year Season year. Required unless `team` is specified.
   * @param team Team name. Required unless `year` is specified.
   * @param conference Conference abbreviation.
   * @param excludeGarbageTime Excludes garbage-time plays when `true`.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt year
   */
  @Get('teams')
  public async getPredictedPointsAddedByTeam(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() excludeGarbageTime?: boolean,
    @Query() classification?: DivisionClassification,
  ): Promise<TeamSeasonPredictedPointsAdded[]> {
    return await getPredictedPointsAddedByTeam(
      year,
      team,
      conference,
      excludeGarbageTime,
      classification,
    );
  }

  /**
   * Returns team Predicted Points Added (PPA) metrics by game.
   * @param year Season year.
   * @param week Week number.
   * @param seasonType Season type.
   * @param team Team name.
   * @param conference Conference abbreviation.
   * @param excludeGarbageTime Excludes garbage-time plays when `true`.
   * @param classification Division classification. Defaults to `fbs`.
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
    @Query() classification?: DivisionClassification,
  ): Promise<TeamGamePredictedPointsAdded[]> {
    return await getPredictedPointsAddedByGame(
      year,
      week,
      seasonType,
      team,
      conference,
      excludeGarbageTime,
      classification,
    );
  }

  /**
   * Returns player Predicted Points Added (PPA) metrics by game.
   * @param year Season year.
   * @param week Week number. Required unless `team` is specified.
   * @param seasonType Season type.
   * @param team Team name. Required unless `week` is specified.
   * @param position Player position abbreviation.
   * @param playerId Player ID.
   * @param threshold Minimum number of plays.
   * @param excludeGarbageTime Excludes garbage-time plays when `true`.
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
   * Returns player Predicted Points Added (PPA) metrics by season.
   * @param year Season year. Required unless `playerId` is specified.
   * @param conference Conference abbreviation.
   * @param team Team name.
   * @param position Player position abbreviation.
   * @param playerId Player ID. Required unless `year` is specified.
   * @param threshold Minimum number of plays.
   * @param excludeGarbageTime Excludes garbage-time plays when `true`.
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

@Route('metrics')
@Middlewares(middlewares.standard)
@Tags('metrics')
export class MetricsController extends Controller {
  /**
   * Returns play-by-play win probabilities for a game.
   * @param gameId Game ID.
   * @isInt gameId
   */
  @Get('wp')
  public async getWinProbability(
    @Query() gameId: number,
  ): Promise<PlayWinProbability[]> {
    return await getWinProbabilities(gameId);
  }

  /**
   * Returns pregame win probabilities.
   * @param year Season year.
   * @param week Week number.
   * @param seasonType Season type.
   * @param team Team name.
   * @isInt year
   * @isInt week
   */
  @Get('wp/pregame')
  public async getPregameWinProbabilities(
    @Query() year?: number,
    @Query() week?: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
  ): Promise<PregameWinProbability[]> {
    return await getPregameWinProbabilities(year, week, seasonType, team);
  }

  /**
   * Returns expected points values for field goal attempts.
   */
  @Get('fg/ep')
  public async getFieldGoalExpectedPoints(): Promise<FieldGoalEP[]> {
    return await getFieldGoalEP();
  }
}

import { Controller, Get, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';
import {
  AdvancedGameStat,
  AdvancedSeasonStat,
  GameHavocStats,
  PlayerGameSuccessRate,
  PlayerSeasonSuccessRate,
  PlayerStat,
  TeamStat,
} from './types';
import { DivisionClassification, SeasonType } from '../enums';
import {
  getAdvancedGameStats,
  getAdvancedStats,
  getCategories,
  getGameHavocStats,
  getPlayerGameSuccessRates,
  getPlayerSeasonStats,
  getPlayerSeasonSuccessRates,
  getTeamStats,
} from './service';

@Route('stats')
@Middlewares(middlewares.standard)
@Tags('stats')
export class StatsController extends Controller {
  /**
   * Returns player statistics aggregated by season.
   * @param year Season year.
   * @param conference Conference name or abbreviation.
   * @param team Team name.
   * @param startWeek Earliest week to include.
   * @param endWeek Latest week to include.
   * @param seasonType Season type.
   * @param category Statistical category.
   * @isInt year
   * @isInt startWeek
   * @isInt endWeek
   */
  @Middlewares(middlewares.rejectBadParam('playerId'))
  @Get('player/season')
  public async getPlayerSeasonStats(
    @Query() year: number,
    @Query() conference?: string,
    @Query() team?: string,
    @Query() startWeek?: number,
    @Query() endWeek?: number,
    @Query() seasonType?: SeasonType,
    @Query() category?: string,
  ): Promise<PlayerStat[]> {
    return await getPlayerSeasonStats(
      year,
      conference,
      team,
      startWeek,
      endWeek,
      seasonType,
      category,
    );
  }

  /**
   * Returns player passing and rushing success rates by season.
   * @param year Season year. Required unless `playerId` is specified.
   * @param conference Conference abbreviation.
   * @param team Team name.
   * @param playerId Player ID. Required unless `year` is specified.
   * @param seasonType Season type.
   * @param startWeek Earliest week to include.
   * @param endWeek Latest week to include.
   * @param threshold Minimum credited passing and rushing plays.
   * @param excludeGarbageTime Excludes garbage-time plays when `true`.
   * @isInt year
   * @isInt playerId
   * @isInt startWeek
   * @isInt endWeek
   * @isInt threshold
   */
  @Get('player/success')
  public async getPlayerSeasonSuccessRates(
    @Query() year?: number,
    @Query() conference?: string,
    @Query() team?: string,
    @Query() playerId?: number,
    @Query() seasonType?: SeasonType,
    @Query() startWeek?: number,
    @Query() endWeek?: number,
    @Query() threshold?: number,
    @Query() excludeGarbageTime?: boolean,
  ): Promise<PlayerSeasonSuccessRate[]> {
    return await getPlayerSeasonSuccessRates(
      year,
      conference,
      team,
      playerId,
      seasonType,
      startWeek,
      endWeek,
      threshold,
      excludeGarbageTime,
    );
  }

  /**
   * Returns player passing and rushing success rates by game.
   * @param year Season year.
   * @param week Week number. Required unless `team` or `playerId` is specified.
   * @param seasonType Season type.
   * @param conference Conference abbreviation.
   * @param team Team name.
   * @param playerId Player ID.
   * @param threshold Minimum credited passing and rushing plays.
   * @param excludeGarbageTime Excludes garbage-time plays when `true`.
   * @isInt year
   * @isInt week
   * @isInt playerId
   * @isInt threshold
   */
  @Get('player/success/game')
  public async getPlayerGameSuccessRates(
    @Query() year: number,
    @Query() week?: number,
    @Query() seasonType?: SeasonType,
    @Query() conference?: string,
    @Query() team?: string,
    @Query() playerId?: number,
    @Query() threshold?: number,
    @Query() excludeGarbageTime?: boolean,
  ): Promise<PlayerGameSuccessRate[]> {
    return await getPlayerGameSuccessRates(
      year,
      week,
      seasonType,
      conference,
      team,
      playerId,
      threshold,
      excludeGarbageTime,
    );
  }

  /**
   * Returns team statistics aggregated by season.
   * @param year Season year. Required unless `team` is specified.
   * @param team Team name. Required unless `year` is specified.
   * @param conference Conference name or abbreviation.
   * @param startWeek Earliest week to include.
   * @param endWeek Latest week to include.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt year
   * @isInt startWeek
   * @isInt endWeek
   */
  @Middlewares(middlewares.rejectBadParam('playerId'))
  @Get('season')
  public async getTeamStats(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() startWeek?: number,
    @Query() endWeek?: number,
    @Query() classification?: DivisionClassification,
  ): Promise<TeamStat[]> {
    return await getTeamStats(
      year,
      team,
      conference,
      startWeek,
      endWeek,
      classification,
    );
  }

  /**
   * Returns the available team statistical categories.
   */
  @Middlewares(middlewares.rejectBadParam('playerId'))
  @Get('categories')
  public async getCategories(): Promise<string[]> {
    return await getCategories();
  }

  /**
   * Returns advanced team statistics aggregated by season.
   * @param year Season year. Required unless `team` is specified.
   * @param team Team name. Required unless `year` is specified.
   * @param excludeGarbageTime Excludes garbage-time plays when `true`. Defaults
   * to `false`.
   * @param startWeek Earliest week to include.
   * @param endWeek Latest week to include.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt year
   * @isInt startWeek
   * @isInt endWeek
   */
  @Middlewares(middlewares.rejectBadParam('playerId'))
  @Get('season/advanced')
  public async getAdvancedSeasonStats(
    @Query() year?: number,
    @Query() team?: string,
    @Query() excludeGarbageTime?: boolean,
    @Query() startWeek?: number,
    @Query() endWeek?: number,
    @Query() classification?: DivisionClassification,
  ): Promise<AdvancedSeasonStat[]> {
    return await getAdvancedStats(
      year,
      team,
      excludeGarbageTime,
      startWeek,
      endWeek,
      classification,
    );
  }

  /**
   * Returns advanced team statistics aggregated by game.
   * @param year Season year. Required unless `team` is specified.
   * @param team Team name. Required unless `year` is specified.
   * @param week Week number.
   * @param opponent Opponent team name.
   * @param excludeGarbageTime Excludes garbage-time plays when `true`. Defaults
   * to `false`.
   * @param seasonType Season type.
   * @isInt year
   */
  @Middlewares(middlewares.rejectBadParam('playerId'))
  @Get('game/advanced')
  public async getAdvancedGameStats(
    @Query() year?: number,
    @Query() team?: string,
    @Query() week?: number,
    @Query() opponent?: string,
    @Query() excludeGarbageTime?: boolean,
    @Query() seasonType?: SeasonType,
  ): Promise<AdvancedGameStat[]> {
    return await getAdvancedGameStats(
      year,
      team,
      week,
      opponent,
      excludeGarbageTime,
      seasonType,
    );
  }

  /**
   * Returns team havoc statistics aggregated by game.
   * @param year Season year. Required unless `team` is specified.
   * @param team Team name. Required unless `year` is specified.
   * @param week Week number.
   * @param opponent Opponent team name.
   * @param seasonType Season type.
   * @isInt year
   */
  @Middlewares(middlewares.rejectBadParam('playerId'))
  @Get('game/havoc')
  public async getGameHavocStats(
    @Query() year?: number,
    @Query() team?: string,
    @Query() week?: number,
    @Query() opponent?: string,
    @Query() seasonType?: SeasonType,
  ): Promise<GameHavocStats[]> {
    return await getGameHavocStats(year, team, week, opponent, seasonType);
  }
}

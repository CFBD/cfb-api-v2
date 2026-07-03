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
import { SeasonType } from '../enums';
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
   * Retrieves aggregated player statistics for a given season
   * @param year Required year filter
   * @param conference Optional conference filter
   * @param team Optional team filter
   * @param startWeek Optional starting week range
   * @param endWeek Optional ending week range
   * @param seasonType Optional season type filter
   * @param category Optional category filter
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
   * Retrieves player passing and rushing success rates by season
   * @param year Year filter, required if playerId not specified
   * @param conference Optional conference abbreviation filter
   * @param team Optional team filter
   * @param playerId Player ID filter, required if year not specified
   * @param seasonType Optional season type filter
   * @param startWeek Optional starting week range
   * @param endWeek Optional ending week range
   * @param threshold Optional minimum credited passing plus rushing plays
   * @param excludeGarbageTime Optional flag to exclude garbage time plays
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
   * Retrieves player passing and rushing success rates by game
   * @param year Required year filter
   * @param week Week filter, required if team and playerId not specified
   * @param seasonType Optional season type filter
   * @param conference Optional conference abbreviation filter
   * @param team Optional team filter
   * @param playerId Optional player ID filter
   * @param threshold Optional minimum credited passing plus rushing plays
   * @param excludeGarbageTime Optional flag to exclude garbage time plays
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
   * Retrieves aggregated team season statistics
   * @param year Year filter, required if team not specified
   * @param team Team filter, required if year not specified
   * @param conference Optional conference filter
   * @param startWeek Optional week start range filter
   * @param endWeek Optional week end range filter
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
  ): Promise<TeamStat[]> {
    return await getTeamStats(year, team, conference, startWeek, endWeek);
  }

  /**
   * Gets team statistical categories
   */
  @Middlewares(middlewares.rejectBadParam('playerId'))
  @Get('categories')
  public async getCategories(): Promise<string[]> {
    return await getCategories();
  }

  /**
   * Retrieves advanced season statistics for teams
   * @param year Year filter, required if team not specified
   * @param team Team filter, required if year not specified
   * @param excludeGarbageTime Garbage time exclusion filter, defaults to false
   * @param startWeek Optional start week range filter
   * @param endWeek Optional end week range filter
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
  ): Promise<AdvancedSeasonStat[]> {
    return await getAdvancedStats(
      year,
      team,
      excludeGarbageTime,
      startWeek,
      endWeek,
    );
  }

  /**
   * Retrieves advanced statistics aggregated by game
   * @param year Year filter, required if team not specified
   * @param team Team filter, required if year not specified
   * @param week Optional week filter
   * @param opponent Optional opponent filter
   * @param excludeGarbageTime Garbage time exclusion filter, defaults to false
   * @param seasonType Optional season type filter
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
   * Retrieves havoc statistics aggregated by game
   * @param year Year filter, required if team not specified
   * @param team Team filter, required if year not specified
   * @param week Optional week filter
   * @param opponent Optional opponent filter
   * @param seasonType Optional season type filter
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

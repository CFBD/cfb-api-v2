import { Controller, Get, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';
import {
  AdjustedMetrics,
  AdvancedGameStat,
  AdvancedSeasonStat,
  PlayerStat,
  TeamStat,
} from './types';
import { SeasonType } from '../enums';
import {
  getAdjustedTeamStats,
  getAdvancedGameStats,
  getAdvancedStats,
  getCategories,
  getPlayerSeasonStats,
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
   * Retrieve opponent-adjusted team season statistics
   * @param year Optional year filter
   * @param team Optional team filter
   * @param conference Optional conference filter
   * @isInt year
   */
  @Get('team/season/adjusted')
  public async getAdjustedTeamSeasonStats(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
  ): Promise<AdjustedMetrics[]> {
    return await getAdjustedTeamStats(year, team, conference);
  }
}

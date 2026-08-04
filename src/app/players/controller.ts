import { Controller, Get, Hidden, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';
import {
  generateMeanPassingChart,
  getPlayerSeasonOverview,
  getPlayerUsage,
  getReturningProduction,
  getTransferPortal,
  searchPlayers,
} from './service';
import {
  PlayerPPAChartItem,
  PlayerSearchResult,
  PlayerSeasonOverview,
  PlayerTransfer,
  PlayerUsage,
  ReturningProduction,
} from './types';

@Route('player')
@Middlewares(middlewares.standard)
@Tags('players')
export class PlayersController extends Controller {
  /**
   * Returns up to 100 players whose names match the search term.
   * @param searchTerm Full or partial player name.
   * @param year Season year.
   * @param team Team name.
   * @param position Player position abbreviation.
   * @isInt year
   */
  @Get('search')
  public async searchPlayers(
    @Query() searchTerm: string,
    @Query() year?: number,
    @Query() team?: string,
    @Query() position?: string,
  ): Promise<PlayerSearchResult[]> {
    return await searchPlayers(searchTerm, year, team, position);
  }

  @Get('ppa/passing')
  @Hidden()
  public async generateMeanPassingPPAChart(
    @Query() id: number,
    @Query() year?: number,
    @Query() rollingPlays?: number,
  ): Promise<PlayerPPAChartItem[]> {
    return await generateMeanPassingChart(id, year, rollingPlays);
  }

  /**
   * Returns player usage metrics for a season.
   * @param year Season year.
   * @param conference Conference abbreviation.
   * @param position Player position abbreviation.
   * @param team Team name.
   * @param playerId Player ID.
   * @param excludeGarbageTime Excludes garbage-time plays when `true`. Defaults
   * to `false`.
   * @isInt year
   * @isInt playerId
   */
  @Get('usage')
  public async getPlayerUsage(
    @Query() year: number,
    @Query() conference?: string,
    @Query() position?: string,
    @Query() team?: string,
    @Query() playerId?: number,
    @Query() excludeGarbageTime?: boolean,
  ): Promise<PlayerUsage[]> {
    return await getPlayerUsage(
      year,
      conference,
      position,
      team,
      playerId,
      excludeGarbageTime,
    );
  }

  /**
   * Returns a player season overview with box score, usage, and Predicted
   * Points Added (PPA) data.
   * @param year Season year.
   * @param playerId Player ID.
   * @isInt year
   * @isInt playerId
   */
  @Get('season/overview')
  public async getPlayerSeasonOverview(
    @Query() year: number,
    @Query() playerId: number,
  ): Promise<PlayerSeasonOverview> {
    return await getPlayerSeasonOverview(year, playerId);
  }

  /**
   * Returns returning production metrics by team and season.
   * @param year Season year. Required unless `team` is specified.
   * @param team Team name. Required unless `year` is specified.
   * @param conference Conference name or abbreviation.
   * @isInt year
   */
  @Get('returning')
  public async getReturningProduction(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
  ): Promise<ReturningProduction[]> {
    return await getReturningProduction(year, team, conference);
  }

  /**
   * Returns transfer portal entries for a season.
   * @param year Season year.
   * @isInt year
   */
  @Get('portal')
  public async getTransferPortal(
    @Query() year: number,
  ): Promise<PlayerTransfer[]> {
    return await getTransferPortal(year);
  }
}

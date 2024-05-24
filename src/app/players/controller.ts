import { Controller, Get, Hidden, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';
import {
  generateMeanPassingChart,
  getPlayerUsage,
  getReturningProduction,
  getTransferPortal,
  searchPlayers,
} from './service';
import {
  PlayerPPAChartItem,
  PlayerSearchResult,
  PlayerTransfer,
  PlayerUsage,
  ReturningProduction,
} from './types';

@Route('player')
@Middlewares(middlewares.standard)
@Tags('players')
export class PlayersController extends Controller {
  /**
   * Search for players (lists top 100 results)
   * @param searchTerm Search term for matching player name
   * @param year Optional year filter
   * @param team Optional team filter
   * @param position Optional position abbreviation filter
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
   * Retrieves player usage data for a given season
   * @param year Required year filter
   * @param conference Optional conference abbreviation filter
   * @param position Optional position abbreivation filter
   * @param team Optional team filter
   * @param playerId Optional player id filter
   * @param excludeGarbageTime Optional exclude garbage time flag, defaults to false
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
   * Retrieves returning production data. Either a year or team filter must be specified.
   * @param year Year filter, required if team not specified
   * @param team Team filter, required if year not specified
   * @param conference Optional conference filter
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
   * Retrieves transfer portal data for a given year
   * @param year Required year filter
   * @isInt year
   */
  @Get('portal')
  public async getTransferPortal(
    @Query() year: number,
  ): Promise<PlayerTransfer[]> {
    return await getTransferPortal(year);
  }
}

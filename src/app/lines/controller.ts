import { Route, Middlewares, Tags, Controller, Get, Query } from 'tsoa';

import middlewares from '../../config/middleware';
import { getLines } from './service';
import { SeasonType } from '../enums';
import { BettingGame } from './types';

@Route('lines')
@Middlewares(middlewares.standard)
@Tags('betting')
export class BettingController extends Controller {
  /**
   * Retrieves historical betting data
   * @param gameId Optional gameId filter
   * @param year Year filter, required if game id not specified
   * @param seasonType Optional season type filter
   * @param week Optional week filter
   * @param team Optional team filter
   * @param home Optional home team filter
   * @param away Optional away team filter
   * @param conference Optional conference filter
   * @isInt gameId
   * @isInt year
   * @isInt week
   */
  @Get()
  public async getLines(
    @Query() gameId?: number,
    @Query() year?: number,
    @Query() seasonType?: SeasonType,
    @Query() week?: number,
    @Query() team?: string,
    @Query() home?: string,
    @Query() away?: string,
    @Query() conference?: string,
  ): Promise<BettingGame[]> {
    return await getLines(
      gameId,
      year,
      seasonType,
      week,
      team,
      home,
      away,
      conference,
    );
  }
}

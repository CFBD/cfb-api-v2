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
   * Returns historical betting lines and results.
   * @param gameId Game ID.
   * @param year Season year. Required unless `gameId` is specified.
   * @param seasonType Season type.
   * @param week Week number.
   * @param team Team name on either side of the game.
   * @param home Home team name.
   * @param away Away team name.
   * @param conference Conference of either team.
   * @param provider Betting line provider.
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
    @Query() provider?: string,
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
      provider,
    );
  }
}

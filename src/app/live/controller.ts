import { Route, Middlewares, Tags, Controller, Get, Query } from 'tsoa';

import middlewares from '../../config/middleware';
import { LiveGame } from './types';
import { getLivePlays } from './service';

@Route('live')
@Middlewares(middlewares.standard)
export class LiveController extends Controller {
  /**
   * Returns live play-by-play data and advanced metrics for a game.
   * Results may be cached for up to five seconds after calculation.
   * @param gameId Game ID.
   * @isInt gameId
   */
  @Tags('plays')
  @Get('plays')
  @Middlewares(middlewares.requirePatreonTier(2))
  public async getLivePlays(@Query() gameId: number): Promise<LiveGame> {
    return getLivePlays(gameId);
  }
}

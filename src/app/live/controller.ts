import { Route, Middlewares, Tags, Controller, Get, Query } from 'tsoa';

import middlewares from '../../config/middleware';
import { LiveGame } from './types';
import { getLivePlays } from './service';

@Route('live')
@Middlewares(middlewares.standard)
export class LiveController extends Controller {
  /**
   * Queries live play-by-play data and advanced stats
   * @param gameId Game Id filter
   * @isInt gameId
   */
  @Tags('plays')
  @Get('plays')
  public async getLivePlays(@Query() gameId: number): Promise<LiveGame> {
    return getLivePlays(gameId);
  }
}

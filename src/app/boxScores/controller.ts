import { Controller, Get, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';
import { AdvancedBoxScore } from './types';
import { getAdvancedBoxScore } from './service';

@Route('game')
@Middlewares(middlewares.standard)
@Tags('games')
export class BoxScoresController extends Controller {
  /**
   * Retrieves an advanced box score for a game
   * @param id Required game id filter
   * @isInt id
   */
  @Get('box/advanced')
  public async getAdvancedBoxScore(
    @Query() id: number,
  ): Promise<AdvancedBoxScore> {
    return await getAdvancedBoxScore(id);
  }
}

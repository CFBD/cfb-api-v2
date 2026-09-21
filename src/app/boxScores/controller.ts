import {
  Controller,
  Get,
  Middlewares,
  Query,
  Route,
  Tags,
  Res,
  TsoaResponse,
} from 'tsoa';

import middlewares from '../../config/middleware';
import { AdvancedBoxScore } from './types';
import { getAdvancedBoxScore } from './service';

@Route('game')
@Middlewares(middlewares.standard)
@Tags('games')
export class BoxScoresController extends Controller {
  /**
   * Returns an advanced box score for a game.
   * @param id Game ID.
   * @isInt id
   */
  @Get('box/advanced')
  public async getAdvancedBoxScore(
    @Query() id: number,
    // Document the established public schema while retaining legacy wire nulls.
    @Res() _response: TsoaResponse<200, AdvancedBoxScore>,
  ): Promise<unknown> {
    void _response;
    return await getAdvancedBoxScore(id);
  }
}

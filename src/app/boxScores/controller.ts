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
import { AdvancedBoxScore, AdvancedBoxScoreError } from './types';
import { getAdvancedBoxScore } from './service';
import { UnsupportedBoxScoreError } from './wire';

@Route('game')
@Middlewares(middlewares.standard)
@Tags('games')
export class BoxScoresController extends Controller {
  /**
   * Returns an advanced box score for a game. Games without play-by-play
   * data, including games not yet played, return 404.
   * @param id Game ID.
   * @isInt id
   */
  @Get('box/advanced')
  public async getAdvancedBoxScore(
    @Query() id: number,
    // Document the established public schema while retaining legacy wire nulls.
    @Res() _response: TsoaResponse<200, AdvancedBoxScore>,
    @Res() notFound: TsoaResponse<404, AdvancedBoxScoreError>,
  ): Promise<unknown> {
    void _response;
    try {
      return await getAdvancedBoxScore(id);
    } catch (error) {
      if (error instanceof UnsupportedBoxScoreError)
        return notFound(404, {
          message: 'Advanced box score is not available for this game.',
        });
      throw error;
    }
  }
}

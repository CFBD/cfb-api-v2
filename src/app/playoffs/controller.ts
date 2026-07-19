import {
  Controller,
  Get,
  Middlewares,
  Query,
  Res,
  Response,
  Route,
  Tags,
  TsoaResponse,
} from 'tsoa';

import middlewares from '../../config/middleware';
import { getCfpGames, getCfpParticipants, getCfpPlayoff } from './service';
import {
  CfpPlayoff,
  CfpPlayoffNotFound,
  PlayoffMatchup,
  PlayoffParticipant,
  PlayoffRound,
} from './types';

type NotFoundResponse = TsoaResponse<404, CfpPlayoffNotFound>;

const notFoundBody: CfpPlayoffNotFound = {
  message: 'CFP playoff not found',
};

@Route('playoffs/cfp')
@Middlewares(middlewares.standard)
@Tags('playoffs')
export class CfpPlayoffsController extends Controller {
  /**
   * Retrieves the complete College Football Playoff bracket for a season
   * @param year Required year filter
   * @isInt year
   */
  @Get()
  @Response<{ message: string }>(400, 'Validation error')
  public async getCfpPlayoff(
    @Query() year: number,
    @Res() notFoundResponse: NotFoundResponse,
  ): Promise<CfpPlayoff> {
    const playoff = await getCfpPlayoff(year);
    return playoff ?? (notFoundResponse(404, notFoundBody) as never);
  }

  /**
   * Retrieves College Football Playoff participants for a season
   * @param year Required year filter
   * @isInt year
   */
  @Get('participants')
  @Response<{ message: string }>(400, 'Validation error')
  public async getCfpParticipants(
    @Query() year: number,
    @Res() notFoundResponse: NotFoundResponse,
  ): Promise<PlayoffParticipant[]> {
    const participants = await getCfpParticipants(year);
    return participants ?? (notFoundResponse(404, notFoundBody) as never);
  }

  /**
   * Retrieves College Football Playoff matchups for a season
   * @param year Required year filter
   * @param round Optional playoff round filter
   * @isInt year
   */
  @Get('games')
  @Response<{ message: string }>(400, 'Validation error')
  public async getCfpGames(
    @Query() year: number,
    @Res() notFoundResponse: NotFoundResponse,
    @Query() round?: PlayoffRound,
  ): Promise<PlayoffMatchup[]> {
    const games = await getCfpGames(year, round);
    return games ?? (notFoundResponse(404, notFoundBody) as never);
  }
}

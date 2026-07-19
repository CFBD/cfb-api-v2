import {
  Controller,
  Get,
  Middlewares,
  Query,
  Response,
  Route,
  Tags,
} from 'tsoa';

import middlewares from '../../config/middleware';
import { PollWeek, RankingPoll } from './types';
import { getRankings } from './service';
import { SeasonType } from '../enums';

@Route('rankings')
@Middlewares(middlewares.standard)
@Tags('rankings')
export class RankingsController extends Controller {
  /**
   * Retrieves historical poll data
   * @param year Required year filter
   * @param seasonType Optional season type filter
   * @param week Optional week filter
   * @param poll Optional poll filter
   * @param latest Return the latest CFP snapshot, preferring the marked final
   * @param final Return the marked final CFP snapshot
   * @isInt year
   */
  @Get()
  @Response<{ message: string }>(400, 'Validation error')
  public async getRankings(
    @Query() year: number,
    @Query() seasonType?: SeasonType,
    @Query() week?: number,
    @Query() poll?: RankingPoll,
    @Query() latest?: boolean,
    @Query() final?: boolean,
  ): Promise<PollWeek[]> {
    return await getRankings(year, seasonType, week, poll, latest, final);
  }
}

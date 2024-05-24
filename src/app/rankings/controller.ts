import { Route, Middlewares, Tags, Controller, Get, Query } from 'tsoa';

import middlewares from '../../config/middleware';
import { PollWeek } from './types';
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
   * @isInt year
   */
  @Get()
  public async getRankings(
    @Query() year: number,
    @Query() seasonType?: SeasonType,
    @Query() week?: number,
  ): Promise<PollWeek[]> {
    return await getRankings(year, seasonType, week);
  }
}

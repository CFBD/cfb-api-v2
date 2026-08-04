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
   * Returns historical poll rankings.
   * @param year Season year.
   * @param seasonType Season type.
   * @param week Poll week.
   * @param poll Poll name.
   * @param latest Returns the latest CFP snapshot when `true`, preferring the
   * snapshot marked as final. Requires `poll=cfp` and cannot be combined with
   * `final`.
   * @param final Returns the CFP snapshot marked as final when `true`. Requires
   * `poll=cfp` and cannot be combined with `latest`.
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

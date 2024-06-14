import { Controller, Get, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';
import { Drive } from './types';
import { getDrives } from './service';
import { DivisionClassification, SeasonType } from '../enums';

@Route('drives')
@Middlewares(middlewares.standard)
@Tags('drives')
export class DrivesController extends Controller {
  /**
   * Retrieves historical drive data
   * @param year Required year filter
   * @param seasonType Optional season type filter
   * @param week Optional week filter
   * @param team Optional team filter
   * @param offense Optional offensive team filter
   * @param defense Optional defensive team filter
   * @param conference Optional conference filter
   * @param offenseConference Optional offensive team conference filter
   * @param defenseConference Optional defensive team conference filter
   * @param classification Optional division classification filter
   * @isInt year
   * @isInt week
   */
  @Get()
  public async GetDrives(
    @Query() year: number,
    @Query() seasonType?: SeasonType,
    @Query() week?: number,
    @Query() team?: string,
    @Query() offense?: string,
    @Query() defense?: string,
    @Query() conference?: string,
    @Query() offenseConference?: string,
    @Query() defenseConference?: string,
    @Query() classification?: DivisionClassification,
  ): Promise<Drive[]> {
    return await getDrives(year, seasonType, week, team, offense, defense, offenseConference, defenseConference, conference, classification);
  }
}

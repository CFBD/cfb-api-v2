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
   * Returns historical drive data.
   * @param year Season year.
   * @param seasonType Season type.
   * @param week Week number.
   * @param team Team name on either side of the drive.
   * @param offense Offensive team name.
   * @param defense Defensive team name.
   * @param conference Conference of either team.
   * @param offenseConference Offensive team conference.
   * @param defenseConference Defensive team conference.
   * @param classification Division classification of either team.
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
    return await getDrives(
      year,
      seasonType,
      week,
      team,
      offense,
      defense,
      offenseConference,
      defenseConference,
      conference,
      classification,
    );
  }
}

import { Controller, Get, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';
import { Play, PlayStat, PlayStatType, PlayType } from './types';
import {
  getPlayStatTypes,
  getPlayStats,
  getPlayTypes,
  getPlays,
} from './service';
import { DivisionClassification, SeasonType } from '../enums';

@Route('plays')
@Middlewares(middlewares.standard)
@Tags('plays')
export class PlaysController extends Controller {
  /**
   * Returns historical play-by-play data.
   * @param year Season year.
   * @param week Week number.
   * @param team Team name on either side of the play.
   * @param offense Offensive team name.
   * @param defense Defensive team name.
   * @param offenseConference Offensive team conference.
   * @param defenseConference Defensive team conference.
   * @param conference Conference of either team.
   * @param playType Play type abbreviation.
   * @param seasonType Season type.
   * @param classification Division classification of either team.
   * @isInt year
   * @isInt week
   */
  @Get()
  public async getPlays(
    @Query() year: number,
    @Query() week: number,
    @Query() team?: string,
    @Query() offense?: string,
    @Query() defense?: string,
    @Query() offenseConference?: string,
    @Query() defenseConference?: string,
    @Query() conference?: string,
    @Query() playType?: string,
    @Query() seasonType?: SeasonType,
    @Query() classification?: DivisionClassification,
  ): Promise<Play[]> {
    return await getPlays(
      year,
      week,
      team,
      offense,
      defense,
      offenseConference,
      defenseConference,
      conference,
      playType,
      seasonType,
      classification,
    );
  }

  /**
   * Returns the available play types.
   */
  @Get('types')
  public async getPlayTypes(): Promise<PlayType[]> {
    return await getPlayTypes();
  }

  /**
   * Returns player and play-stat associations, limited to 2,000 records.
   * @param year Season year.
   * @param week Week number.
   * @param team Team name.
   * @param gameId Game ID.
   * @param athleteId Athlete ID.
   * @param statTypeId Play stat type ID.
   * @param seasonType Season type.
   * @param conference Conference name or abbreviation.
   * @isInt year
   * @isInt week
   * @isInt gameId
   * @isInt athleteId
   * @isInt statTypeId
   */
  @Get('stats')
  public async getPlayStats(
    @Query() year?: number,
    @Query() week?: number,
    @Query() team?: string,
    @Query() gameId?: number,
    @Query() athleteId?: number,
    @Query() statTypeId?: number,
    @Query() seasonType?: SeasonType,
    @Query() conference?: string,
  ): Promise<PlayStat[]> {
    return await getPlayStats(
      year,
      week,
      team,
      gameId,
      athleteId,
      statTypeId,
      seasonType,
      conference,
    );
  }

  /**
   * Returns the available play stat types.
   */
  @Get('stats/types')
  public async getPlayStatTypes(): Promise<PlayStatType[]> {
    return await getPlayStatTypes();
  }
}

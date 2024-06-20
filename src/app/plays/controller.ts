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
   * Retrieves historical play data
   * @param year Required year filter
   * @param week Required week filter
   * @param team Optional team filter
   * @param offense Optional offensive team filter
   * @param defense Optional defensive team filter
   * @param offenseConference Optional offensive conference filter
   * @param defenseConference Optional defensive conference filter
   * @param conference Optional conference filter
   * @param playType Optoinal play type abbreviation filter
   * @param seasonType Optional season type filter
   * @param classification Optional division classification filter
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
   * Retrieves available play types
   */
  @Get('types')
  public async getPlayTypes(): Promise<PlayType[]> {
    return await getPlayTypes();
  }

  /**
   * Retrieve player-play associations (limit 2000)
   * @param year Optional year filter
   * @param week Optional week filter
   * @param team Optional team filter
   * @param gameId Optional gameId filter
   * @param athleteId Optional athleteId filter
   * @param statTypeId Optional statTypeId filter
   * @param seasonType Optional season type filter
   * @param conference Optional conference filter
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
   * Retrieves available play stat types
   */
  @Get('stats/types')
  public async getPlayStatTypes(): Promise<PlayStatType[]> {
    return await getPlayStatTypes();
  }
}

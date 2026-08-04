import { Controller, Get, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';
import {
  ConferenceSP,
  ExpandedTeamSRS,
  TeamElo,
  TeamFPI,
  TeamSP,
  TeamSRS,
} from './types';
import {
  getConferenceSP,
  getElo,
  getExpandedSRS,
  getFPI,
  getSP,
  getSRS,
} from './service';
import { DivisionClassification, SeasonType } from '../enums';

@Route('ratings')
@Middlewares(middlewares.standard)
@Tags('ratings')
export class RatingsController extends Controller {
  /**
   * Returns SP+ ratings by team and season.
   * @param year Season year. Required unless `team` is specified.
   * @param team Team name. Required unless `year` is specified.
   * @isInt year
   */
  @Get('sp')
  public async getSP(
    @Query() year?: number,
    @Query() team?: string,
  ): Promise<TeamSP[]> {
    return await getSP(year, team);
  }

  /**
   * Returns conference-level SP+ ratings by season.
   * @param year Season year.
   * @param conference Conference name or abbreviation.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt year
   */
  @Get('sp/conferences')
  public async getConferenceSP(
    @Query() year?: number,
    @Query() conference?: string,
    @Query() classification?: DivisionClassification,
  ): Promise<ConferenceSP[]> {
    return await getConferenceSP(year, conference, classification);
  }

  /**
   * Returns Simple Rating System (SRS) ratings by team and season.
   * @param year Season year. Required unless `team` is specified.
   * @param team Team name. Required unless `year` is specified.
   * @param conference Conference name or abbreviation.
   * @isInt year
   */
  @Get('srs')
  public async getSRS(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
  ): Promise<TeamSRS[]> {
    return await getSRS(year, team, conference);
  }

  /**
   * Returns expanded Simple Rating System (SRS) ratings, including FCS teams.
   * @param year Season year. Required unless `team` is specified.
   * @param team Team name. Required unless `year` is specified.
   * @param conference Conference name or abbreviation.
   * @param classification Division classification: `fbs` or `fcs`.
   * @isInt year
   */
  @Get('srs/expanded')
  public async getExpandedSRS(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() classification?: DivisionClassification,
  ): Promise<ExpandedTeamSRS[]> {
    return await getExpandedSRS(year, team, conference, classification);
  }

  /**
   * Returns historical Elo ratings.
   * @param year Season year.
   * @param week Week number. Defaults to the latest available week in the
   * season.
   * @param seasonType Season type.
   * @param team Team name.
   * @param conference Conference name or abbreviation.
   * @isInt year
   * @isInt week
   */
  @Get('elo')
  public async getElo(
    @Query() year?: number,
    @Query() week?: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() conference?: string,
  ): Promise<TeamElo[]> {
    return await getElo(year, week, seasonType, team, conference);
  }

  /**
   * Returns historical Football Power Index (FPI) ratings.
   * @param year Season year. Required unless `team` is specified.
   * @param team Team name. Required unless `year` is specified.
   * @param conference Conference name or abbreviation.
   * @isInt year
   */
  @Get('fpi')
  public async getFPI(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
  ): Promise<TeamFPI[]> {
    return await getFPI(year, team, conference);
  }
}

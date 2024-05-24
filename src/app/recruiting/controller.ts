import { Route, Middlewares, Tags, Controller, Get, Query } from 'tsoa';

import middlewares from '../../config/middleware';
import {
  AggregatedTeamRecruiting,
  Recruit,
  TeamRecruitingRanking,
} from './types';
import {
  getAggregatedPlayerRatings,
  getPlayerRankings,
  getTeamRankings,
} from './service';
import { RecruitClassification } from '../enums';

@Route('recruiting')
@Middlewares(middlewares.standard)
@Tags('recruiting')
export class RecruitingController extends Controller {
  /**
   * Retrieves player recruiting rankings
   * @param year Year filter, required when no team specified
   * @param team Team filter, required when no team specified
   * @param position Optional position categorization filter
   * @param state Optional state/province filter
   * @param classification Optional recruit type classification filter, defaults to HighSchool
   * @isInt year
   */
  @Get('players')
  public async getRecruits(
    @Query() year?: number,
    @Query() team?: string,
    @Query() position?: string,
    @Query() state?: string,
    @Query() classification?: RecruitClassification,
  ): Promise<Recruit[]> {
    return getPlayerRankings(year, team, position, state, classification);
  }

  /**
   * Retrieves team recruiting rankings
   * @param year Optional year filter
   * @param team Optional team filter
   * @isInt year
   */
  @Get('teams')
  public async getTeamRecruitingRankings(
    @Query() year?: number,
    @Query() team?: string,
  ): Promise<TeamRecruitingRanking[]> {
    return getTeamRankings(year, team);
  }

  /**
   * Retrieves aggregated recruiting statistics by team and position grouping
   * @param team Optional team filter
   * @param conference Optional conference filter
   * @param recruitType Optional recruit type filter, defaults to HighSchool
   * @param startYear Optional start year range, defaults to 2000
   * @param endYear Optional end year range, defaults to current year
   * @isInt startYear
   * @isInt endYear
   */
  @Get('groups')
  public async getAggregatedTeamRecruitingRatings(
    @Query() team?: string,
    @Query() conference?: string,
    @Query() recruitType?: RecruitClassification,
    @Query() startYear?: number,
    @Query() endYear?: number,
  ): Promise<AggregatedTeamRecruiting[]> {
    return getAggregatedPlayerRatings(
      team,
      conference,
      recruitType,
      startYear,
      endYear,
    );
  }
}

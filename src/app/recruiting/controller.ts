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
   * Returns player recruiting rankings.
   * @param year Recruiting class year. Required unless `team` is specified.
   * @param team Team name. Required unless `year` is specified.
   * @param position Position category.
   * @param state State or province abbreviation.
   * @param classification Recruit classification. Defaults to `HighSchool`.
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
   * Returns team recruiting rankings.
   * @param year Recruiting class year.
   * @param team Team name.
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
   * Returns recruiting ratings aggregated by team and position group.
   * @param team Team name.
   * @param conference Conference name or abbreviation.
   * @param recruitType Recruit classification. Defaults to `HighSchool`.
   * @param startYear Earliest recruiting class year. Defaults to 2000.
   * @param endYear Latest recruiting class year. Defaults to the current year.
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

import { Controller, Get, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';
import {
  getPlayerRushingByGame,
  getPlayerRushingBySeason,
  getRushingPlays,
  getTeamRushingByGame,
  getTeamRushingBySeason,
} from './service';
import {
  PlayerRushingGame,
  PlayerRushingSeason,
  RushAttributionStatus,
  RushDirection,
  RushingPlay,
  TeamRushingGame,
  TeamRushingSeason,
} from './types';
import { DivisionClassification, SeasonType } from '../enums';

@Route('rushing')
@Middlewares(middlewares.standard)
@Tags('rushing')
export class RushingController extends Controller {
  /**
   * Returns enriched rushing attempts.
   *
   * Team results include sacks, kneels, team-only attempts, and unresolved
   * attribution. Direction eligibility identifies the ordinary-rush analysis
   * population; eligible attempts can still have an unknown direction.
   * @param gameId Game ID.
   * @param year Season year. Requires team or week.
   * @param week Week number. Requires year; either team or week is required with year.
   * @param seasonType Season type.
   * @param team Team name on either side of the rush; either team or week is required with year.
   * @param offense Rushing offense team name.
   * @param defense Defending team name.
   * @param conference Conference name or abbreviation on either side of the rush.
   * @param rusherId Rusher athlete ID.
   * @param rushDirection Rushing direction.
   * @param directionAnalysisEligible Filters attempts by ordinary direction-analysis eligibility.
   * @param attributionStatus Rusher attribution status.
   * @param isRushingTouchdown Filters known rushing touchdown results.
   * @param isSack Filters sack attempts.
   * @param isKneel Filters kneel attempts.
   * @param isTeamRush Filters team-only rushing attempts.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt gameId
   * @isInt year
   * @isInt week
   */
  @Get('plays')
  public async getRushingPlays(
    @Query() gameId?: number,
    @Query() year?: number,
    @Query() week?: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() offense?: string,
    @Query() defense?: string,
    @Query() conference?: string,
    @Query() rusherId?: string,
    @Query() rushDirection?: RushDirection,
    @Query() directionAnalysisEligible?: boolean,
    @Query() attributionStatus?: RushAttributionStatus,
    @Query() isRushingTouchdown?: boolean,
    @Query() isSack?: boolean,
    @Query() isKneel?: boolean,
    @Query() isTeamRush?: boolean,
    @Query() classification?: DivisionClassification,
  ): Promise<RushingPlay[]> {
    return await getRushingPlays(
      gameId,
      year,
      week,
      seasonType,
      team,
      offense,
      defense,
      conference,
      rusherId,
      rushDirection,
      directionAnalysisEligible,
      attributionStatus,
      isRushingTouchdown,
      isSack,
      isKneel,
      isTeamRush,
      classification,
    );
  }

  /**
   * Returns individually attributed rusher production by season.
   *
   * Player totals include only guarded rusher attribution, including
   * individually attributed sacks. They do not include team-only or unresolved
   * attempts and therefore are not expected to sum to team totals.
   * @param year Season year. Required unless rusherId is specified.
   * @param seasonType Season type.
   * @param team Team name.
   * @param conference Conference name or abbreviation.
   * @param rusherId Rusher athlete ID. Required unless year is specified.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt year
   */
  @Get('players/season')
  public async getPlayerRushingBySeason(
    @Query() year?: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() rusherId?: string,
    @Query() classification?: DivisionClassification,
  ): Promise<PlayerRushingSeason[]> {
    return await getPlayerRushingBySeason(
      year,
      seasonType,
      team,
      conference,
      rusherId,
      classification,
    );
  }

  /**
   * Returns individually attributed rusher production by game.
   *
   * Player totals include only guarded rusher attribution, including
   * individually attributed sacks. They do not include team-only or unresolved
   * attempts and therefore are not expected to sum to team totals.
   * @param year Season year. Requires team or week; optional when rusherId is specified alone.
   * @param week Week number. Requires year; either team or week is required with year.
   * @param seasonType Season type.
   * @param team Team name; either team or week is required with year.
   * @param conference Conference name or abbreviation.
   * @param rusherId Rusher athlete ID. Required unless year is specified.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt year
   * @isInt week
   */
  @Get('players/games')
  public async getPlayerRushingByGame(
    @Query() year?: number,
    @Query() week?: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() rusherId?: string,
    @Query() classification?: DivisionClassification,
  ): Promise<PlayerRushingGame[]> {
    return await getPlayerRushingByGame(
      year,
      week,
      seasonType,
      team,
      conference,
      rusherId,
      classification,
    );
  }

  /**
   * Returns team rushing production by season.
   *
   * Team totals include sacks, kneels, team-only attempts, and unresolved
   * attribution. Defense contains rushing production allowed.
   * @param year Season year. Required unless team is specified.
   * @param seasonType Season type.
   * @param team Team name. Required unless year is specified.
   * @param conference Conference name or abbreviation.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt year
   */
  @Get('teams/season')
  public async getTeamRushingBySeason(
    @Query() year?: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() classification?: DivisionClassification,
  ): Promise<TeamRushingSeason[]> {
    return await getTeamRushingBySeason(
      year,
      seasonType,
      team,
      conference,
      classification,
    );
  }

  /**
   * Returns team rushing production by game.
   *
   * Team totals include sacks, kneels, team-only attempts, and unresolved
   * attribution. Defense contains rushing production allowed.
   * @param year Season year. Required.
   * @param week Week number. Either team or week is required.
   * @param seasonType Season type.
   * @param team Team name. Either team or week is required.
   * @param conference Conference name or abbreviation.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt year
   * @isInt week
   */
  @Get('teams/games')
  public async getTeamRushingByGame(
    @Query() year: number,
    @Query() week?: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() classification?: DivisionClassification,
  ): Promise<TeamRushingGame[]> {
    return await getTeamRushingByGame(
      year,
      week,
      seasonType,
      team,
      conference,
      classification,
    );
  }
}

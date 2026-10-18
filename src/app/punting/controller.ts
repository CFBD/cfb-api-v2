import { Controller, Get, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';
import {
  getPlayerPuntingByGame,
  getPlayerPuntingBySeason,
  getPuntingPlays,
  getTeamPuntingByGame,
  getTeamPuntingBySeason,
} from './service';
import {
  PlayerPuntingGame,
  PlayerPuntingSeason,
  PuntingPlay,
  TeamPuntingGame,
  TeamPuntingSeason,
} from './types';
import { DivisionClassification, SeasonType } from '../enums';

@Route('punting')
@Middlewares(middlewares.standard)
@Tags('punting')
export class PuntingController extends Controller {
  /**
   * Returns enriched punt plays with gross, return, and net yardage, field
   * position, and punt outcomes.
   * @param gameId Game ID.
   * @param year Season year. Required unless gameId is specified.
   * @param week Week number. Either week, a team filter, punterId, or returnerId is required with year.
   * @param seasonType Season type.
   * @param team Team name on either side of the punt.
   * @param puntingTeam Punting team name.
   * @param receivingTeam Receiving team name.
   * @param conference Conference name or abbreviation on either side of the punt.
   * @param punterId Punter athlete ID.
   * @param returnerId Returner athlete ID.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt gameId
   * @isInt year
   * @isInt week
   */
  @Get('plays')
  public async getPuntingPlays(
    @Query() gameId?: number,
    @Query() year?: number,
    @Query() week?: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() puntingTeam?: string,
    @Query() receivingTeam?: string,
    @Query() conference?: string,
    @Query() punterId?: string,
    @Query() returnerId?: string,
    @Query() classification?: DivisionClassification,
  ): Promise<PuntingPlay[]> {
    return await getPuntingPlays({
      gameId,
      year,
      week,
      seasonType,
      team,
      puntingTeam,
      receivingTeam,
      conference,
      punterId,
      returnerId,
      classification,
    });
  }

  /**
   * Returns individually attributed punting and punt return production by
   * season.
   *
   * Player totals do not include team-only or unattributed punts and returns,
   * and therefore are not expected to sum to team totals.
   * @param year Season year. Required.
   * @param seasonType Season type.
   * @param team Team name.
   * @param conference Conference name or abbreviation.
   * @param playerId Player athlete ID.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt year
   */
  @Get('players/season')
  public async getPlayerPuntingBySeason(
    @Query() year: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() playerId?: string,
    @Query() classification?: DivisionClassification,
  ): Promise<PlayerPuntingSeason[]> {
    return await getPlayerPuntingBySeason({
      year,
      seasonType,
      team,
      conference,
      playerId,
      classification,
    });
  }

  /**
   * Returns individually attributed punting and punt return production by
   * game.
   *
   * Player totals do not include team-only or unattributed punts and returns,
   * and therefore are not expected to sum to team totals.
   * @param year Season year. Required.
   * @param week Week number.
   * @param seasonType Season type.
   * @param team Team name.
   * @param conference Conference name or abbreviation.
   * @param playerId Player athlete ID.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt year
   * @isInt week
   */
  @Get('players/games')
  public async getPlayerPuntingByGame(
    @Query() year: number,
    @Query() week?: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() playerId?: string,
    @Query() classification?: DivisionClassification,
  ): Promise<PlayerPuntingGame[]> {
    return await getPlayerPuntingByGame({
      year,
      week,
      seasonType,
      team,
      conference,
      playerId,
      classification,
    });
  }

  /**
   * Returns team punting and punt return production by season.
   *
   * Punting describes the team's punts. Returning describes opponent punts and
   * the team's returns.
   * @param year Season year. Required.
   * @param seasonType Season type.
   * @param team Team name.
   * @param conference Conference name or abbreviation.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt year
   */
  @Get('teams/season')
  public async getTeamPuntingBySeason(
    @Query() year: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() classification?: DivisionClassification,
  ): Promise<TeamPuntingSeason[]> {
    return await getTeamPuntingBySeason({
      year,
      seasonType,
      team,
      conference,
      classification,
    });
  }

  /**
   * Returns team punting and punt return production by game.
   *
   * Punting describes the team's punts. Returning describes opponent punts and
   * the team's returns.
   * @param year Season year. Required.
   * @param week Week number.
   * @param seasonType Season type.
   * @param team Team name.
   * @param conference Conference name or abbreviation.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt year
   * @isInt week
   */
  @Get('teams/games')
  public async getTeamPuntingByGame(
    @Query() year: number,
    @Query() week?: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() classification?: DivisionClassification,
  ): Promise<TeamPuntingGame[]> {
    return await getTeamPuntingByGame({
      year,
      week,
      seasonType,
      team,
      conference,
      classification,
    });
  }
}

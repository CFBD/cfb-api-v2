import { Controller, Get, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';
import {
  getPassingPlays,
  getPlayerPassingByGame,
  getPlayerPassingBySeason,
  getTeamPassingByGame,
  getTeamPassingBySeason,
} from './service';
import {
  PassOutcome,
  PassingPlay,
  PlayerPassingGame,
  PlayerPassingSeason,
  TeamPassingGame,
  TeamPassingSeason,
} from './types';
import { DivisionClassification, SeasonType } from '../enums';

@Route('passing')
@Middlewares(middlewares.standard)
@Tags('passing')
export class PassingController extends Controller {
  /**
   * Returns enriched pass attempts.
   * @param year Season year.
   * @param team Team name on either side of the pass. Either team or week is required.
   * @param week Week number. Either team or week is required.
   * @param gameId Game ID.
   * @param seasonType Season type.
   * @param offense Offensive team name.
   * @param defense Defensive team name.
   * @param conference Conference name or abbreviation on either side of the pass.
   * @param passerId Passer athlete ID.
   * @param targetId Intended target athlete ID.
   * @param outcome Pass outcome.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt gameId
   * @isInt year
   * @isInt week
   */
  @Get('plays')
  public async getPassingPlays(
    @Query() year: number,
    @Query() team?: string,
    @Query() week?: number,
    @Query() gameId?: number,
    @Query() seasonType?: SeasonType,
    @Query() offense?: string,
    @Query() defense?: string,
    @Query() conference?: string,
    @Query() passerId?: string,
    @Query() targetId?: string,
    @Query() outcome?: PassOutcome,
    @Query() classification?: DivisionClassification,
  ): Promise<PassingPlay[]> {
    return await getPassingPlays(
      gameId,
      year,
      week,
      seasonType,
      team,
      offense,
      defense,
      conference,
      passerId,
      targetId,
      outcome,
      classification,
    );
  }

  /**
   * Returns passer production by season.
   * @param year Season year. Required unless passerId is specified.
   * @param seasonType Season type.
   * @param team Team name.
   * @param conference Conference name or abbreviation.
   * @param passerId Passer athlete ID. Required unless year is specified.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt year
   */
  @Get('players/season')
  public async getPlayerPassingBySeason(
    @Query() year?: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() passerId?: string,
    @Query() classification?: DivisionClassification,
  ): Promise<PlayerPassingSeason[]> {
    return await getPlayerPassingBySeason(
      year,
      seasonType,
      team,
      conference,
      passerId,
      classification,
    );
  }

  /**
   * Returns passer production by game.
   * @param year Season year. Required.
   * @param week Week number. Either passerId, team, or week is required.
   * @param seasonType Season type.
   * @param team Team name. Either passerId, team, or week is required.
   * @param conference Conference name or abbreviation.
   * @param passerId Passer athlete ID. Either passerId, team, or week is required.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt year
   * @isInt week
   */
  @Get('players/games')
  public async getPlayerPassingByGame(
    @Query() year: number,
    @Query() week?: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() passerId?: string,
    @Query() classification?: DivisionClassification,
  ): Promise<PlayerPassingGame[]> {
    return await getPlayerPassingByGame(
      year,
      week,
      seasonType,
      team,
      conference,
      passerId,
      classification,
    );
  }

  /**
   * Returns team passing production by season.
   * @param year Season year. Required unless team is specified.
   * @param seasonType Season type.
   * @param team Team name. Required unless year is specified.
   * @param conference Conference name or abbreviation.
   * @param classification Division classification. Defaults to `fbs`.
   * @isInt year
   */
  @Get('teams/season')
  public async getTeamPassingBySeason(
    @Query() year?: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() classification?: DivisionClassification,
  ): Promise<TeamPassingSeason[]> {
    return await getTeamPassingBySeason(
      year,
      seasonType,
      team,
      conference,
      classification,
    );
  }

  /**
   * Returns team passing production by game.
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
  public async getTeamPassingByGame(
    @Query() year: number,
    @Query() week?: number,
    @Query() seasonType?: SeasonType,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() classification?: DivisionClassification,
  ): Promise<TeamPassingGame[]> {
    return await getTeamPassingByGame(
      year,
      week,
      seasonType,
      team,
      conference,
      classification,
    );
  }
}

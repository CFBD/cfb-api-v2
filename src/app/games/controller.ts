import { Controller, Get, Middlewares, Query, Route, Tags } from 'tsoa';

import middlewares from '../../config/middleware';
import {
  CalendarWeek,
  Game,
  GameMedia,
  GamePlayerStats,
  GameTeamStats,
  GameWeather,
  ScoreboardGame,
  TeamRecords,
} from './types';
import {
  getCalendar,
  getGamePlayerStats,
  getGameTeamStats,
  getGames,
  getMedia,
  getRecords,
  getScoreboard,
  getWeather,
} from './service';
import { DivisionClassification, MediaType, SeasonType } from '../enums';

@Route('games')
@Middlewares(middlewares.standard)
@Tags('games')
export class GamesController extends Controller {
  /**
   * Retrieves historical game data
   * @param year Required year filter (except when id is specified)
   * @param week Optional week filter
   * @param seasonType Optional season type filter
   * @param classification Optional division classification filter
   * @param team Optional team filter
   * @param home Optional home team filter
   * @param away Optional away team filter
   * @param conference Optional conference filter
   * @param id Game id filter to retrieve a single game
   * @isInt year
   * @isInt week
   * @isInt id
   */
  @Get()
  public async getGames(
    @Query() year?: number,
    @Query() week?: number,
    @Query() seasonType?: SeasonType,
    @Query() classification?: DivisionClassification,
    @Query() team?: string,
    @Query() home?: string,
    @Query() away?: string,
    @Query() conference?: string,
    @Query() id?: number,
  ): Promise<Game[]> {
    return await getGames(
      year,
      week,
      seasonType,
      classification,
      team,
      home,
      away,
      conference,
      id,
    );
  }

  /**
   * Retrieves team box score statistics
   * @param year Required year filter (along with one of week, team, or conference), unless id is specified
   * @param week Optional week filter, required if team and conference not specified
   * @param team Optional team filter, required if week and conference not specified
   * @param conference Optional conference filter, required if week and team not specified
   * @param classification Optional division classification filter
   * @param seasonType Optional season type filter
   * @param id Optional id filter to retrieve a single game
   * @isInt year
   * @isInt week
   * @isInt id
   */
  @Get('teams')
  public async getGameTeamStats(
    @Query() year?: number,
    @Query() week?: number,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() classification?: DivisionClassification,
    @Query() seasonType?: SeasonType,
    @Query() id?: number,
  ): Promise<GameTeamStats[]> {
    return await getGameTeamStats(
      year,
      week,
      team,
      conference,
      classification,
      seasonType,
      id,
    );
  }

  /**
   * Retrieves player box score statistics
   * @param year Required year filter (along with one of week, team, or conference), unless id is specified
   * @param week Optional week filter, required if team and conference not specified
   * @param team Optional team filter, required if week and conference not specified
   * @param conference Optional conference filter, required if week and team not specified
   * @param classification Optional division classification filter
   * @param seasonType Optional season type filter
   * @param category Optional player statistical category filter
   * @param id Optional id filter to retrieve a single game
   * @isInt year
   * @isInt week
   * @isInt id
   */
  @Get('players')
  public async getGamePlayerStats(
    @Query() year?: number,
    @Query() week?: number,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() classification?: DivisionClassification,
    @Query() seasonType?: SeasonType,
    @Query() category?: string,
    @Query() id?: number,
  ): Promise<GamePlayerStats[]> {
    return await getGamePlayerStats(
      year,
      week,
      team,
      conference,
      classification,
      seasonType,
      category,
      id,
    );
  }

  /**
   * Retrieves media information for games
   * @param year Required year filter
   * @param seasonType Optional season type filter
   * @param week Optional week filter
   * @param team Optional team filter
   * @param conference Optional conference filter
   * @param mediaType Optional media type filter
   * @param classification Optional division classification filter
   * @isInt year
   * @isInt week
   */
  @Get('media')
  public async getMedia(
    @Query() year: number,
    @Query() seasonType?: SeasonType,
    @Query() week?: number,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() mediaType?: MediaType,
    @Query() classification?: DivisionClassification,
  ): Promise<GameMedia[]> {
    return await getMedia(
      year,
      seasonType,
      week,
      team,
      conference,
      mediaType,
      classification,
    );
  }

  /**
   * Retrieve historical and future weather data (Patreon only)
   * @param year Year filter, required if game id not specified
   * @param seasonType Optional season type filter
   * @param week Optional week filter
   * @param team Optional team filter
   * @param conference Optional conference filter
   * @param classification Optional division classification filter
   * @param gameId Filter for retrieving a single game
   * @isInt year
   * @isInt week
   * @isInt gameId
   */
  @Get('weather')
  public async getWeather(
    @Query() year?: number,
    @Query() seasonType?: SeasonType,
    @Query() week?: number,
    @Query() team?: string,
    @Query() conference?: string,
    @Query() classification?: DivisionClassification,
    @Query() gameId?: number,
  ): Promise<GameWeather[]> {
    return await getWeather(
      year,
      seasonType,
      week,
      team,
      conference,
      classification,
      gameId,
    );
  }
}

@Route('records')
@Middlewares(middlewares.standard)
@Tags('games')
export class RecordsController extends Controller {
  /**
   * Retrieves historical team records
   * @param year Year filter, required if team not specified
   * @param team Team filter, required if year not specified
   * @param conference Optional conference filter
   * @isInt year
   */
  @Get()
  public async getRecords(
    @Query() year?: number,
    @Query() team?: string,
    @Query() conference?: string,
  ): Promise<TeamRecords[]> {
    return await getRecords(year, team, conference);
  }
}

@Route('calendar')
@Middlewares(middlewares.standard)
@Tags('games')
export class CalendarController extends Controller {
  /**
   * Retrieves calendar information
   * @param year Required year filter
   * @isInt year
   */
  @Get()
  public async getCalendar(@Query() year: number): Promise<CalendarWeek[]> {
    return await getCalendar(year);
  }
}

@Route('scoreboard')
@Middlewares(middlewares.standard)
@Tags('games')
export class ScoreboardController extends Controller {
  /**
   * Retrieves live scoreboard data
   * @param classification Optional division classification filter, defaults to fbs
   * @param conference Optional conference filter
   */
  @Get()
  public async getScoreboard(
    @Query() classification?: DivisionClassification,
    @Query() conference?: string,
  ): Promise<ScoreboardGame[]> {
    return await getScoreboard(classification, conference);
  }
}

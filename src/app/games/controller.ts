import {
  Controller,
  Get,
  Middlewares,
  Query,
  Response,
  Route,
  Tags,
} from 'tsoa';

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
import { PlayoffCompetition, PlayoffRound } from '../playoffs/types';

@Route('games')
@Middlewares(middlewares.standard)
@Tags('games')
export class GamesController extends Controller {
  /**
   * Returns historical game data.
   * @param year Season year. Required unless `id` is specified.
   * @param week Week number.
   * @param seasonType Season type.
   * @param classification Division classification.
   * @param team Team name on either side of the game.
   * @param home Home team name.
   * @param away Away team name.
   * @param conference Conference of either team.
   * @param id Game ID. When specified, returns data for that game.
   * @param competition Playoff competition.
   * @param round Playoff round. Requires `competition`.
   * @isInt year
   * @isInt week
   * @isInt id
   */
  @Get()
  @Response<{ message: string }>(400, 'Validation error')
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
    @Query() competition?: PlayoffCompetition,
    @Query() round?: PlayoffRound,
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
      competition,
      round,
    );
  }

  /**
   * Returns team box score statistics by game.
   * @param year Season year. Required unless `id` is specified.
   * @param week Week number. One of `week`, `team`, or `conference` is required
   * when filtering by year.
   * @param team Team name. One of `week`, `team`, or `conference` is required
   * when filtering by year.
   * @param conference Conference name or abbreviation. One of `week`, `team`,
   * or `conference` is required when filtering by year.
   * @param classification Division classification.
   * @param seasonType Season type.
   * @param id Game ID. When specified, returns statistics for that game.
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
   * Returns player box score statistics by game.
   * @param year Season year. Required unless `id` is specified.
   * @param week Week number. One of `week`, `team`, or `conference` is required
   * when filtering by year.
   * @param team Team name. One of `week`, `team`, or `conference` is required
   * when filtering by year.
   * @param conference Conference name or abbreviation. One of `week`, `team`,
   * or `conference` is required when filtering by year.
   * @param classification Division classification.
   * @param seasonType Season type.
   * @param category Player statistical category.
   * @param id Game ID. When specified, returns statistics for that game.
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
   * Returns broadcast and media information for games.
   * @param year Season year.
   * @param seasonType Season type.
   * @param week Week number.
   * @param team Team name.
   * @param conference Conference name or abbreviation.
   * @param mediaType Media type.
   * @param classification Division classification.
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
   * Returns historical and forecast weather data for games. Requires Patreon.
   * @param year Season year. Required unless `gameId` is specified.
   * @param seasonType Season type.
   * @param week Week number.
   * @param team Team name.
   * @param conference Conference name or abbreviation.
   * @param classification Division classification.
   * @param gameId Game ID. When specified, returns weather for that game.
   * @isInt year
   * @isInt week
   * @isInt gameId
   */
  @Get('weather')
  @Middlewares(middlewares.requirePatreonTier(1))
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
   * Returns historical team records by season.
   * @param year Season year. Required unless `team` is specified.
   * @param team Team name. Required unless `year` is specified.
   * @param conference Conference name or abbreviation.
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
   * Returns the week-by-week season calendar.
   * @param year Season year.
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
   * Returns current scoreboard data.
   * @param classification Division classification. Defaults to `fbs`.
   * @param conference Conference name or abbreviation.
   */
  @Get()
  @Middlewares(middlewares.requirePatreonTier(1))
  public async getScoreboard(
    @Query() classification?: DivisionClassification,
    @Query() conference?: string,
  ): Promise<ScoreboardGame[]> {
    return await getScoreboard(classification, conference);
  }
}

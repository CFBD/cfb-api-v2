import { DivisionClassification, GameStatus, MediaType, SeasonType } from '../enums';

export interface Game {
  /**
   * @isInt
   */
  id: number;
  /**
   * @isInt
   */
  season: number;
  /**
   * @isInt
   */
  week: number;
  seasonType: SeasonType;
  /**
   * @isDateTime
   */
  startDate: Date;
  startTimeTBD: boolean;
  completed: boolean;
  neutralSite: boolean;
  conferenceGame: boolean;
  /**
   * @isInt
   */
  attendance: number | null;
  /**
   * @isInt
   */
  venueId: number;
  venue: string;
  /**
   * @isInt
   */
  homeId: number;
  homeTeam: string;
  homeConference: string;
  homeDivision: string;
  /**
   * @isInt
   */
  homePoints: number | null;
  /**
   * @minItems 4
   */
  homeLineScores: number[] | null;
  homePostgameWinProbability: number | null;
  /**
   * @isInt
   */
  homePregameElo: number | null;
  /**
   * @isInt
   */
  homePostgameElo: number | null;
  /**
   * @isInt
   */
  awayId: number;
  awayTeam: string;
  awayConference: string;
  awayDivision: string;
  /**
   * @isInt
   */
  awayPoints: number | null;
  /**
   * @minItems 4
   */
  awayLineScores: number[] | null;
  awayPostgameWinProbability: number | null;
  /**
   * @isInt
   */
  awayPregameElo: number | null;
  /**
   * @isInt
   */
  awayPostgameElo: number | null;
  excitementIndex: number | null;
}

export interface GameTeamStats {
  /**
   * @isInt
   */
  id: number;
  teams: GameTeamStatsTeam[];
}

export interface GameTeamStatsTeam {
  /**
   * @isInt
   */
  teamId: number;
  team: string;
  conference: string;
  homeAway: 'home' | 'away';
  /**
   * @isInt
   */
  points: number;
  stats: GameTeamStatsTeamStat[];
}

export interface GameTeamStatsTeamStat {
  category: string;
  stat: string;
}

export interface GamePlayerStats {
  /**
   * @isInt
   */
  id: number;
  teams: GamePlayerStatsTeam[];
}

export interface GamePlayerStatsTeam {
  team: string;
  conference: string;
  homeAway: 'home' | 'away';
  /**
   * @isInt
   */
  points: number;
  categories: GamePlayerStatCategories[];
}

export interface GamePlayerStatCategories {
  name: string;
  types: GamePlayerStatTypes[];
}

export interface GamePlayerStatTypes {
  name: string;
  athletes: GamePlayerStatPlayer[];
}

export interface GamePlayerStatPlayer {
  /**
   * @isInt
   */
  id: number;
  name: string;
  stat: string;
}

export interface GameMedia {
  /**
   * @isInt
   */
  id: number;
  /**
   * @isInt
   */
  season: number;
  /**
   * @isInt
   */
  week: number;
  seasonType: SeasonType;
  /**
   * @isDateTime
   */
  startTime: Date;
  isStartTimeTBD: boolean;
  homeTeam: string;
  homeConference: string;
  awayTeam: string;
  awayConference: string;
  mediaType: MediaType;
  outlet: string;
}

export interface GameWeather {
  /**
   * @isInt
   */
  id: number;
  /**
   * @isInt
   */
  season: number;
  /**
   * @isInt
   */
  week: number;
  seasonType: SeasonType;
  /**
   * @isDateTime
   */
  startTime: Date;
  gameIndoors: boolean;
  homeTeam: string;
  homeConference: string;
  awayTeam: string;
  awayConference: string;
  /**
   * @isInt
   */
  venueId: number;
  venue: string;
  temperature: number | null;
  dewPoint: number | null;
  humidity: number | null;
  precipitation: number | null;
  snowfall: number | null;
  windDirection: number | null;
  windSpeed: number | null;
  pressure: number | null;
  weatherConditionCode: number | null;
  weatherCondition: string;
}

export interface TeamRecord {
  /**
   * @isInt
   */
  games: number;
  /**
   * @isInt
   */
  wins: number;
  /**
   * @isInt
   */
  losses: number;
  /**
   * @isInt
   */
  ties: number;
}

export interface TeamRecords {
  /**
   * @isInt
   */
  year: number;
  /**
   * @isInt
   */
  teamId: number;
  team: string;
  classification: DivisionClassification;
  conference: string;
  division: string;
  expectedWins: number;
  total: TeamRecord;
  conferenceGames: TeamRecord;
  homeGames: TeamRecord;
  awayGames: TeamRecord;
  neutralSiteGames: TeamRecord;
}

export interface CalendarWeek {
  /**
   * @isInt
   */
  season: number;
  /**
   * @isInt
   */
  week: number;
  seasonType: SeasonType;
  /**
   * @isDateTime
   */
  firstGameStart: Date;
  /**
   * @isDateTime
   */
  lastGameStart: Date;
}

export interface ScoreboardGame {
  /**
   * @isInt
   */
  id: number;
  /**
   * @isDateTime
   */
  startDate: Date;
  startTimeTBD: boolean;
  tv: string;
  neutralSite: boolean;
  conferenceGame: boolean;
  status: GameStatus;
  /**
   * @isInt
   */
  period: number | null;
  clock: string | null;
  situation: string | null;
  possession: string | null;
  venue: {
    name: string;
    city: string;
    state: string;
  };
  homeTeam: {
    /**
     * @isInt
     */
    id: number;
    name: string;
    conference: string;
    classification: DivisionClassification;
    /**
     * @isInt
     */
    points: number | null;
  };
  awayTeam: {
    /**
     * @isInt
     */
    id: number;
    name: string;
    conference: string;
    classification: DivisionClassification;
    /**
     * @isInt
     */
    points: number | null;
  };
  weather: {
    temperature: number | null;
    description: string | null;
    windSpeed: number | null;
    windDirection: number | null;
  };
  betting: {
    spread: number | null;
    overUnder: number | null;
    homeMoneyline: number | null;
    awayMoneyline: number | null;
  };
}

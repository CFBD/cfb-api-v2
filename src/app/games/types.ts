import {
  DivisionClassification,
  GameStatus,
  MediaType,
  SeasonType,
} from '../enums';

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
  venueId: number | null;
  venue: string | null;
  /**
   * @isInt
   */
  homeId: number;
  homeTeam: string;
  homeConference: string | null;
  homeClassification: DivisionClassification | null;
  /**
   * @isInt
   */
  homePoints: number | null;
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
  awayConference: string | null;
  awayClassification: DivisionClassification | null;
  /**
   * @isInt
   */
  awayPoints: number | null;
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
  highlights: string | null;
  notes: string | null;
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
  conference: string | null;
  homeAway: 'home' | 'away';
  /**
   * @isInt
   */
  points: number | null;
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
  conference: string | null;
  homeAway: 'home' | 'away';
  /**
   * @isInt
   */
  points: number | null;
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
  id: string;
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
  homeConference: string | null;
  awayTeam: string;
  awayConference: string | null;
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
  homeConference: string | null;
  awayTeam: string;
  awayConference: string | null;
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
  weatherCondition: string | null;
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
  classification: DivisionClassification | null;
  conference: string;
  division: string;
  expectedWins: number | null;
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
  startDate: Date;
  /**
   * @isDateTime
   */
  endDate: Date;
  /**
   * @isDateTime
   * @deprecated
   */
  firstGameStart: Date;
  /**
   * @isDateTime
   * @deprecated
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
  tv: string | null;
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
  lastPlay: string | null;
  venue: {
    name: string | null;
    city: string | null;
    state: string | null;
  };
  homeTeam: {
    /**
     * @isInt
     */
    id: number;
    name: string;
    conference: string | null;
    classification: DivisionClassification | null;
    /**
     * @isInt
     */
    points: number | null;
    /**
     * @isInt
     */
    lineScores: number[] | null;
  };
  awayTeam: {
    /**
     * @isInt
     */
    id: number;
    name: string;
    conference: string | null;
    classification: DivisionClassification | null;
    /**
     * @isInt
     */
    points: number | null;
    /**
     * @isInt
     */
    lineScores: number[] | null;
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

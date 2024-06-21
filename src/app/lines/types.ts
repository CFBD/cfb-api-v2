import { SeasonType } from '../enums';

export interface BettingGame {
  /**
   * @isInt
   */
  id: number;
  /**
   * @isInt
   */
  season: number;
  seasonType: SeasonType;
  /**
   * @isInt
   */
  week: number;
  /**
   * @isDateTime
   */
  startDate: Date;
  homeTeam: string;
  homeConference: string | null;
  /**
   * @isInt
   */
  homeScore: number | null;
  awayTeam: string;
  awayConference: string | null;
  /**
   * @isInt
   */
  awayScore: number | null;
  lines: GameLine[];
}

export interface GameLine {
  provider: string;
  spread: number | null;
  formattedSpread: string;
  spreadOpen: number | null;
  overUnder: number | null;
  overUnderOpen: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
}

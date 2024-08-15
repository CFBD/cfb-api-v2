import { SeasonType } from '../enums';

export interface PredictedPointsValue {
  /**
   * @isInt
   */
  yardLine: number;
  predictedPoints: number;
}

export interface TeamSeasonPredictedPointsAdded {
  /**
   * @isInt
   */
  season: number;
  conference: string;
  team: string;
  offense: {
    overall: number;
    passing: number;
    rushing: number;
    firstDown: number;
    secondDown: number;
    thirdDown: number;
    cumulative: {
      total: number;
      passing: number;
      rushing: number;
    };
  };
  defense: {
    overall: number;
    passing: number;
    rushing: number;
    firstDown: number;
    secondDown: number;
    thirdDown: number;
    cumulative: {
      total: number;
      passing: number;
      rushing: number;
    };
  };
}

export interface TeamGamePredictedPointsAdded {
  /**
   * @isInt
   */
  gameId: number;
  /**
   * @isInt
   */
  season: number;
  /**
   * @isInt
   */
  week: number;
  seasonType: SeasonType;
  team: string;
  conference: string;
  opponent: string;
  offense: {
    overall: number;
    passing: number;
    rushing: number;
    firstDown: number;
    secondDown: number;
    thirdDown: number;
  };
  defense: {
    overall: number;
    passing: number;
    rushing: number;
    firstDown: number;
    secondDown: number;
    thirdDown: number;
  };
}

export interface PlayerGamePredictedPointsAdded {
  /**
   * @isInt
   */
  season: number;
  /**
   * @isInt
   */
  week: number;
  seasonType: SeasonType;
  id: string;
  name: string;
  position: string;
  team: string;
  opponent: string;
  averagePPA: {
    all: number;
    pass?: number;
    rush?: number;
  };
}

export interface PlayerSeasonPredictedPointsAdded {
  /**
   * @isInt
   */
  season: number;
  id: string;
  name: string;
  position: string;
  team: string;
  conference: string;
  averagePPA: {
    all: number;
    pass?: number;
    rush?: number;
    firstDown?: number;
    secondDown?: number;
    thirdDown?: number;
    standardDowns?: number;
    passingDowns?: number;
  };
  totalPPA: {
    all: number;
    pass?: number;
    rush?: number;
    firstDown?: number;
    secondDown?: number;
    thirdDown?: number;
    standardDowns?: number;
    passingDowns?: number;
  };
}

export interface PregameWinProbability {
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
   * @isInt
   */
  gameId: number;
  homeTeam: string;
  awayTeam: string;
  spread: number;
  homeWinProbability: number;
}

export interface FieldGoalEP {
  /**
   * @isInt
   */
  yardsToGoal: number;
  /**
   * @isInt
   */
  distance: number;
  expectedPoints: number;
}

export interface PlayWinProbability {
  /**
   * @isInt
   */
  gameId: number;
  playId: string;
  playText: string;
  /**
   * @isInt
   */
  homeId: number;
  home: string;
  /**
   * @isInt
   */
  awayId: number;
  away: string;
  spread: number;
  homeBall: boolean;
  /**
   * @isInt
   */
  homeScore: number;
  /**
   * @isInt
   */
  awayScore: number;
  /**
   * @isInt
   */
  yardLine: number;
  /**
   * @isInt
   */
  down: number;
  /**
   * @isInt
   */
  distance: number;
  homeWinProbability: number;
  /**
   * @isInt
   */
  playNumber: number;
}

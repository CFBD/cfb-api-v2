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

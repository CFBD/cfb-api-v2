import { DivisionClassification } from '../enums';

export type CoreRatingSeasonType = 'regular' | 'postseason';

export interface TeamCoreRating {
  /**
   * @isInt
   */
  year: number;
  throughSeasonType: CoreRatingSeasonType;
  /**
   * @isInt
   */
  throughWeek: number;
  team: string;
  conference: string | null;
  /** Offense-minus-defense composite; higher is better. */
  overall: number;
  /** Points created above average per 100 qualifying plays; higher is better. */
  offense: number;
  /** Points allowed above average per 100 qualifying plays; lower is better. */
  defense: number;
  /**
   * @isInt
   */
  offensePlays: number;
  /**
   * @isInt
   */
  defensePlays: number;
  modelVersion: string;
}

export interface TeamSP {
  /**
   * @isInt
   */
  year: number;
  team: string;
  conference: string | null;
  rating: number;
  /**
   * @isInt
   */
  ranking: number | null;
  secondOrderWins: number | null;
  sos: number | null;
  offense: {
    /**
     * @isInt
     */
    ranking: number | null;
    rating: number;
    success: number | null;
    explosiveness: number | null;
    rushing: number | null;
    passing: number | null;
    standardDowns: number | null;
    passingDowns: number | null;
    runRate: number | null;
    pace: number | null;
  };
  defense: {
    /**
     * @isInt
     */
    ranking: number | null;
    rating: number;
    success: number | null;
    explosiveness: number | null;
    rushing: number | null;
    passing: number | null;
    standardDowns: number | null;
    passingDowns: number | null;
    havoc: {
      total: number | null;
      frontSeven: number | null;
      db: number | null;
    };
  };
  specialTeams: {
    rating: number | null;
  };
}

export interface ConferenceSP {
  /**
   * @isInt
   */
  year: number;
  conference: string;
  rating: number;
  secondOrderWins: number | null;
  sos: number | null;
  offense: {
    rating: number;
    success: number | null;
    explosiveness: number | null;
    rushing: number | null;
    passing: number | null;
    standardDowns: number | null;
    passingDowns: number | null;
    runRate: number | null;
    pace: number | null;
  };
  defense: {
    rating: number;
    success: number | null;
    explosiveness: number | null;
    rushing: number | null;
    passing: number | null;
    standardDowns: number | null;
    passingDowns: number | null;
    havoc: {
      total: number | null;
      frontSeven: number | null;
      db: number | null;
    };
  };
  specialTeams: {
    rating: number | null;
  };
}

export interface TeamSRS {
  /**
   * @isInt
   */
  year: number;
  team: string;
  conference: string | null;
  division: string | null;
  rating: number;
  /**
   * @isInt
   */
  ranking: number | null;
}

export interface ExpandedTeamSRS extends TeamSRS {
  classification: DivisionClassification;
}

export interface TeamElo {
  /**
   * @isInt
   */
  year: number;
  team: string;
  conference: string;
  /**
   * @isInt
   */
  elo: number | null;
}

export interface TeamFPI {
  /**
   * @isInt
   */
  year: number;
  team: string;
  conference: string | null;
  fpi: number | null;
  resumeRanks: {
    /**
     * @isInt
     */
    strengthOfRecord: number | null;
    /**
     * @isInt
     */
    fpi: number | null;
    /**
     * @isInt
     */
    averageWinProbability: number | null;
    /**
     * @isInt
     */
    strengthOfSchedule: number | null;
    /**
     * @isInt
     */
    remainingStrengthOfSchedule: number | null;
    /**
     * @isInt
     */
    gameControl: number | null;
  };
  efficiencies: {
    overall: number | null;
    offense: number | null;
    defense: number | null;
    specialTeams: number | null;
  };
}

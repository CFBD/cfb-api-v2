export interface TeamSP {
  /**
   * @isInt
   */
  year: number;
  team: string;
  conference: string;
  rating: number;
  /**
   * @isInt
   */
  ranking: number;
  secondOrderWins: number | null;
  sos: number | null;
  offense: {
    /**
     * @isInt
     */
    ranking: number;
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
    ranking: number;
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
  conference: string;
  division: string;
  rating: number;
  /**
   * @isInt
   */
  ranking: number;
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
  elo: number;
}

export interface TeamFPI {
  /**
   * @isInt
   */
  year: number;
  team: string;
  conference: string;
  fpi: number;
  resumeRanks: {
    /**
     * @isInt
     */
    strengthOfRecord: number;
    /**
     * @isInt
     */
    fpi: number;
    /**
     * @isInt
     */
    averageWinProbability: number;
    /**
     * @isInt
     */
    strengthOfSchedule: number;
    /**
     * @isInt
     */
    remainingStrengthOfSchedule: number | null;
    /**
     * @isInt
     */
    gameControl: number;
  };
  efficiencies: {
    overall: number;
    offense: number;
    defense: number;
    specialTeams: number;
  };
}

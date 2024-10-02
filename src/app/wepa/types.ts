export interface AdjustedTeamMetrics {
  /**
   * @isInt
   */
  year: number;
  /**
   * @isInt
   */
  teamId: number;
  team: string;
  conference: string;
  epa: {
    total: number;
    passing: number;
    rushing: number;
  };
  epaAllowed: {
    total: number;
    passing: number;
    rushing: number;
  };
  successRate: {
    total: number;
    standardDowns: number;
    passingDowns: number;
  };
  successRateAllowed: {
    total: number;
    standardDowns: number;
    passingDowns: number;
  };
  rushing: {
    lineYards: number;
    secondLevelYards: number;
    openFieldYards: number;
    highlightYards: number;
  };
  rushingAllowed: {
    lineYards: number;
    secondLevelYards: number;
    openFieldYards: number;
    highlightYards: number;
  };
  explosiveness: number;
  explosivenessAllowed: number;
}

export interface PlayerWeightedEPA {
  /**
   * @isInt
   */
  year: number;
  athleteId: string;
  athleteName: string;
  position: string;
  team: string;
  conference: string;
  wepa: number;
  /**
   * @isInt
   */
  plays: number;
}

export interface KickerPAAR {
  /**
   * @isInt
   */
  year: number;
  athleteId: string;
  athleteName: string;
  team: string;
  conference: string;
  paar: number;
  /**
   * @isInt
   */
  attempts: number;
}

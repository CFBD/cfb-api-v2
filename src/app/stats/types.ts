export interface PlayerStat {
  /**
   * @isInt
   */
  season: number;
  /**
   * @isInt
   */
  playerId: string;
  player: string;
  team: string;
  conference: string;
  category: string;
  statType: string;
  stat: string;
}

export interface TeamStat {
  /**
   * @isInt
   */
  season: number;
  team: string;
  conference: string;
  statName: string;
  statValue: string | number;
}

export interface AdvancedSeasonStat {
  /**
   * @isInt
   */
  season: number;
  team: string;
  conference: string;
  offense: {
    /**
     * @isInt
     */
    plays: number;
    /**
     * @isInt
     */
    drives: number;
    ppa: number;
    totalPPA: number;
    successRate: number;
    explosiveness: number | null;
    powerSuccess: number | null;
    stuffRate: number;
    lineYards: number;
    /**
     * @isInt
     */
    lineYardsTotal: number;
    secondLevelYards: number;
    /**
     * @isInt
     */
    secondLevelYardsTotal: number;
    openFieldYards: number;
    /**
     * @isInt
     */
    openFieldYardsTotal: number;
    /**
     * @isInt
     */
    totalOpportunies: number;
    pointsPerOpportunity: number;
    fieldPosition: {
      averageStart: number | null;
      averagePredictedPoints: number | null;
    };
    havoc: {
      total: number | null;
      frontSeven: number | null;
      db: number | null;
    };
    standardDowns: {
      rate: number;
      ppa: number;
      successRate: number;
      explosiveness: number | null;
    };
    passingDowns: {
      rate: number;
      ppa: number;
      successRate: number;
      explosiveness: number | null;
    };
    rushingPlays: {
      rate: number;
      ppa: number;
      totalPPA: number;
      successRate: number;
      explosiveness: number | null;
    };
    passingPlays: {
      rate: number;
      ppa: number;
      totalPPA: number;
      successRate: number;
      explosiveness: number | null;
    };
  };
  defense: {
    /**
     * @isInt
     */
    plays: number;
    /**
     * @isInt
     */
    drives: number;
    ppa: number;
    totalPPA: number;
    successRate: number;
    explosiveness: number | null;
    powerSuccess: number | null;
    stuffRate: number;
    lineYards: number;
    /**
     * @isInt
     */
    lineYardsTotal: number;
    secondLevelYards: number;
    /**
     * @isInt
     */
    secondLevelYardsTotal: number;
    openFieldYards: number;
    /**
     * @isInt
     */
    openFieldYardsTotal: number;
    /**
     * @isInt
     */
    totalOpportunies: number;
    pointsPerOpportunity: number;
    fieldPosition: {
      averageStart: number | null;
      averagePredictedPoints: number | null;
    };
    havoc: {
      total: number | null;
      frontSeven: number | null;
      db: number | null;
    };
    standardDowns: {
      rate: number;
      ppa: number;
      successRate: number;
      explosiveness: number | null;
    };
    passingDowns: {
      rate: number;
      ppa: number;
      totalPPA: number;
      successRate: number;
      explosiveness: number | null;
    };
    rushingPlays: {
      rate: number;
      ppa: number;
      totalPPA: number;
      successRate: number;
      explosiveness: number | null;
    };
    passingPlays: {
      rate: number;
      ppa: number;
      totalPPA: number;
      successRate: number;
      explosiveness: number | null;
    };
  };
}

export interface AdvancedGameStat {
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
  team: string;
  opponent: string;
  offense: {
    /**
     * @isInt
     */
    plays: number;
    /**
     * @isInt
     */
    drives: number;
    ppa: number;
    totalPPA: number;
    successRate: number;
    explosiveness: number | null;
    powerSuccess: number | null;
    stuffRate: number;
    lineYards: number;
    /**
     * @isInt
     */
    lineYardsTotal: number;
    secondLevelYards: number;
    /**
     * @isInt
     */
    secondLevelYardsTotal: number;
    openFieldYards: number | null;
    /**
     * @isInt
     */
    openFieldYardsTotal: number;
    standardDowns: {
      ppa: number;
      successRate: number;
      explosiveness: number | null;
    };
    passingDowns: {
      ppa: number;
      successRate: number;
      explosiveness: number | null;
    };
    rushingPlays: {
      ppa: number;
      totalPPA: number;
      successRate: number;
      explosiveness: number | null;
    };
    passingPlays: {
      ppa: number;
      totalPPA: number;
      successRate: number;
      explosiveness: number | null;
    };
  };
  defense: {
    /**
     * @isInt
     */
    plays: number;
    /**
     * @isInt
     */
    drives: number;
    ppa: number;
    totalPPA: number;
    successRate: number;
    explosiveness: number;
    powerSuccess: number | null;
    stuffRate: number;
    lineYards: number;
    /**
     * @isInt
     */
    lineYardsTotal: number;
    secondLevelYards: number;
    /**
     * @isInt
     */
    secondLevelYardsTotal: number;
    openFieldYards: number;
    /**
     * @isInt
     */
    openFieldYardsTotal: number | null;
    standardDowns: {
      ppa: number;
      successRate: number;
      explosiveness: number | null;
    };
    passingDowns: {
      ppa: number;
      successRate: number;
      explosiveness: number | null;
    };
    rushingPlays: {
      ppa: number;
      totalPPA: number;
      successRate: number;
      explosiveness: number | null;
    };
    passingPlays: {
      ppa: number;
      totalPPA: number;
      successRate: number;
      explosiveness: number | null;
    };
  };
}

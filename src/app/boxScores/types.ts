export interface StatsByQuarter {
  total: number;
  quarter1: number;
  quarter2: number;
  quarter3: number;
  quarter4: number;
}

export interface TeamPPA {
  team: string;
  /**
   * @isInt
   */
  plays: number;
  overall: StatsByQuarter;
  passing: StatsByQuarter;
  rushing: StatsByQuarter;
}

export interface TeamSuccessRates {
  team: string;
  overall: StatsByQuarter;
  standardDowns: StatsByQuarter;
  passingDowns: StatsByQuarter;
}

export interface TeamExplosiveness {
  team: string;
  overall: StatsByQuarter;
}

export interface TeamRushingStats {
  team: string;
  powerSuccess: number;
  stuffRate: number;
  lineYards: number;
  lineYardsAverage: number;
  secondLevelYards: number;
  secondLevelYardsAverage: number;
  openFieldYards: number;
  openFieldYardsAverage: number;
}

export interface TeamHavoc {
  team: string;
  total: number;
  frontSeven: number;
  db: number;
}

export interface TeamScoringOpportunities {
  team: string;
  /**
   * @isInt
   */
  opportunities: number;
  /**
   * @isInt
   */
  points: number;
  pointsPerOpportunity: number;
}

export interface TeamFieldPosition {
  team: string;
  averageStart: number;
  averageStartingPredictedPoints: number;
}

export interface PlayerStatsByQuarter extends StatsByQuarter {
  rushing: number;
  passing: number;
}

export interface PlayerGameUsage extends PlayerStatsByQuarter {
  player: string;
  team: string;
  position: string;
}

export interface PlayerPPA {
  player: string;
  team: string;
  position: string;
  average: PlayerStatsByQuarter;
  cumulative: PlayerStatsByQuarter;
}

export interface AdvancedBoxScore {
  gameInfo: {
    homeTeam: string;
    /**
     * @isInt
     */
    homePoints: number;
    homeWinProb: number;
    awayTeam: string;
    /**
     * @isInt
     */
    awayPoints: number;
    awayWinProb: number;
    homeWinner: boolean;
    excitement: number;
  };
  teams: {
    ppa: TeamPPA[];
    cumulativePpa: TeamPPA[];
    successRates: TeamSuccessRates[];
    explosiveness: TeamExplosiveness[];
    rushing: TeamRushingStats[];
    havoc: TeamHavoc[];
    scoringOpportunities: TeamScoringOpportunities[];
    fieldPosition: TeamFieldPosition[];
  };
  players: {
    usage: PlayerGameUsage[];
    ppa: PlayerPPA[];
  };
}

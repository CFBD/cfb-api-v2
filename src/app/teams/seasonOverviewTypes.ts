import { TeamPassingSeason } from '../passing/types';
import { TeamRushingSeason } from '../rushing/types';

export interface TeamSeasonAdvancedStats {
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

export interface TeamSeasonPlayerIdentity {
  /** @isInt */
  season: number;
  id: string;
  name: string | null;
  position: string | null;
  team: string;
  conference: string;
}
export interface TeamSeasonPlayerPpaValues {
  all: number | null;
  pass: number | null;
  rush: number | null;
  firstDown: number | null;
  secondDown: number | null;
  thirdDown: number | null;
  standardDowns: number | null;
  passingDowns: number | null;
}
export interface TeamSeasonPlayerPpa extends TeamSeasonPlayerIdentity {
  averagePPA: TeamSeasonPlayerPpaValues;
  totalPPA: TeamSeasonPlayerPpaValues;
}
export interface TeamSeasonPlayerUsage extends TeamSeasonPlayerIdentity {
  usage: {
    overall: number | null;
    pass: number | null;
    rush: number | null;
    firstDown: number | null;
    secondDown: number | null;
    thirdDown: number | null;
    standardDowns: number | null;
    passingDowns: number | null;
  };
}
export interface TeamSeasonSnapshotPayload {
  advanced: TeamSeasonAdvancedStats;
  players: { ppa: TeamSeasonPlayerPpa[]; usage: TeamSeasonPlayerUsage[] };
  passing: TeamPassingSeason | null;
  rushing: TeamRushingSeason | null;
}
export interface TeamSeasonRankedRating {
  /** Rating/efficiency rounded to two decimal places. */
  rating: number | null;
  /** Competition rank within the requested season and division, using unrounded values.
   * @isInt
   */
  rank: number | null;
}
export interface TeamSeasonOverview extends TeamSeasonSnapshotPayload {
  /** Completed games for the requested season, including postseason. */
  record: {
    /** @isInt */
    games: number;
    /** @isInt */
    wins: number;
    /** @isInt */
    losses: number;
    /** @isInt */
    ties: number;
  };
  /** Current available ratings for the requested season; unavailable systems are null. */
  ratings: {
    /** FPI efficiencies (higher is better for all four), not the FPI points rating. */
    fpi: {
      overall: TeamSeasonRankedRating;
      offense: TeamSeasonRankedRating;
      defense: TeamSeasonRankedRating;
      specialTeams: TeamSeasonRankedRating;
    } | null;
    core: {
      overall: TeamSeasonRankedRating;
      offense: TeamSeasonRankedRating;
      defense: TeamSeasonRankedRating;
    } | null;
    /** Latest available postgame Elo from a completed game in this season. */
    elo: number | null;
    srs: TeamSeasonRankedRating | null;
    sp: {
      overall: TeamSeasonRankedRating;
      offense: TeamSeasonRankedRating;
      defense: TeamSeasonRankedRating;
      specialTeams: TeamSeasonRankedRating;
    } | null;
  };
  /** @isInt */
  season: number;
  /** @isInt */
  teamId: number;
  team: string;
}
export interface TeamSeasonOverviewError {
  message: string;
}

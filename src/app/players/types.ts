import { TransferEligibility } from '../enums';

export interface PlayerSearchTeamStint {
  team: string;
  /**
   * @isInt
   */
  startYear: number | null;
  /**
   * @isInt
   */
  endYear: number | null;
}

export interface PlayerSearchResult {
  /**
   * @isInt
   */
  id: string;
  team: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  /**
   * @isInt
   */
  weight: number | null;
  height: number | null;
  /**
   * @isInt
   */
  jersey: number | null;
  position: string;
  hometown: string;
  teamColor: string;
  teamColorSecondary: string;
  /**
   * @isInt
   */
  activeStartYear: number | null;
  /**
   * @isInt
   */
  activeEndYear: number | null;
  teamStints: PlayerSearchTeamStint[];
}

export interface PlayerPPAChartItem {
  /**
   * @isInt
   */
  playNumber: number;
  avgPPA: number;
}

export interface PlayerUsage {
  /**
   * @isInt
   */
  season: number;
  id: string;
  name: string;
  position: string;
  team: string;
  conference: string;
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

export interface PlayerSeasonOverviewStat {
  name: string;
  value: string;
}

export interface PlayerSeasonOverviewCategory {
  name: string;
  stats: PlayerSeasonOverviewStat[];
}

export interface PlayerSeasonOverviewPPA {
  average: {
    all: number;
    pass?: number;
    rush?: number;
    firstDown?: number;
    secondDown?: number;
    thirdDown?: number;
    standardDowns?: number;
    passingDowns?: number;
  };
  total: {
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

export interface PlayerSeasonOverview {
  /**
   * @isInt
   */
  season: number;
  /**
   * @isInt
   */
  id: string;
  name: string;
  position: string;
  team: string;
  conference: string;
  /**
   * @isInt
   */
  games: number;
  boxScoreStats: {
    categories: PlayerSeasonOverviewCategory[];
  };
  usage?: PlayerUsage['usage'];
  ppa?: PlayerSeasonOverviewPPA;
}

export interface ReturningProduction {
  /**
   * @isInt
   */
  season: number;
  team: string;
  conference: string;
  totalPPA: number;
  totalPassingPPA: number;
  totalReceivingPPA: number;
  totalRushingPPA: number;
  percentPPA: number;
  percentPassingPPA: number;
  percentReceivingPPA: number;
  percentRushingPPA: number;
  usage: number;
  passingUsage: number;
  receivingUsage: number;
  rushingUsage: number;
}

export interface PlayerTransfer {
  /**
   * @isInt
   */
  season: number;
  firstName: string;
  lastName: string;
  position: string;
  origin: string;
  destination: string | null;
  /**
   * @isDateTime
   */
  transferDate: Date | null;
  rating: number | null;
  /**
   * @isInt
   */
  stars: number | null;
  eligibility: TransferEligibility | null;
}

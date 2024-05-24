import { TransferEligibility } from '../enums';

export interface PlayerSearchResult {
  /**
   * @isInt
   */
  id: number;
  team: string;
  name: string;
  firstName: string;
  lastName: string;
  /**
   * @isInt
   */
  weight: number;
  /**
   * @isInt
   */
  height: number;
  /**
   * @isInt
   */
  jersey: number;
  position: string;
  hometown: string;
  teamColor: string;
  teamColorSecondary: string;
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
  /**
   * @isInt
   */
  id: number;
  name: string;
  position: string;
  team: string;
  conference: string;
  usage: {
    overall: number;
    pass: number;
    rush: number;
    firstDown: number;
    secondDown: number;
    thirdDown: number;
    standardDowns: number;
    passingDowns: number;
  };
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
  destination: string;
  /**
   * @isDateTime
   */
  transferDate: Date;
  rating: number;
  /**
   * @isInt
   */
  stars: number;
  eligibility: TransferEligibility;
}

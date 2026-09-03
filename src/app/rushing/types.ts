import { SeasonType } from '../enums';

export type RushDirection = 'left' | 'middle' | 'right';

export type RushAttributionStatus =
  | 'individual'
  | 'team'
  | 'multi_carrier'
  | 'unmatched'
  | 'ambiguous'
  | 'conflict'
  | 'unlinked';

export type RushParseStatus = 'complete' | 'partial' | 'invalid';

export interface RushingPlayClock {
  /** @isInt */
  minutes: number;
  /** @isInt */
  seconds: number;
}

export interface RushingPlay {
  /** @isInt */
  gameId: number;
  playId: string;
  driveId: string;
  /** @isInt */
  season: number;
  /** @isInt */
  week: number;
  seasonType: SeasonType;
  /** @isInt */
  offenseId: number;
  offense: string;
  offenseConference: string | null;
  /** @isInt */
  defenseId: number;
  defense: string;
  defenseConference: string | null;
  /** @isInt */
  period: number;
  clock: RushingPlayClock;
  /** @isInt */
  down: number;
  /** @isInt */
  distance: number;
  playText: string | null;
  /** @isInt */
  startYardline: number;
  /** @isInt */
  startYardsToGoal: number | null;
  rusherId: string | null;
  rusher: string | null;
  rushDirection: RushDirection | null;
  /** @isInt */
  rushingYards: number | null;
  /** @isInt */
  rusherYards: number | null;
  isRushingTouchdown: boolean | null;
  isSack: boolean;
  isKneel: boolean;
  isTeamRush: boolean;
  attributionStatus: RushAttributionStatus;
  directionAnalysisEligible: boolean;
  parseStatus: RushParseStatus;
  ppa: number | null;
  success: boolean | null;
}

export interface RushingDirectionProduction {
  /** @isInt */
  carries: number;
  /** @isInt */
  yards: number;
  yardsPerCarry: number;
  successRate: number;
  ppa: number;
  totalPpa: number;
  lineYards: number;
  lineYardsTotal: number;
  secondLevelYards: number;
  secondLevelYardsTotal: number;
  openFieldYards: number;
  openFieldYardsTotal: number;
  stuffRate: number;
  powerSuccess: number;
  explosiveness: number;
}

export interface RushingProduction {
  /** @isInt */
  attempts: number;
  /** @isInt */
  rushingYardsAvailable: number;
  /** @isInt */
  totalRushingYards: number | null;
  yardsPerCarry: number | null;
  /** @isInt */
  individualAttempts: number;
  /** @isInt */
  unattributedAttempts: number;
  /** @isInt */
  sacks: number;
  /** @isInt */
  kneels: number;
  /** @isInt */
  teamRushes: number;
  /** @isInt */
  multiCarrierAttempts: number;
  /** @isInt */
  directionEligibleAttempts: number;
  /** @isInt */
  directionAvailableAttempts: number;
  successRate: number;
  ppa: number;
  totalPpa: number;
  lineYards: number;
  lineYardsTotal: number;
  secondLevelYards: number;
  secondLevelYardsTotal: number;
  openFieldYards: number;
  openFieldYardsTotal: number;
  stuffRate: number;
  powerSuccess: number;
  explosiveness: number;
  directions: {
    left: RushingDirectionProduction;
    middle: RushingDirectionProduction;
    right: RushingDirectionProduction;
    unknown: RushingDirectionProduction;
  };
}

export interface TeamRushingProduction extends RushingProduction {
  /** @isInt */
  touchdownStatusAvailable: number;
  /** @isInt */
  rushingTouchdowns: number;
}

export interface PlayerRushingSeason extends RushingProduction {
  /** @isInt */
  season: number;
  playerId: string;
  player: string;
  team: string;
  conference: string | null;
}

export interface PlayerRushingGame extends RushingProduction {
  /** @isInt */
  gameId: number;
  /** @isInt */
  season: number;
  /** @isInt */
  week: number;
  seasonType: SeasonType;
  playerId: string;
  player: string;
  team: string;
  conference: string | null;
  opponent: string;
}

export interface TeamRushingSeason {
  /** @isInt */
  season: number;
  team: string;
  conference: string | null;
  offense: TeamRushingProduction;
  defense: TeamRushingProduction;
}

export interface TeamRushingGame {
  /** @isInt */
  gameId: number;
  /** @isInt */
  season: number;
  /** @isInt */
  week: number;
  seasonType: SeasonType;
  team: string;
  conference: string | null;
  opponent: string;
  offense: TeamRushingProduction;
  defense: TeamRushingProduction;
}

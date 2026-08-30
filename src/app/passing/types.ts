import { SeasonType } from '../enums';

export type PassOutcome = 'completion' | 'incompletion' | 'interception';

export type PassDepth = 'short' | 'deep';

export type PassDirection = 'left' | 'middle' | 'right';

export type PassLocation =
  | 'short left'
  | 'short middle'
  | 'short right'
  | 'deep left'
  | 'deep middle'
  | 'deep right';

export type PassParseStatus = 'complete' | 'partial' | 'invalid';

export interface PassingPlayClock {
  /** @isInt */
  minutes: number;
  /** @isInt */
  seconds: number;
}

export interface PassingPlay {
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
  clock: PassingPlayClock;
  /** @isInt */
  down: number;
  /** @isInt */
  distance: number;
  playText: string | null;
  passerId: string | null;
  passer: string | null;
  targetId: string | null;
  target: string | null;
  outcome: PassOutcome;
  /** @isInt */
  airYards: number | null;
  passDepth: PassDepth | null;
  passDirection: PassDirection | null;
  passLocation: PassLocation | null;
  /** @isInt */
  totalYards: number | null;
  /** @isInt */
  yardsAfterCatch: number | null;
  /** @isInt */
  startYardline: number;
  /** @isInt */
  startYardsToGoal: number;
  /** @isInt */
  targetYardsToGoal: number | null;
  isSpike: boolean;
  isThrowaway: boolean;
  isIntentionalGrounding: boolean;
  // cpoeEligible: boolean;
  parseStatus: PassParseStatus;
}

export interface PassingProduction {
  /** @isInt */
  attempts: number;
  /** @isInt */
  completions: number;
  /** @isInt */
  incompletions: number;
  /** @isInt */
  interceptions: number;
  completionRate: number | null;
  /** @isInt */
  // cpoeEligibleAttempts: number;
  /**
   * Number of attempts with non-null air yards, including zero-yard values.
   * @isInt
   */
  airYardsAttemptsAvailable: number;
  /** @isInt */
  totalAirYards: number | null;
  averageDepthOfTarget: number | null;
  /**
   * Number of attempts with non-null total yards, including zero-yard
   * incompletions and interceptions.
   * @isInt
   */
  totalYardsAttemptsAvailable: number;
  /** @isInt */
  totalYards: number | null;
  /**
   * Number of completed attempts with valid total yards and air yards to
   * calculate yards after catch, including zero-yard values.
   * @isInt
   */
  yardsAfterCatchAttemptsAvailable: number;
  /** @isInt */
  totalYardsAfterCatch: number | null;
  averageYardsAfterCatch: number | null;
}

export interface PlayerPassingSeason extends PassingProduction {
  /** @isInt */
  season: number;
  playerId: string;
  player: string;
  team: string;
  conference: string | null;
}

export interface PlayerPassingGame extends PassingProduction {
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

export interface TeamPassingSeason {
  /** @isInt */
  season: number;
  team: string;
  conference: string | null;
  offense: PassingProduction;
  defense: PassingProduction;
}

export interface TeamPassingGame {
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
  offense: PassingProduction;
  defense: PassingProduction;
}

import { DivisionClassification, SeasonType } from '../enums';

export type PuntParseStatus = 'complete' | 'partial';

export interface PuntQuery {
  year?: number;
  week?: number;
  seasonType?: SeasonType;
  team?: string;
  conference?: string;
  classification?: DivisionClassification;
}
export interface PuntPlayQuery extends PuntQuery {
  gameId?: number;
  puntingTeam?: string;
  receivingTeam?: string;
  punterId?: string;
  returnerId?: string;
}
export interface PuntPlayerQuery extends PuntQuery {
  year: number;
  playerId?: string;
}
export interface PuntTeamQuery extends PuntQuery {
  year: number;
}

export interface PuntingPlayClock {
  /** @isInt */
  minutes: number;
  /** @isInt */
  seconds: number;
}

export interface PuntingPlay {
  /** @isInt */
  gameId: number;
  playId: string;
  driveId: string | null;
  /** @isInt */
  season: number;
  /** @isInt */
  week: number;
  seasonType: SeasonType;
  /** @isInt */
  puntingTeamId: number;
  puntingTeam: string;
  puntingConference: string | null;
  /** @isInt */
  receivingTeamId: number;
  receivingTeam: string;
  receivingConference: string | null;
  /** @isInt */
  period: number;
  clock: PuntingPlayClock;
  /** @isInt */
  down: number;
  /** @isInt */
  distance: number | null;
  playType: string;
  playText: string | null;
  punterId: string | null;
  punter: string | null;
  receiverId: string | null;
  receiver: string | null;
  returnerId: string | null;
  returner: string | null;
  blockerId: string | null;
  blocker: string | null;
  /** Whether the play counts as a punt; null when unknown. */
  countsAsPunt: boolean | null;
  /** Whether the play counts as a punt return; null when unknown. */
  countsAsReturn: boolean | null;
  /** @isInt */
  startYardsToGoal: number | null;
  /**
   * Gross punt yards.
   * @isInt
   */
  puntYards: number | null;
  /**
   * Return yards for the receiving team.
   * @isInt
   */
  returnYards: number | null;
  /**
   * Return yards credited to the returner; null when not credited individually.
   * @isInt
   */
  returnerYards: number | null;
  /**
   * Gross punt yards minus return yards, less 20 yards for a touchback.
   * @isInt
   */
  netPuntYards: number | null;
  /**
   * Where the kick ended, from the punting team's goal line (0) to the
   * receiving team's goal line (100).
   * @isInt
   */
  kickEndYardline: number | null;
  /**
   * Where the play ended, on the same scale as kickEndYardline.
   * @isInt
   */
  endYardline: number | null;
  isTouchback: boolean | null;
  isFairCatch: boolean | null;
  isOutOfBounds: boolean | null;
  isDowned: boolean | null;
  isBlocked: boolean | null;
  isMuffed: boolean | null;
  isReturnTouchdown: boolean | null;
  /** The receiving team lost possession, such as on a muff or fumble. */
  isReceivingTeamTurnover: boolean | null;
  hasPenalty: boolean | null;
  parseStatus: PuntParseStatus;
}

/** Production on punts kicked by a player. */
export interface PlayerPuntingProduction {
  /** @isInt */
  punts: number;
  /**
   * Punts with known gross yards.
   * @isInt
   */
  puntYardsAvailable: number;
  /** @isInt */
  puntYards: number | null;
  yardsPerPunt: number | null;
  /** @isInt */
  longestPunt: number | null;
  /** @isInt */
  punts50Plus: number;
  /**
   * Punts with known net yards.
   * @isInt
   */
  netPuntYardsAvailable: number;
  /** @isInt */
  netPuntYards: number | null;
  netYardsPerPunt: number | null;
  /** @isInt */
  touchbacks: number;
  /** @isInt */
  fairCatches: number;
  /** @isInt */
  outOfBounds: number;
  /** @isInt */
  downed: number;
  /**
   * Punts after which the receiving team took possession inside its own 20,
   * excluding touchbacks.
   * @isInt
   */
  inside20: number;
  /** @isInt */
  blocked: number;
}

/** Production on punts fielded, returned, or blocked by a player. */
export interface PlayerPuntReturnProduction {
  /** @isInt */
  returns: number;
  /**
   * Returns with known yards.
   * @isInt
   */
  returnYardsAvailable: number;
  /** @isInt */
  returnYards: number | null;
  yardsPerReturn: number | null;
  /** @isInt */
  longestReturn: number | null;
  /** @isInt */
  returns20Plus: number;
  /** @isInt */
  returnTouchdowns: number;
  /** @isInt */
  fairCatches: number;
  /** @isInt */
  muffs: number;
  /** @isInt */
  blocks: number;
}

/**
 * Production on a team's punts. On the returning side, punt and net yards
 * describe opponent punts.
 */
export interface TeamPuntingProduction extends PlayerPuntingProduction {
  /** @isInt */
  returns: number;
  /**
   * Returns with known yards.
   * @isInt
   */
  returnYardsAvailable: number;
  /** @isInt */
  returnYards: number | null;
  yardsPerReturn: number | null;
  /** @isInt */
  longestReturn: number | null;
  /** @isInt */
  returns20Plus: number;
  /** @isInt */
  returnTouchdowns: number;
  /** @isInt */
  muffs: number;
  /** @isInt */
  receivingTeamTurnovers: number;
}

/** Null when the player has no punts or returns in that role. */
export interface PlayerPuntingSeason {
  /** @isInt */
  season: number;
  playerId: string;
  player: string;
  team: string;
  conference: string | null;
  punting: PlayerPuntingProduction | null;
  returning: PlayerPuntReturnProduction | null;
}

/** Null when the player has no punts or returns in that role. */
export interface PlayerPuntingGame {
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
  punting: PlayerPuntingProduction | null;
  returning: PlayerPuntReturnProduction | null;
}

export interface TeamPuntingSeason {
  /** @isInt */
  season: number;
  team: string;
  conference: string | null;
  punting: TeamPuntingProduction;
  returning: TeamPuntingProduction;
}

export interface TeamPuntingGame {
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
  punting: TeamPuntingProduction;
  returning: TeamPuntingProduction;
}

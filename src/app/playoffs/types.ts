export enum PlayoffCompetition {
  Cfp = 'cfp',
}

export enum PlayoffRound {
  FirstRound = 'first_round',
  Quarterfinal = 'quarterfinal',
  Semifinal = 'semifinal',
  Championship = 'championship',
}

export type PlayoffStatus =
  | 'scheduled'
  | 'selected'
  | 'in_progress'
  | 'completed';

export type PlayoffBidType = 'automatic' | 'at_large';
export type PlayoffOutcome = 'active' | 'eliminated' | 'champion';

export interface PlayoffTeam {
  /**
   * @isInt
   */
  id: number;
  school: string;
  conference: string | null;
}

export interface PlayoffParticipant {
  team: PlayoffTeam;
  /**
   * @isInt
   */
  committeeRank: number | null;
  /**
   * @isInt
   */
  seed: number;
  bidType: PlayoffBidType;
  qualificationReason: string | null;
  conferenceChampion: boolean;
  qualifyingConference: string | null;
  firstRoundBye: boolean;
  outcome: PlayoffOutcome;
  eliminatedRound: PlayoffRound | null;
}

export interface PlayoffMatchupSlotSource {
  /**
   * @isInt
   */
  matchupId: number;
  bracketSlot: string;
  outcome: 'winner';
}

export interface PlayoffMatchupSlot {
  /**
   * @isInt
   */
  position: number;
  /**
   * @isInt
   */
  seed: number | null;
  participant: PlayoffTeam | null;
  source: PlayoffMatchupSlotSource | null;
}

export interface PlayoffLinkedGame {
  /**
   * @isInt
   */
  id: number;
  /**
   * @isDateTime
   */
  startDate: Date;
  completed: boolean;
  homeTeam: PlayoffTeam;
  /**
   * @isInt
   */
  homePoints: number | null;
  awayTeam: PlayoffTeam;
  /**
   * @isInt
   */
  awayPoints: number | null;
  /**
   * @isInt
   */
  venueId: number | null;
  venue: string | null;
}

export interface PlayoffAdvancement {
  /**
   * @isInt
   */
  matchupId: number;
  bracketSlot: string;
  /**
   * @isInt
   */
  position: number;
}

export interface PlayoffMatchup {
  /**
   * @isInt
   */
  id: number;
  bracketSlot: string;
  round: PlayoffRound;
  roundName: string;
  /**
   * @isInt
   */
  roundOrder: number;
  /**
   * @isInt
   */
  matchupOrder: number;
  /**
   * @isDateTime
   */
  startDate: Date | null;
  bowlName: string | null;
  slots: PlayoffMatchupSlot[];
  game: PlayoffLinkedGame | null;
  advancesTo: PlayoffAdvancement | null;
}

export interface PlayoffRoundRecord {
  code: PlayoffRound;
  name: string;
  /**
   * @isInt
   */
  order: number;
  matchups: PlayoffMatchup[];
}

export interface CfpPlayoff {
  /**
   * @isInt
   */
  season: number;
  competition: PlayoffCompetition.Cfp;
  format: string;
  /**
   * @isInt
   */
  teamCount: number;
  status: PlayoffStatus;
  participants: PlayoffParticipant[];
  rounds: PlayoffRoundRecord[];
  champion: PlayoffTeam | null;
}

export interface CfpPlayoffNotFound {
  message: 'CFP playoff not found';
}

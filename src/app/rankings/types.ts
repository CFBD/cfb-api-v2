import { SeasonType } from '../enums';

export enum RankingPoll {
  Cfp = 'cfp',
}

export interface PollWeek {
  /**
   * @isInt
   */
  season: number;
  seasonType: SeasonType;
  /**
   * @isInt
   */
  week: number;
  polls: Poll[];
}

export interface Poll {
  poll: string;
  isFinal: boolean | null;
  ranks: PollRank[];
}

export interface PollRank {
  /**
   * @isInt
   */
  rank: number | null;
  /**
   * @isInt
   */
  teamId: number;
  school: string;
  conference: string | null;
  /**
   * @isInt
   */
  firstPlaceVotes: number | null;
  /**
   * @isInt
   */
  points: number | null;
}

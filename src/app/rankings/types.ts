import { SeasonType } from '../enums';

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

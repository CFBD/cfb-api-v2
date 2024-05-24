import { RecruitClassification } from '../enums';

export interface Recruit {
  /**
   * @isInt
   */
  id: number;
  /**
   * @isInt
   */
  athleteId: number | null;
  recruitType: RecruitClassification;
  /**
   * @isInt
   */
  year: number;
  /**
   * @isInt
   */
  ranking: number;
  name: string;
  school: string;
  committedTo: string | null;
  position: string;
  /**
   * @isInt
   */
  height: number;
  /**
   * @isInt
   */
  weight: number;
  /**
   * @isInt
   */
  stars: number;
  rating: number;
  city: string | null;
  stateProvince: string | null;
  country: string | null;
  hometownInfo: {
    latitude: number | null;
    longitude: number | null;
    fipsCode: string | null;
  };
}

export interface TeamRecruitingRanking {
  /**
   * @isInt
   */
  year: number;
  /**
   * @isInt
   */
  rank: number;
  team: string;
  points: number;
}

export interface AggregatedTeamRecruiting {
  team: string;
  conference: string;
  positionGroup: string;
  averageRating: number;
  totalRating: number;
  /**
   * @isInt
   */
  commits: number;
  averageStars: number;
}

import { RecruitClassification } from '../enums';

export interface Recruit {
  id: string;
  /**
   * @isInt
   */
  athleteId: string | null;
  recruitType: RecruitClassification;
  /**
   * @isInt
   */
  year: number;
  /**
   * @isInt
   */
  ranking: number | null;
  name: string;
  school: string | null;
  committedTo: string | null;
  position: string | null;
  height: number | null;
  /**
   * @isInt
   */
  weight: number | null;
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
  positionGroup: string | null;
  averageRating: number;
  totalRating: number;
  /**
   * @isInt
   */
  commits: number;
  averageStars: number;
}

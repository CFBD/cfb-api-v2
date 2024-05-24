export interface DraftTeam {
  location: string;
  nickname: string;
  displayName: string;
  logo: string;
}

export interface DraftPosition {
  name: string;
  abbreviation: string;
}

export interface DraftPick {
  /**
   * @isInt
   */
  collegeAthleteId: number;
  /**
   * @isInt
   */
  nflAthleteId: number;
  /**
   * @isInt
   */
  collegeId: number;
  collegeTeam: string;
  collegeConference: string | null;
  /**
   * @isInt
   */
  nflTeamId: number;
  nflTeam: string;
  /**
   * @isInt
   */
  year: number;
  /**
   * @isInt
   */
  overall: number;
  /**
   * @isInt
   */
  round: number;
  /**
   * @isInt
   */
  pick: number;
  name: string;
  position: string;
  /**
   * @isInt
   */
  height: number | null;
  /**
   * @isInt
   */
  weight: number | null;
  /**
   * @isInt
   */
  preDraftRanking: number | null;
  /**
   * @isInt
   */
  preDraftPositionRanking: number | null;
  /**
   * @isInt
   */
  preDraftGrade: number;
  hometownInfo: {
    city: string | null;
    state: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
    countyFips: string | null;
  };
}

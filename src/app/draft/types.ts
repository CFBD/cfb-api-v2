export interface DraftTeam {
  location: string;
  nickname: string | null;
  displayName: string | null;
  logo: string | null;
}

export interface DraftPosition {
  name: string;
  abbreviation: string;
}

export interface DraftPick {
  /**
   * @isInt
   */
  collegeAthleteId: number | null;
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
  preDraftGrade: number | null;
  hometownInfo: {
    city: string | null;
    state: string | null;
    country: string | null;
    latitude: string | null;
    longitude: string | null;
    countyFips: string | null;
  };
}

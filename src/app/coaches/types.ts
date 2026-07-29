export interface Coach {
  /**
   * @isInt
   */
  id: number;
  firstName: string;
  lastName: string;
  /**
   * @isDateTime
   * @deprecated Use GET /coaches/tenures.
   */
  hireDate: Date | null;
  seasons: CoachSeason[];
}

export interface CoachSeason {
  /**
   * @isInt
   */
  teamId: number;
  school: string;
  conference: string | null;
  /**
   * @isInt
   */
  year: number;
  /**
   * @isInt
   */
  games: number;
  /**
   * @isInt
   */
  wins: number;
  /**
   * @isInt
   */
  losses: number;
  /**
   * @isInt
   */
  ties: number;
  winPercentage: number | null;
  /**
   * @isInt
   */
  preseasonRank: number | null;
  /**
   * @isInt
   */
  postseasonRank: number | null;
  srs: number | null;
  spOverall: number | null;
  spOffense: number | null;
  spDefense: number | null;
}

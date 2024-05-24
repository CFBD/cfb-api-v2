export interface Coach {
  firstName: string;
  lastName: string;
  /**
   * @isDate
   */
  hireDate: Date | null;
  seasons: CoachSeason[];
}

export interface CoachSeason {
  school: string;
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

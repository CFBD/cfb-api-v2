export interface Drive {
  offense: string;
  offenseConference: string | null;
  defense: string;
  defenseConference: string | null;
  /**
   * @isInt
   */
  gameId: number;
  id: string;
  /**
   * @isInt
   */
  driveNumber: number | null;
  scoring: boolean;
  /**
   * @isInt
   */
  startPeriod: number;
  /**
   * @isInt
   */
  startYardline: number;
  /**
   * @isInt
   */
  startYardsToGoal: number;
  startTime: {
    /**
     * @isInt
     */
    minutes: number | null;
    /**
     * @isInt
     */
    seconds: number | null;
  };
  /**
   * @isInt
   */
  endPeriod: number;
  /**
   * @isInt
   */
  endYardline: number;
  /**
   * @isInt
   */
  endYardsToGoal: number;
  endTime: {
    /**
     * @isInt
     */
    minutes: number | null;
    /**
     * @isInt
     */
    seconds: number | null;
  };
  /**
   * @isInt
   */
  plays: number;
  /**
   * @isInt
   */
  yards: number;
  driveResult: string;
  isHomeOffense: boolean;
  /**
   * @isInt
   */
  startOffenseScore: number;
  /**
   * @isInt
   */
  startDefenseScore: number;
  /**
   * @isInt
   */
  endOffenseScore: number;
  /**
   * @isInt
   */
  endDefenseScore: number;
}

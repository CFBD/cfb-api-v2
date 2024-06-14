export interface Drive {
  offense: string;
  offenseConference: string;
  defense: string;
  defenseConference: string;
  /**
   * @isInt
   */
  gameId: number;
  /**
   * @isInt
   */
  id: number;
  /**
   * @isInt
   */
  driveNumber: number;
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
    minutes: number;
    /**
     * @isInt
     */
    seconds: number;
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
    minutes: number;
    /**
     * @isInt
     */
    seconds: number;
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

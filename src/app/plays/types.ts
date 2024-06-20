export interface Play {
  /**
   * @isInt
   */
  id: number;
  /**
   * @isInt
   */
  driveId: number;
  /**
   * @isInt
   */
  gameId: number;
  /**
   * @isInt
   */
  driveNumber: number;
  /**
   * @isInt
   */
  playNumber: number;
  /**
   * @isInt
   */
  offense: string;
  offenseConference: string;
  /**
   * @isInt
   */
  offenseScore: number;
  defense: string;
  home: string;
  away: string;
  defenseConference: string;
  /**
   * @isInt
   */
  defenseScore: number;
  /**
   * @isInt
   */
  period: number;
  clock: {
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
  offenseTimeouts: number;
  /**
   * @isInt
   */
  defenseTimeouts: number;
  /**
   * @isInt
   */
  yardline: number;
  /**
   * @isInt
   */
  yardsToGoal: number;
  /**
   * @isInt
   */
  down: number;
  /**
   * @isInt
   */
  distance: number;
  /**
   * @isInt
   */
  yardsGained: number;
  scoring: boolean;
  playType: string;
  playText: string;
  ppa?: number;
  wallclock?: string;
}

export interface PlayType {
  /**
   * @isInt
   */
  id: number;
  text: string;
  abbreviation: string;
}

export interface PlayStatType {
  /**
   * @isInt
   */
  id: number;
  name: string;
}

export interface PlayStat {
  gameId: number;
  season: number;
  week: number;
  team: string;
  conference: string;
  opponent: string;
  teamScore: number;
  opponentScore: number;
  driveId: number;
  playId: number;
  period: number;
  clock: {
    minutes: number;
    seconds: number;
  };
  yardsToGoal: number;
  down: number;
  distance: number;
  athleteId: number;
  athleteName: string;
  statType: string;
  stat: number;
}

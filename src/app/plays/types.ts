export interface Play {
  id: string;
  driveId: string;
  /**
   * @isInt
   */
  gameId: number;
  /**
   * @isInt
   */
  driveNumber: number | null;
  /**
   * @isInt
   */
  playNumber: number | null;
  /**
   * @isInt
   */
  offense: string;
  offenseConference: string | null;
  /**
   * @isInt
   */
  offenseScore: number;
  defense: string;
  home: string;
  away: string;
  defenseConference: string | null;
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
    minutes: number | null;
    /**
     * @isInt
     */
    seconds: number | null;
  };
  /**
   * @isInt
   */
  offenseTimeouts: number | null;
  /**
   * @isInt
   */
  defenseTimeouts: number | null;
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
  playText: string | null;
  ppa: number | null;
  wallclock: string | null;
}

export interface PlayType {
  /**
   * @isInt
   */
  id: number;
  text: string;
  abbreviation: string | null;
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
  driveId: string;
  playId: string;
  period: number;
  clock: {
    minutes: number | null;
    seconds: number | null;
  };
  yardsToGoal: number;
  down: number;
  distance: number;
  athleteId: string;
  athleteName: string;
  statType: string;
  stat: number;
}

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

export interface CoachRecord {
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
}

export interface CoachReference {
  /**
   * @isInt
   */
  id: number;
  firstName: string;
  lastName: string;
}

export interface CoachTeamReference {
  /**
   * @isInt
   */
  id: number;
  school: string;
}

export interface CoachSeasonTeamReference extends CoachTeamReference {
  conference: string | null;
}

export interface CoachCareer extends CoachRecord {
  /**
   * @isInt
   */
  seasons: number;
  /**
   * @isInt
   */
  teams: number;
  /**
   * @isInt
   */
  firstYear: number;
  /**
   * @isInt
   */
  lastYear: number;
}

export interface CoachAlmaMater {
  /**
   * @isInt
   */
  id: number;
  school: string;
}

export interface CoachProfile {
  /**
   * @isInt
   */
  id: number;
  firstName: string;
  lastName: string;
  displayName: string | null;
  currentTeam: CoachSeasonTeamReference | null;
  career: CoachCareer;
  /**
   * @isDate
   */
  birthDate: string | null;
  almaMater: CoachAlmaMater | null;
  /**
   * @isInt
   */
  graduationYear: number | null;
  wikidataId: string | null;
  /**
   * @isInt
   */
  hallOfFameYear: number | null;
}

export interface CoachNotFound {
  message: 'Coach not found';
}

export interface CoachTenure {
  /**
   * @isInt
   */
  id: number;
  coach: CoachReference;
  team: CoachTeamReference;
  /**
   * @isDate
   */
  hireDate: string | null;
  /**
   * @isInt
   */
  startYear: number;
  /**
   * @isInt
   */
  endYear: number | null;
  /**
   * @isDateTime
   */
  effectiveStart: Date | null;
  /**
   * @isDateTime
   */
  effectiveEnd: Date | null;
  isInterim: boolean;
  active: boolean;
  /**
   * @isInt
   */
  seasons: number;
  record: CoachRecord;
  attributionComplete: boolean;
}

export interface CoachRatingContext {
  spSpecialTeams: number | null;
  strengthOfSchedule: number | null;
  secondOrderWins: number | null;
  fpi: number | null;
  yearOverYear: {
    /**
     * @isInt
     */
    wins: number | null;
    srs: number | null;
    spOverall: number | null;
  };
}

export interface CoachRecruitingContext {
  /**
   * @isInt
   */
  rank: number | null;
  points: number | null;
  talent: number | null;
}

export interface CoachPollResume {
  /**
   * @isInt
   */
  preseasonRank: number | null;
  /**
   * @isInt
   */
  postseasonRank: number | null;
  /**
   * @isInt
   */
  bestRank: number | null;
  /**
   * @isInt
   */
  weeksRanked: number;
  /**
   * @isInt
   */
  weeksTopTen: number;
}

export interface CoachRecordSplits {
  conference: CoachRecord;
  postseason: CoachRecord;
  home: CoachRecord;
  away: CoachRecord;
  neutral: CoachRecord;
}

export interface CoachScoring {
  /**
   * @isInt
   */
  pointsFor: number;
  /**
   * @isInt
   */
  pointsAgainst: number;
  averagePointDifferential: number | null;
}

export type CfpCoachSeasonOutcome = 'active' | 'eliminated' | 'champion';

export interface CoachCfpContext {
  appeared: boolean;
  /**
   * @isInt
   */
  seed: number | null;
  outcome: CfpCoachSeasonOutcome | null;
}

export interface CoachDraftContext {
  /**
   * @isInt
   */
  year: number;
  /**
   * @isInt
   */
  totalPicks: number;
  /**
   * @isInt
   */
  firstRoundPicks: number;
}

export interface DetailedCoachSeason extends CoachRecord {
  coach: CoachReference;
  team: CoachSeasonTeamReference;
  /**
   * @isInt
   */
  year: number;
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
  teamMetrics: CoachRatingContext;
  recruiting: CoachRecruitingContext;
  pollResume: CoachPollResume | null;
  attributionComplete: boolean;
  recordSplits: CoachRecordSplits | null;
  scoring: CoachScoring | null;
  cfp: CoachCfpContext;
  draftFollowingSeason: CoachDraftContext | null;
}

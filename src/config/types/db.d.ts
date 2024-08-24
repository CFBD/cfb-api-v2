import type { ColumnType } from 'kysely';
import type { IPostgresInterval } from 'postgres-interval';

export type Division = 'fbs' | 'fcs' | 'ii' | 'ii/iii' | 'iii';

export type DownType = 'passing' | 'standard';

export type GameStatus = 'completed' | 'in_progress' | 'scheduled';

export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>;

export type HomeAway = 'away' | 'home';

export type Int8 = ColumnType<
  string,
  bigint | number | string,
  bigint | number | string
>;

export type Interval = ColumnType<
  IPostgresInterval,
  IPostgresInterval | number,
  IPostgresInterval | number
>;

export type MediaType = 'mobile' | 'ppv' | 'radio' | 'tv' | 'web';

export type Numeric = ColumnType<string, number | string, number | string>;

export type PlayCall = 'pass' | 'rush';

export type Point = {
  x: number;
  y: number;
};

export type RecruitType = 'HighSchool' | 'JUCO' | 'PrepSchool';

export type SeasonType =
  | 'allstar'
  | 'postseason'
  | 'preseason'
  | 'regular'
  | 'spring_postseason'
  | 'spring_regular';

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface Athlete {
  active: boolean | null;
  firstName: string | null;
  height: number | null;
  hometownId: number | null;
  id: Int8;
  jersey: number | null;
  lastName: string | null;
  name: string;
  positionId: number | null;
  teamId: Generated<number | null>;
  weight: number | null;
  year: number | null;
}

export interface AthleteTeam {
  athleteId: Int8;
  endYear: number | null;
  id: Generated<number>;
  startYear: number | null;
  teamId: number;
}

export interface City {
  id: Generated<number>;
  name: string;
}

export interface Coach {
  firstName: string;
  id: Generated<number>;
  lastName: string;
}

export interface CoachSeason {
  coachId: number;
  games: number;
  id: Generated<number>;
  losses: number;
  postseasonRank: number | null;
  preseasonRank: number | null;
  teamId: number;
  ties: number;
  wins: number;
  year: number;
}

export interface CoachTeam {
  coachId: number;
  hireDate: Timestamp | null;
  id: Generated<number>;
  teamId: number;
}

export interface Conference {
  abbreviation: string | null;
  division: Division | null;
  id: Generated<number>;
  name: string;
  shortName: string | null;
  srName: string | null;
}

export interface ConferenceTeam {
  conferenceId: number;
  division: string | null;
  endYear: number | null;
  id: Generated<number>;
  startYear: number | null;
  teamId: number;
}

export interface Country {
  id: Generated<number>;
  name: string;
}

export interface CurrentConferences {
  abbreviation: string | null;
  classification: Division | null;
  conferenceId: number | null;
  division: string | null;
  name: string | null;
  school: string | null;
  teamId: number | null;
}

export interface DraftPicks {
  collegeId: number | null;
  collegeTeamId: number;
  grade: number | null;
  height: number | null;
  id: number;
  name: string;
  nflTeamId: number;
  overall: number;
  overallRank: number | null;
  pick: number;
  positionId: number;
  positionRank: number | null;
  round: number;
  weight: number | null;
  year: number;
}

export interface DraftPosition {
  abbreviation: string;
  id: number;
  name: string;
}

export interface DraftTeam {
  displayName: string | null;
  id: number;
  location: string;
  logo: string | null;
  mascot: string | null;
  nickname: string | null;
  shortDisplayName: string | null;
}

export interface Drive {
  defenseId: number;
  driveNumber: number | null;
  elapsed: Interval;
  endPeriod: number;
  endTime: Interval;
  endYardline: number;
  gameId: number;
  id: Int8;
  offenseId: number;
  plays: number;
  resultId: Generated<number>;
  scoring: boolean;
  startPeriod: number;
  startTime: Interval;
  startYardline: number;
  yards: number;
}

export interface DriveResult {
  id: Generated<number>;
  name: string;
}

export interface FgEp {
  expectedPoints: Numeric;
  id: Generated<number>;
  yardsToGoal: number;
}

export interface Fpi {
  avgWinProbRank: number | null;
  defensiveEfficiency: Numeric | null;
  fpi: Numeric | null;
  fpiResumeRank: number | null;
  gameControlRank: number | null;
  id: Generated<number>;
  offensiveEfficiency: Numeric | null;
  overallEfficiency: Numeric | null;
  remainingSosRank: number | null;
  sosRank: number | null;
  specialTeamsEfficiency: Numeric | null;
  strengthOfRecordRank: number | null;
  teamId: number;
  year: number;
}

export interface Game {
  attendance: number | null;
  conferenceGame: boolean | null;
  currentAwayScore: number | null;
  currentClock: Interval | null;
  currentHomeScore: number | null;
  currentPeriod: number | null;
  currentPossession: string | null;
  currentSituation: string | null;
  excitement: Numeric | null;
  highlights: string | null;
  id: number;
  neutralSite: boolean;
  notes: string | null;
  overUnder: number | null;
  season: number;
  seasonType: SeasonType;
  spread: number | null;
  startDate: Timestamp;
  startTimeTbd: boolean | null;
  status: Generated<GameStatus>;
  venueId: number | null;
  week: number;
}

export interface GameLines {
  gameId: number;
  id: Generated<Int8>;
  linesProviderId: number;
  moneylineAway: number | null;
  moneylineHome: number | null;
  overUnder: Numeric | null;
  overUnderOpen: Numeric | null;
  spread: Numeric | null;
  spreadOpen: Numeric | null;
}

export interface GameMedia {
  gameId: number;
  id: Generated<Int8>;
  mediaType: MediaType;
  name: string;
}

export interface GamePlayerStat {
  athleteId: Int8;
  categoryId: number;
  gameTeamId: Int8;
  id: Generated<Int8>;
  stat: string;
  typeId: number;
}

export interface GameTeam {
  endElo: number | null;
  gameId: number;
  homeAway: HomeAway;
  id: Generated<Int8>;
  lineScores: number[] | null;
  points: number | null;
  startElo: number | null;
  teamId: number;
  winner: boolean | null;
  winProb: Numeric | null;
}

export interface GameTeamStat {
  gameTeamId: Int8;
  id: Generated<Int8>;
  stat: string;
  typeId: number;
}

export interface GameWeather {
  dewpoint: Numeric | null;
  gameId: number;
  humidity: Numeric | null;
  precipitation: Generated<Numeric | null>;
  pressure: Numeric | null;
  snowfall: Generated<Numeric | null>;
  temperature: Numeric | null;
  totalSun: Numeric | null;
  weatherConditionCode: number | null;
  windDirection: Numeric | null;
  windGust: Numeric | null;
  windSpeed: Numeric | null;
}

export interface Hometown {
  city: string | null;
  country: string | null;
  countyFips: string | null;
  id: Generated<number>;
  latitude: Numeric | null;
  longitude: Numeric | null;
  state: string | null;
}

export interface LinesProvider {
  id: number;
  name: string;
}

export interface Play {
  awayScore: number;
  awayTimeouts: number | null;
  clock: Interval;
  defenseId: number;
  distance: number;
  down: number;
  downType: DownType | null;
  driveId: Int8 | null;
  garbageTime: Generated<boolean>;
  homeScore: number;
  homeTimeouts: number | null;
  homeWinProb: Numeric | null;
  id: Int8;
  offenseId: number;
  period: number;
  playCall: PlayCall | null;
  playNumber: number | null;
  playText: string | null;
  playTypeId: number;
  ppa: Numeric | null;
  scoring: boolean;
  success: boolean | null;
  wallclock: Timestamp | null;
  yardLine: number;
  yardsGained: number;
}

export interface PlayerStatCategory {
  id: Generated<number>;
  name: string;
}

export interface PlayerStatType {
  id: Generated<number>;
  name: string;
}

export interface PlayStat {
  athleteId: Int8;
  id: Generated<Int8>;
  playId: Int8;
  stat: number;
  statTypeId: number;
}

export interface PlayStatType {
  abbreviation: string | null;
  id: Generated<number>;
  name: string;
}

export interface PlayType {
  abbreviation: string | null;
  id: number;
  sequence: number | null;
  text: string;
}

export interface Poll {
  id: Generated<number>;
  pollTypeId: number;
  season: number;
  seasonType: SeasonType;
  week: number;
}

export interface PollRank {
  firstPlaceVotes: number | null;
  id: Generated<number>;
  points: number | null;
  pollId: number;
  rank: number | null;
  teamId: number;
}

export interface PollType {
  abbreviation: string | null;
  id: number;
  name: string;
  shortName: string;
}

export interface Position {
  abbreviation: string;
  displayName: string;
  id: number;
  name: string;
}

export interface Ppa {
  distance: number;
  down: number;
  id: Generated<number>;
  predictedPoints: Numeric;
  yardLine: number;
}

export interface Ratings {
  dDbHavoc: Numeric | null;
  dExplosiveness: Numeric | null;
  dFrontSevenHavoc: Numeric | null;
  dHavoc: Numeric | null;
  dPassing: Numeric | null;
  dPassingDowns: Numeric | null;
  dRating: Numeric;
  dRushing: Numeric | null;
  dStandardDowns: Numeric | null;
  dSuccess: Numeric | null;
  id: Generated<number>;
  oExplosiveness: Numeric | null;
  oPace: Numeric | null;
  oPassing: Numeric | null;
  oPassingDowns: Numeric | null;
  oRating: Numeric;
  oRunRate: Numeric | null;
  oRushing: Numeric | null;
  oStandardDowns: Numeric | null;
  oSuccess: Numeric | null;
  rating: Numeric;
  secondOrderWins: Numeric | null;
  sos: Numeric | null;
  stRating: Numeric | null;
  teamId: number;
  year: number;
}

export interface Recruit {
  athleteId: number | null;
  cityId: number | null;
  collegeId: number | null;
  countryId: number | null;
  height: number | null;
  hometownId: number | null;
  id: Generated<Int8>;
  name: string;
  overallRank: number | null;
  positionRank: number | null;
  ranking: number | null;
  rating: number;
  recruitPositionId: number | null;
  recruitSchoolId: number | null;
  recruitType: RecruitType;
  stars: number;
  stateId: number | null;
  weight: number | null;
  year: number;
}

export interface RecruitingTeam {
  id: Generated<number>;
  points: Numeric;
  rank: number;
  teamId: number;
  year: number;
}

export interface RecruitPosition {
  id: Generated<number>;
  position: string;
  positionGroup: string | null;
}

export interface RecruitSchool {
  id: Generated<number>;
  name: string;
}

export interface Srs {
  epaDefense: Numeric | null;
  epaOffense: Numeric | null;
  id: Generated<number>;
  rating: Numeric;
  teamId: number;
  year: number;
}

export interface StateProvince {
  id: Generated<number>;
  name: string;
}

export interface Team {
  abbreviation: string | null;
  active: boolean;
  altColor: string | null;
  altName: string | null;
  color: string | null;
  displayName: string;
  id: number;
  images: string[] | null;
  mascot: string | null;
  ncaaName: string | null;
  nickname: string | null;
  school: string;
  shortDisplayName: string | null;
  twitter: string | null;
  venueId: number | null;
}

export interface TeamStatType {
  id: Generated<number>;
  name: string;
  playerCategoryMappingId: number | null;
  playerTypeMappingId: number | null;
}

export interface TeamTalent {
  id: Generated<number>;
  talent: Numeric;
  teamId: number;
  year: number;
}

export interface Transfer {
  eligibility: string | null;
  firstName: string;
  fromTeamId: number;
  id: number;
  lastName: string;
  positionId: number;
  rating: Numeric | null;
  season: number;
  stars: number | null;
  toTeamId: number | null;
  transferDate: Timestamp | null;
}

export interface Venue {
  capacity: number | null;
  city: string | null;
  countryCode: string | null;
  dome: boolean | null;
  elevation: Numeric | null;
  grass: boolean | null;
  id: number;
  location: Point | null;
  name: string;
  state: string | null;
  timezone: string | null;
  yearConstructed: number | null;
  zip: string | null;
}

export interface WeatherCondition {
  description: string;
  id: number;
}

export interface ReturningProduction {
  season: number;
  school: string;
  conference: string;
  ppa: number;
  returningPpa: number;
  passPpa: number;
  returningPassPpa: number;
  receivingPpa: number;
  returningReceivingPpa: number;
  rushPpa: number;
  returningRushPpa: number;
  returningUsage: number;
  returningPassUsage: number;
  returningReceivingUsage: number;
  returningRushUsage: number;
}

export interface DB {
  athlete: Athlete;
  athleteTeam: AthleteTeam;
  city: City;
  coach: Coach;
  coachSeason: CoachSeason;
  coachTeam: CoachTeam;
  conference: Conference;
  conferenceTeam: ConferenceTeam;
  country: Country;
  currentConferences: CurrentConferences;
  draftPicks: DraftPicks;
  draftPosition: DraftPosition;
  draftTeam: DraftTeam;
  drive: Drive;
  driveResult: DriveResult;
  fgEp: FgEp;
  fpi: Fpi;
  game: Game;
  gameLines: GameLines;
  gameMedia: GameMedia;
  gamePlayerStat: GamePlayerStat;
  gameTeam: GameTeam;
  gameTeamStat: GameTeamStat;
  gameWeather: GameWeather;
  hometown: Hometown;
  linesProvider: LinesProvider;
  play: Play;
  playerStatCategory: PlayerStatCategory;
  playerStatType: PlayerStatType;
  playStat: PlayStat;
  playStatType: PlayStatType;
  playType: PlayType;
  poll: Poll;
  pollRank: PollRank;
  pollType: PollType;
  position: Position;
  ppa: Ppa;
  ratings: Ratings;
  recruit: Recruit;
  recruitingTeam: RecruitingTeam;
  recruitPosition: RecruitPosition;
  recruitSchool: RecruitSchool;
  returningProduction: ReturningProduction;
  srs: Srs;
  stateProvince: StateProvince;
  team: Team;
  teamStatType: TeamStatType;
  teamTalent: TeamTalent;
  transfer: Transfer;
  venue: Venue;
  weatherCondition: WeatherCondition;
}
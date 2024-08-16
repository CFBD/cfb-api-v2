export interface LiveGame {
  /**
   * @isInt
   */
  id: number;
  status: string;
  /**
   * @isInt
   */
  period: number | null;
  clock: string;
  possession: string;
  /**
   * @isInt
   */
  down: number | null;
  /**
   * @isInt
   */
  distance: number | null;
  /**
   * @isInt
   */
  yardsToGoal: number | null;
  teams: LiveGameTeam[];
  drives: LiveGameDrive[];
}

export interface LiveGameTeam {
  /**
   * @isInt
   */
  teamId: number;
  team: string;
  homeAway: 'home' | 'away';
  /**
   * @isInt
   */
  lineScores: number[];
  /**
   * @isInt
   */
  points: number;
  /**
   * @isInt
   */
  drives: number;
  /**
   * @isInt
   */
  scoringOpportunities: number;
  pointsPerOpportunity: number;
  /**
   * @isInt
   */
  plays: number;
  lineYards: number;
  lineYardsPerRush: number;
  secondLevelYards: number;
  secondLevelYardsPerRush: number;
  openFieldYards: number;
  openFieldYardsPerRush: number;
  epaPerPlay: number;
  totalEpa: number;
  passingEpa: number;
  epaPerPass: number;
  rushingEpa: number;
  epaPerRush: number;
  successRate: number;
  standardDownSuccessRate: number;
  passingDownSuccessRate: number;
  explosiveness: number;
}

export interface LiveGameDrive {
  id: string;
  /**
   * @isInt
   */
  offenseId: number;
  offense: string;
  /**
   * @isInt
   */
  defenseId: number;
  defense: string;
  /**
   * @isInt
   */
  playCount: number;
  /**
   * @isInt
   */
  yards: number;
  /**
   * @isInt
   */
  startPeriod: number;
  startClock: string | null;
  /**
   * @isInt
   */
  startYardsToGoal: number;
  /**
   * @isInt
   */
  endPeriod: number | null;
  endClock: string | null;
  /**
   * @isInt
   */
  endYardsToGoal: number | null;
  duration: string | null;
  scoringOpportunity: boolean;
  result: string;
  /**
   * @isInt
   */
  pointsGained: number;
  plays: LiveGamePlay[];
}

export interface LiveGamePlay {
  id: string;
  /**
   * @isInt
   */
  homeScore: number;
  /**
   * @isInt
   */
  awayScore: number;
  /**
   * @isInt
   */
  period: number;
  clock: string;
  wallClock: Date;
  /**
   * @isInt
   */
  teamId: number;
  team: string;
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
  yardsToGoal: number;
  /**
   * @isInt
   */
  yardsGained: number;
  /**
   * @isInt
   */
  playTypeId: number;
  playType: string;
  epa: number | null;
  garbageTime: boolean;
  success: boolean;
  rushPash: 'rush' | 'pass' | 'other';
  downType: 'passing' | 'standard';
  playText: string;
}

export interface PlayByPlayGameResponse {
  gameId: number;
  gamepackageJSON: GamepackageJSON;
  type: string;
}

interface GamePackageCompetitor {
  uid: string;
  homeAway: HomeAway;
  score: string;
  winner: boolean;
  record: Record[];
  possession: boolean;
  id: string;
  team: GamePackageTeam;
  linescores: GamePackageLinescore[];
  order: number;
  rank?: number;
}

export enum HomeAway {
  Away = 'away',
  Home = 'home',
}

interface GamePackageLinescore {
  displayValue: string;
}

interface Record {
  summary: string;
  displayValue: string;
  type: string;
}

interface GamePackageTeam {
  uid: string;
  alternateColor: string;
  color: string;
  displayName: string;
  name: string;
  nickname: string;
  location: string;
  links: AthleteLink[];
  id: string;
  abbreviation: string;
  logos: Logo[];
}

interface AthleteLink {
  rel: RelElement[];
  href: string;
  text: ItemText;
}

export enum RelElement {
  App = 'app',
  Athlete = 'athlete',
  Clubhouse = 'clubhouse',
  Desktop = 'desktop',
  Index = 'index',
  League = 'league',
  Playercard = 'playercard',
  Rankings = 'rankings',
  Schedule = 'schedule',
  Scores = 'scores',
  Sportscenter = 'sportscenter',
  Standings = 'standings',
  Stats = 'stats',
  Team = 'team',
  Teams = 'teams',
}

export enum ItemText {
  Clubhouse = 'Clubhouse',
  Index = 'Index',
  PlayerCard = 'Player Card',
  Rankings = 'Rankings',
  Schedule = 'Schedule',
  Scores = 'Scores',
  Standings = 'Standings',
  Stats = 'Stats',
  Teams = 'Teams',
}

interface Logo {
  lastUpdated: string;
  width: number;
  alt: string;
  rel: SiteType[];
  href: string;
  height: number;
}

export enum SiteType {
  Dark = 'dark',
  Default = 'default',
  Full = 'full',
}

interface AthleteJSON {
  athlete: GamePackageJSONAthlete;
  stats: string[];
}

interface GamePackageJSONAthlete {
  uid: string;
  firstName: string;
  lastName: string;
  displayName: string;
  links: AthleteLink[];
  id: string;
  jersey?: string;
  guid?: string;
}

interface GamepackageJSON {
  drives: Drives;
  scoringPlays: ScoringPlay[];
  winprobability: any[];
  boxscore: GamePackageBoxscore;
  header: GamePackageHeader;
  broadcasts: any[];
  standings: GamepackageJSONStandings;
}

interface GamePackageBoxscore {
  teams: TeamElement[];
  players: GamePackagePlayer[];
}

interface GamePackagePlayer {
  displayOrder: number;
  team: GamePackagePlayerTeam;
  statistics: GamePackagePlayerStatistic[];
}

interface GamePackagePlayerStatistic {
  keys: string[];
  name: string;
  athletes: AthleteJSON[];
  text: string;
  totals: string[];
  descriptions: string[];
  labels: string[];
}

interface GamePackagePlayerTeam {
  shortDisplayName: string;
  uid: string;
  alternateColor: string;
  color: string;
  displayName: string;
  name: string;
  logo: string;
  location: string;
  id: string;
  abbreviation: string;
  slug: string;
}

interface TeamElement {
  homeAway: HomeAway;
  displayOrder: number;
  team: GamePackagePlayerTeam;
  statistics: TeamStatistic[];
}

interface TeamStatistic {
  displayValue: string;
  name: string;
  label: string;
}

interface Drives {
  previous: Drive[];
  current: Drive;
}

interface Drive {
  displayResult: string;
  isScore: boolean;
  plays: GamePackagePlay[];
  start: PreviousEnd;
  description: string;
  team: PreviousTeam;
  yards: number;
  timeElapsed: GamePackageLinescore;
  result: string;
  offensivePlays: number;
  end: PreviousEnd;
  id: string;
  shortDisplayResult: string;
}

interface PreviousEnd {
  period: EndPeriod;
  yardLine: number;
  clock?: GamePackageLinescore;
  text: string;
}

interface EndPeriod {
  number: number;
  type: PeriodType;
}

export enum PeriodType {
  Quarter = 'quarter',
}

export interface GamePackagePlay {
  sequenceNumber: string;
  period: PlayPeriod;
  homeScore: number;
  start: PlayEnd;
  scoringPlay: boolean;
  clock: GamePackageLinescore;
  type: PlayType;
  priority: boolean;
  statYardage: number;
  awayScore: number;
  wallclock: Date;
  modified: string;
  end: PlayEnd;
  id: string;
  text: string;
  scoringType?: ScoringType;
  pointAfterAttempt?: PointAfterAttempt;
}

interface PlayEnd {
  shortDownDistanceText?: string;
  possessionText?: string;
  downDistanceText?: string;
  distance: number;
  yardLine: number;
  team: EndTeam;
  down: number;
  yardsToEndzone: number;
}

interface EndTeam {
  id: string;
}

interface PlayPeriod {
  number: number;
}

interface PointAfterAttempt {
  id: number;
  text: string;
  abbreviation: string;
  value: number;
}

interface ScoringType {
  displayName: ScoringTypeDisplayName;
  name: ScoringTypeName;
  abbreviation: ScoringTypeAbbreviation;
}

export enum ScoringTypeAbbreviation {
  Eg = 'EG',
  Eh = 'EH',
  Ep = 'EP',
  Fg = 'FG',
  Int = 'INT',
  K = 'K',
  Pen = 'PEN',
  Punt = 'PUNT',
  Rec = 'REC',
  Rush = 'RUSH',
  Td = 'TD',
  To = 'TO',
}

export enum ScoringTypeDisplayName {
  FieldGoal = 'Field Goal',
  Touchdown = 'Touchdown',
}

export enum ScoringTypeName {
  FieldGoal = 'field-goal',
  Touchdown = 'touchdown',
}

interface PlayType {
  id: string;
  text: string;
  abbreviation?: ScoringTypeAbbreviation;
}

interface PreviousTeam {
  shortDisplayName: string;
  displayName: string;
  name: string;
  abbreviation: string;
  logos: Logo[];
}

interface GamePackageHeader {
  uid: string;
  week: number;
  timeValid: boolean;
  league: HeaderLeague;
  competitions: GamePackageCompetition[];
  season: Season;
  links: HeaderLink[];
  id: string;
}

interface GamePackageCompetition {
  date: string;
  commentaryAvailable: boolean;
  conferenceCompetition: boolean;
  liveAvailable: boolean;
  broadcasts: GamePackageBroadcast[];
  groups: Groups;
  playByPlaySource: SiteType;
  uid: string;
  competitors: GamePackageCompetitor[];
  onWatchESPN: boolean;
  boxscoreAvailable: boolean;
  id: string;
  neutralSite: boolean;
  recent: boolean;
  boxscoreSource: SiteType;
  status: Status;
}

interface GamePackageBroadcast {
  market: Market;
  media: Media;
  type: BroadcastType;
  lang: string;
  region: string;
}

interface Market {
  id: string;
  type: string;
}

interface Media {
  shortName: string;
}

interface BroadcastType {
  id: string;
  shortName: string;
}

interface Groups {
  midsizeName: string;
  name: string;
  id: string;
  abbreviation: string;
  shortName: string;
}

interface Status {
  isTBDFlex: boolean;
  type: StatusType;
  period?: number;
  displayClock?: string;
}

interface StatusType {
  name: string;
  description: string;
  id: string;
  state: string;
  completed: boolean;
  detail: string;
  shortDetail: string;
}

interface HeaderLeague {
  uid: string;
  midsizeName: string;
  name: string;
  links: AthleteLink[];
  id: string;
  abbreviation: string;
  slug: string;
  isTournament: boolean;
}

interface HeaderLink {
  isExternal: boolean;
  shortText: string;
  rel?: string[];
  href: string;
  text: string;
  isPremium: boolean;
  language?: string;
  attributes?: LinkAttributes;
}

interface LinkAttributes {
  mobile?: string;
  route?: string;
  icon?: string;
  breakpoints?: string;
  placeholder?: string;
}

interface Season {
  year: number;
  type: number;
}

interface ScoringPlay {
  period: PlayPeriod;
  homeScore: number;
  awayScore: number;
  scoringType: ScoringType;
  id: string;
  text: string;
  clock: Clock;
  team: ScoringPlayTeam;
  type: PlayType;
}

interface Clock {
  displayValue: string;
  value: number;
}

interface ScoringPlayTeam {
  uid: string;
  displayName: string;
  logo: string;
  id: string;
  abbreviation: string;
  logos: Logo[];
}

interface GamepackageJSONStandings {
  groups: Group[];
}

interface Group {
  header: string;
  standings: GroupStandings;
}

interface GroupStandings {
  entries: Entry[];
}

interface Entry {
  uid: string;
  stats: Stat[];
  link: string;
  logo: Logo[];
  team: string;
  id: string;
}

interface Stat {
  shortDisplayName: ShortDisplayName;
  summary: DisplayValue;
  displayValue: DisplayValue;
  displayName: StatDisplayName;
  name: StatName;
  description: Description;
  id: string;
  abbreviation: StatAbbreviation;
  type: StatType;
}

export enum StatAbbreviation {
  Conf = 'CONF',
  Overall = 'overall',
}

export enum Description {
  ConferenceRecord = 'Conference Record',
  OverallRecord = 'Overall Record',
}

export enum StatDisplayName {
  Overall = 'Overall',
  VsConference = 'vs. Conference',
}

export enum DisplayValue {
  The00 = '0-0',
}

export enum StatName {
  Overall = 'overall',
  VsConf = 'vs. Conf.',
}

export enum ShortDisplayName {
  Conf = 'CONF',
  Over = 'OVER',
}

export enum StatType {
  Total = 'total',
  Vsconf = 'vsconf',
}

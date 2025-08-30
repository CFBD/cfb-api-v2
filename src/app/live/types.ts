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
  averageStartYardLine: number | null;
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
  /**
   * Deserve-to-win metric for this team
   */
  deserveToWin?: number;
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
  rushPass: 'rush' | 'pass' | 'other';
  downType: 'passing' | 'standard';
  playText: string;
}

export interface PlayByPlayGameResponse {
  boxscore: Boxscore;
  format: Format;
  gameInfo: GameInfo;
  drives: GameDrives;
  leaders: Leader[];
  broadcasts: any[];
  pickcenter: Pickcenter[];
  againstTheSpread: AgainstTheSpread[];
  odds: any[];
  header: Header2;
  videos: any[];
  wallclockAvailable: boolean;
  news: News;
  winprobability: any[];
  meta: Meta;
  standings: Standings;
}

export interface Boxscore {
  teams: Team[];
  players: Player[];
}

export interface Team {
  team: Team2;
  statistics: Statistic[];
  displayOrder: number;
  homeAway: string;
}

export interface Team2 {
  id: string;
  uid: string;
  slug: string;
  location: string;
  name: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName: string;
  color: string;
  alternateColor: string;
  logo: string;
}

export interface Statistic {
  name: string;
  displayValue: string;
  value: any;
  label: string;
}

export interface Player {
  team: Team3;
  statistics: Statistic2[];
  displayOrder: number;
}

export interface Team3 {
  id: string;
  uid: string;
  slug: string;
  location: string;
  name: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName: string;
  color: string;
  alternateColor: string;
  logo: string;
}

export interface Statistic2 {
  name: string;
  keys: string[];
  text: string;
  labels: string[];
  descriptions: string[];
  athletes: Athlete[];
  totals: string[];
}

export interface Athlete {
  athlete: Athlete2;
  stats: string[];
}

export interface Athlete2 {
  id: string;
  uid: string;
  guid: string;
  firstName: string;
  lastName: string;
  displayName: string;
  links: Link[];
  headshot: Headshot;
  jersey: string;
}

export interface Link {
  rel: string[];
  href: string;
  text: string;
}

export interface Headshot {
  href: string;
  alt: string;
}

export interface Format {
  regulation: Regulation;
  overtime: Overtime;
}

export interface Regulation {
  periods: number;
  displayName: string;
  slug: string;
  clock: number;
}

export interface Overtime {
  periods: number;
  displayName: string;
  slug: string;
}

export interface GameInfo {
  venue: Venue;
  weather: Weather;
}

export interface Venue {
  id: string;
  guid: string;
  fullName: string;
  address: Address;
  grass: boolean;
  images: Image[];
}

export interface Address {
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface Image {
  href: string;
  width: number;
  height: number;
  alt: string;
  rel: string[];
}

export interface Weather {
  temperature: number;
  highTemperature: number;
  lowTemperature: number;
  conditionId: string;
  gust: number;
  precipitation: number;
  link: Link2;
}

export interface Link2 {
  language: string;
  rel: string[];
  href: string;
  text: string;
  shortText: string;
  isExternal: boolean;
  isPremium: boolean;
}

export interface GameDrives {
  current: CurrentGameDrive;
  previous: PreviousGameDrive[];
}

export interface CurrentGameDrive {
  id: string;
  description: string;
  team: Team4;
  start: Start;
  timeElapsed: TimeElapsed;
  yards: number;
  isScore: boolean;
  offensivePlays: number;
  plays: GamePlay[];
}

export interface Team4 {
  id: string;
  name: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName: string;
  logos: Logo[];
}

export interface Logo {
  href: string;
  width: number;
  height: number;
  alt: string;
  rel: string[];
  lastUpdated: string;
}

export interface Start {
  period: Period;
  clock: Clock;
  yardLine: number;
  text: string;
}

export interface Period {
  type: string;
  number: number;
}

export interface Clock {
  displayValue: string;
}

export interface TimeElapsed {
  displayValue: string;
}

export interface Type {
  id: string;
  text: string;
  abbreviation?: string;
}

export interface Period2 {
  number: number;
}

export interface Clock2 {
  displayValue: string;
}

export interface Start2 {
  down: number;
  distance: number;
  yardLine: number;
  yardsToEndzone: number;
  downDistanceText: string;
  shortDownDistanceText: string;
  possessionText: string;
  team: Team5;
}

export interface Team5 {
  id: string;
}

export interface End {
  down: number;
  distance: number;
  yardLine: number;
  yardsToEndzone: number;
  downDistanceText: string;
  shortDownDistanceText: string;
  possessionText: string;
  team: Team6;
}

export interface Team6 {
  id: string;
}

export interface Participant {
  athlete: Athlete3;
  stats: Stat[];
  type: string;
}

export interface Athlete3 {
  id: string;
  uid: string;
  guid: string;
  lastName: string;
  fullName: string;
  displayName: string;
  shortName: string;
  links: Link3[];
  headshot: Headshot2;
  jersey: string;
  position: Position;
  team: Team7;
  status: Status;
}

export interface Link3 {
  rel: string[];
  href: string;
  text: string;
}

export interface Headshot2 {
  href: string;
  alt: string;
}

export interface Position {
  name: string;
  displayName: string;
  abbreviation: string;
}

export interface Team7 {
  abbreviation: string;
}

export interface Status {
  id: string;
  name: string;
  type: string;
  abbreviation: string;
}

export interface Stat {
  name: string;
  displayValue: string;
}

export interface PreviousGameDrive {
  id: string;
  description: string;
  team: Team8;
  start: Start3;
  end?: End2;
  timeElapsed: TimeElapsed2;
  yards: number;
  isScore: boolean;
  offensivePlays: number;
  result?: string;
  shortDisplayResult?: string;
  displayResult?: string;
  plays: GamePlay[];
}

export interface Team8 {
  id: string;
  name: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName: string;
  logos: Logo2[];
}

export interface Logo2 {
  href: string;
  width: number;
  height: number;
  alt: string;
  rel: string[];
  lastUpdated: string;
}

export interface Start3 {
  period: Period3;
  clock: Clock3;
  yardLine: number;
  text: string;
}

export interface Period3 {
  type: string;
  number: number;
}

export interface Clock3 {
  displayValue: string;
}

export interface End2 {
  period: Period4;
  clock: Clock4;
  yardLine: number;
  text: string;
}

export interface Period4 {
  type: string;
  number: number;
}

export interface Clock4 {
  displayValue: string;
}

export interface TimeElapsed2 {
  displayValue: string;
}

export interface GamePlay {
  id: string;
  sequenceNumber: string;
  type: Type2;
  text: string;
  awayScore: number;
  homeScore: number;
  period: Period5;
  clock: Clock5;
  scoringPlay: boolean;
  priority: boolean;
  modified: string;
  wallclock: string;
  start: Start4;
  end: End3;
  statYardage: number;
  scoreValue?: number;
  participants?: Participant[];
}

export interface Type2 {
  id: string;
  text: string;
  abbreviation?: string;
}

export interface Period5 {
  number: number;
}

export interface Clock5 {
  displayValue: string;
}

export interface Start4 {
  down: number;
  distance: number;
  yardLine: number;
  yardsToEndzone: number;
  team: Team9;
  downDistanceText?: string;
  shortDownDistanceText?: string;
  possessionText?: string;
}

export interface Team9 {
  id: string;
}

export interface End3 {
  down: number;
  distance: number;
  yardLine: number;
  yardsToEndzone: number;
  downDistanceText: string;
  shortDownDistanceText: string;
  possessionText: string;
  team: Team10;
}

export interface Team10 {
  id: string;
}

export interface Leader {
  team: Team11;
  leaders: Leader2[];
}

export interface Team11 {
  id: string;
  uid: string;
  displayName: string;
  abbreviation: string;
  links: Link4[];
  logo: string;
  logos: Logo3[];
}

export interface Link4 {
  href: string;
  text: string;
}

export interface Logo3 {
  href: string;
  width: number;
  height: number;
  alt: string;
  rel: string[];
  lastUpdated: string;
}

export interface Leader2 {
  name: string;
  displayName: string;
  leaders?: Leader3[];
}

export interface Leader3 {
  displayValue: string;
  athlete: Athlete4;
  mainStat: MainStat;
  summary: string;
}

export interface Athlete4 {
  id: string;
  uid: string;
  guid: string;
  lastName: string;
  fullName: string;
  displayName: string;
  shortName: string;
  links: Link5[];
  headshot: Headshot3;
  jersey: string;
  position: Position2;
  status: Status2;
}

export interface Link5 {
  rel: string[];
  href: string;
  text: string;
}

export interface Headshot3 {
  href: string;
  alt: string;
}

export interface Position2 {
  abbreviation: string;
}

export interface Status2 {
  id: string;
  name: string;
  type: string;
  abbreviation: string;
}

export interface MainStat {
  value: string;
  label: string;
}

export interface Pickcenter {
  provider: Provider;
  details: string;
  overUnder: number;
  spread: number;
  overOdds: number;
  underOdds: number;
  awayTeamOdds: AwayTeamOdds;
  homeTeamOdds: HomeTeamOdds;
  links: Link6[];
  header: Header;
}

export interface Provider {
  id: string;
  name: string;
  priority: number;
  logos: Logo4[];
}

export interface Logo4 {
  href: string;
  rel: string[];
}

export interface AwayTeamOdds {
  favorite: boolean;
  underdog: boolean;
  moneyLine: number;
  spreadOdds: number;
  team: Team12;
  teamId: string;
  favoriteAtOpen: boolean;
}

export interface Team12 {
  $ref: string;
}

export interface HomeTeamOdds {
  favorite: boolean;
  underdog: boolean;
  moneyLine: number;
  spreadOdds: number;
  team: Team13;
  teamId: string;
  favoriteAtOpen: boolean;
}

export interface Team13 {
  $ref: string;
}

export interface Link6 {
  language: string;
  rel: string[];
  href: string;
  text: string;
  shortText: string;
  isExternal: boolean;
  isPremium: boolean;
  tracking?: Tracking;
}

export interface Tracking {
  campaign: string;
  tags: Tags;
}

export interface Tags {
  league: string;
  sport: string;
  gameId: number;
  betSide: string;
  betType: string;
  betDetails?: string;
}

export interface Header {
  logo: Logo5;
  text: string;
}

export interface Logo5 {
  dark: string;
  light: string;
  exclusivesLogoDark: string;
  exclusivesLogoLight: string;
}

export interface AgainstTheSpread {
  team: Team14;
  records: any[];
}

export interface Team14 {
  id: string;
  uid: string;
  displayName: string;
  abbreviation: string;
  links: Link7[];
  logo: string;
  logos: Logo6[];
}

export interface Link7 {
  href: string;
  text: string;
}

export interface Logo6 {
  href: string;
  width: number;
  height: number;
  alt: string;
  rel: string[];
  lastUpdated: string;
}

export interface Header2 {
  id: string;
  uid: string;
  season: Season;
  timeValid: boolean;
  competitions: Competition[];
  links: Link9[];
  week: number;
  league: League;
}

export interface Season {
  year: number;
  current: boolean;
  type: number;
}

export interface Competition {
  id: string;
  uid: string;
  date: string;
  dateValid: boolean;
  neutralSite: boolean;
  conferenceCompetition: boolean;
  boxscoreAvailable: boolean;
  commentaryAvailable: boolean;
  liveAvailable: boolean;
  onWatchESPN: boolean;
  recent: boolean;
  wallclockAvailable: boolean;
  boxscoreSource: string;
  playByPlaySource: string;
  competitors: Competitor[];
  status: Status3;
  broadcasts: Broadcast[];
  boxscoreMinutes: boolean;
}

export interface Competitor {
  id: string;
  uid: string;
  order: number;
  homeAway: string;
  team: Team15;
  score: string;
  linescores: Linescore[];
  record: Record[];
  timeoutsUsed: number;
  possession: boolean;
  rank?: number;
}

export interface Team15 {
  id: string;
  guid: string;
  uid: string;
  location: string;
  name: string;
  nickname: string;
  abbreviation: string;
  displayName: string;
  color: string;
  alternateColor: string;
  logos: Logo7[];
  groups: Groups;
  links: Link8[];
}

export interface Logo7 {
  href: string;
  width: number;
  height: number;
  alt: string;
  rel: string[];
  lastUpdated: string;
}

export interface Groups {
  id: string;
}

export interface Link8 {
  rel: string[];
  href: string;
  text: string;
}

export interface Linescore {
  displayValue: string;
}

export interface Record {
  type: string;
  summary: string;
  displayValue: string;
}

export interface Status3 {
  displayClock: string;
  period: number;
  type: Type3;
  displayPeriod: string;
}

export interface Type3 {
  id: string;
  name: string;
  state: string;
  completed: boolean;
  description: string;
  detail: string;
  shortDetail: string;
}

export interface Broadcast {
  type: Type4;
  market: Market;
  media: Media;
  lang: string;
  region: string;
  isNational: boolean;
}

export interface Type4 {
  id: string;
  shortName: string;
}

export interface Market {
  id: string;
  type: string;
}

export interface Media {
  shortName: string;
}

export interface Link9 {
  rel: string[];
  href: string;
  text: string;
  shortText: string;
  isExternal: boolean;
  isPremium: boolean;
}

export interface League {
  id: string;
  uid: string;
  name: string;
  abbreviation: string;
  midsizeName: string;
  slug: string;
  isTournament: boolean;
  links: Link10[];
}

export interface Link10 {
  rel: string[];
  href: string;
  text: string;
}

export interface News {
  header: string;
  link: Link11;
  articles: Article[];
}

export interface Link11 {
  language: string;
  rel: string[];
  href: string;
  text: string;
  shortText: string;
  isExternal: boolean;
  isPremium: boolean;
}

export interface Article {
  id: number;
  nowId: string;
  contentKey: string;
  dataSourceIdentifier: string;
  type: string;
  headline: string;
  description: string;
  lastModified: string;
  published: string;
  images: Image2[];
  categories: Category[];
  premium: boolean;
  links: Links3;
}

export interface Image2 {
  type?: string;
  name: string;
  url: string;
  ratio?: string;
  height?: number;
  width?: number;
  caption?: string;
  alt?: string;
}

export interface Category {
  type: string;
  uid?: string;
  guid: string;
  description?: string;
  eventId?: number;
  event?: Event;
  id?: number;
  sportId?: number;
  teamId?: number;
  team?: Team16;
  leagueId?: number;
  league?: League2;
}

export interface Event {
  id: number;
  sport: string;
  league: string;
  description: string;
}

export interface Team16 {
  id: number;
  description: string;
  links?: Links;
}

export interface Links {
  web: Web;
  mobile: Mobile;
}

export interface Web {
  teams: Teams;
}

export interface Teams {
  href: string;
}

export interface Mobile {
  teams: Teams2;
}

export interface Teams2 {
  href: string;
}

export interface League2 {
  id: number;
  description: string;
  abbreviation: string;
  links: Links2;
}

export interface Links2 {
  web: Web2;
  mobile: Mobile2;
}

export interface Web2 {
  leagues: Leagues;
}

export interface Leagues {
  href: string;
}

export interface Mobile2 {
  leagues: Leagues2;
}

export interface Leagues2 {
  href: string;
}

export interface Links3 {
  web: Web3;
  mobile?: Mobile3;
  api: Api;
  app?: App;
  sportscenter?: Sportscenter2;
}

export interface Web3 {
  href: string;
  self?: Self;
  seo?: Seo;
}

export interface Self {
  href: string;
  dsi: Dsi;
}

export interface Dsi {
  href: string;
}

export interface Seo {
  href: string;
}

export interface Mobile3 {
  href: string;
}

export interface Api {
  self: Self2;
  artwork?: Artwork;
}

export interface Self2 {
  href: string;
}

export interface Artwork {
  href: string;
}

export interface App {
  sportscenter: Sportscenter;
}

export interface Sportscenter {
  href: string;
}

export interface Sportscenter2 {
  href: string;
}

export interface Meta {
  gp_topic: string;
  gameSwitcherEnabled: boolean;
  picker_topic: string;
  lastUpdatedAt: string;
  firstPlayWallClock: string;
  lastPlayWallClock: string;
  gameState: string;
  syncUrl: string;
}

export interface Standings {
  fullViewLink: FullViewLink;
  header: string;
  groups: Group[];
  isSameConference: boolean;
}

export interface FullViewLink {
  text: string;
  href: string;
}

export interface Group {
  standings: Standings2;
  header: string;
  conferenceHeader: string;
  divisionHeader: string;
  shortDivisionHeader: string;
}

export interface Standings2 {
  entries: Entry[];
}

export interface Entry {
  team: string;
  link: string;
  id: string;
  uid: string;
  stats: Stat2[];
  logo: Logo8[];
}

export interface Stat2 {
  id: string;
  name: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName: string;
  description: string;
  type: string;
  summary: string;
  displayValue: string;
}

export interface Logo8 {
  href: string;
  width: number;
  height: number;
  alt: string;
  rel: string[];
  lastUpdated: string;
}

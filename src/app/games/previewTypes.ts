import {
  DivisionClassification,
  GameStatus,
  MediaType,
  SeasonType,
} from '../enums';
import { GamePlayoff } from './types';
import {
  TeamSeasonAdvancedStats,
  TeamSeasonOverview,
} from '../teams/seasonOverviewTypes';
import { TeamPassingSeason } from '../passing/types';
import { TeamRushingSeason } from '../rushing/types';
import {
  AdjustedTeamMetrics,
  PlayerWeightedEPA,
  KickerPAAR,
} from '../wepa/types';

export interface PreviewSection<T> {
  status: 'available' | 'no_data' | 'unavailable';
  reason: 'no_data' | 'no_results_yet' | 'source_error' | 'invalid_data' | null;
  /** @format date-time */
  assembledAt: string;
  /** Snapshot publication time, not a games-through cutoff. @format date-time */
  sourceUpdatedAt: string | null;
  data: T | null;
}
export interface PreviewVenue {
  /** @isInt */
  id: number;
  name: string | null;
  city: string | null;
  state: string | null;
}
export interface PreviewTeamIdentity {
  /** @isInt */
  id: number;
  name: string;
  conference: string | null;
  conferenceAbbreviation: string | null;
  classification: DivisionClassification | null;
  /** @isInt */
  points: number | null;
}
export interface GamePreviewMetadata {
  /** @isInt */
  id: number;
  /** @isInt */
  season: number;
  /** @isInt */
  week: number;
  seasonType: SeasonType | 'preseason';
  /** @format date-time */
  startDate: string | null;
  startTimeTBD: boolean | null;
  status: GameStatus;
  /** @format date-time */
  statusCheckedAt: string;
  neutralSite: boolean;
  conferenceGame: boolean | null;
  venue: PreviewVenue | null;
  homeTeam: PreviewTeamIdentity;
  awayTeam: PreviewTeamIdentity;
  playoff: GamePlayoff | null;
}
export interface ScheduleWindow {
  /** @isInt */
  year: number;
  seasonType: 'regular' | 'postseason';
  /** @isInt */
  week: number;
  /** @format date-time */
  startDate: string;
  /** Exclusive UTC bound. @format date-time */
  endDate: string;
}
export interface PreviewBroadcast {
  mediaType: MediaType;
  outlet: string;
}
export interface SelectedOdds {
  /** @isInt */
  providerId: number;
  provider: 'DraftKings' | 'Bovada';
  /** Home-relative spread; negative favors home. */
  spread: number | null;
  overUnder: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
}
export interface ScheduleGame extends GamePreviewMetadata {
  broadcasts: PreviewSection<PreviewBroadcast[]>;
  odds: PreviewSection<SelectedOdds>;
}
export interface GameSchedule {
  /** @format date-time */
  assembledAt: string;
  selection: 'active' | 'next' | 'explicit' | 'none';
  filters: { classification: 'fbs' | 'fcs'; conference: string | null };
  window: ScheduleWindow | null;
  followingWindow: ScheduleWindow | null;
  games: ScheduleGame[];
}
export interface PreviewTeamStatistics {
  /** @isInt */
  season: number;
  isPreviousSeason: boolean;
  advanced: TeamSeasonAdvancedStats;
  passing: TeamPassingSeason | null;
  rushing: TeamRushingSeason | null;
}
export interface PreviewKeyPlayer {
  athleteId: string;
  name: string | null;
  position: string | null;
  /** Pass/rush involvement, not receiving target share. */
  usage: number | null;
  averagePPA: number | null;
  totalPPA: number | null;
}
export interface PlayerSourceAvailability {
  status: 'available' | 'no_data' | 'unavailable';
  reason: 'no_data' | 'source_error' | 'invalid_data' | null;
  /** @format date-time */
  assembledAt: string;
  /** @format date-time */
  sourceUpdatedAt: string | null;
}
export interface PreviewKeyPlayers {
  /** @isInt */
  season: number;
  ppa: PlayerSourceAvailability;
  usage: PlayerSourceAvailability;
  passing: PreviewSection<PreviewKeyPlayer[]>;
  rushing: PreviewSection<PreviewKeyPlayer[]>;
  receiving: PreviewSection<PreviewKeyPlayer[]>;
}
export interface RecentResult {
  /** @isInt */
  gameId: number;
  /** @isInt */
  season: number;
  /** @format date-time */
  startDate: string;
  opponent: { id: number; name: string };
  homeAway: 'home' | 'away';
  neutralSite: boolean;
  venue: PreviewVenue | null;
  /** @isInt */
  teamPoints: number | null;
  /** @isInt */
  opponentPoints: number | null;
  result: 'win' | 'loss' | 'tie' | 'unknown';
}
export interface SeriesMeeting {
  /** @isInt */
  gameId: number;
  /** @isInt */
  season: number;
  /** @format date-time */
  startDate: string;
  /** @isInt */
  homeTeamId: number;
  homeTeam: string;
  /** @isInt */
  awayTeamId: number;
  awayTeam: string;
  neutralSite: boolean;
  venue: PreviewVenue | null;
  /** @isInt */
  homePoints: number | null;
  /** @isInt */
  awayPoints: number | null;
  /** @isInt */
  winnerTeamId: number | null;
  result: 'win' | 'tie' | 'unknown';
}
export interface SeriesHistory {
  /** @isInt */
  homeTeamId: number;
  /** @isInt */
  awayTeamId: number;
  /** @isInt */
  meetings: number;
  /** @isInt */
  knownResults: number;
  /** @isInt */
  unknownResults: number;
  /** @isInt */
  homeWins: number;
  /** @isInt */
  awayWins: number;
  /** @isInt */
  ties: number;
  /** @isInt */
  firstSeason: number | null;
  /** @isInt */
  lastSeason: number | null;
  latestMeeting: SeriesMeeting | null;
  streak: { teamId: number; wins: number } | null;
  recentMeetings: SeriesMeeting[];
}
export interface FreePreviewTeam {
  /** @isInt */
  teamId: number;
  /** @isInt */
  season: number;
  record: PreviewSection<TeamSeasonOverview['record']>;
  ratings: PreviewSection<TeamSeasonOverview['ratings']>;
  statistics: PreviewSection<PreviewTeamStatistics>;
  keyPlayers: PreviewKeyPlayers;
  recentResults: PreviewSection<RecentResult[]>;
}
export interface FreePreviewAnalysis {
  broadcasts: PreviewSection<PreviewBroadcast[]>;
  odds: PreviewSection<SelectedOdds>;
  home: FreePreviewTeam;
  away: FreePreviewTeam;
  series: PreviewSection<SeriesHistory>;
}
export interface PreviewAdjustedTeamMetrics {
  /** @isInt */
  season: number;
  isPreviousSeason: boolean;
  metrics: AdjustedTeamMetrics;
}
export interface PreviewPlayerWepa extends Omit<PlayerWeightedEPA, 'plays'> {
  /** @isInt */
  plays: number | null;
}
export interface PreviewKickerPaar extends Omit<KickerPAAR, 'attempts'> {
  /** @isInt */
  attempts: number | null;
}
export interface AdjustedPreviewTeam {
  /** @isInt */
  teamId: number;
  /** @isInt */
  season: number;
  teamMetrics: PreviewSection<PreviewAdjustedTeamMetrics>;
  passing: PreviewSection<PreviewPlayerWepa[]>;
  rushing: PreviewSection<PreviewPlayerWepa[]>;
  kicking: PreviewSection<PreviewKickerPaar[]>;
}
export interface AdjustedPreviewAnalysis {
  home: AdjustedPreviewTeam;
  away: AdjustedPreviewTeam;
}
export type PreviewReason =
  | 'game_started'
  | 'game_completed'
  | 'kickoff_reached'
  | 'kickoff_unknown'
  | null;
export interface GamePreview {
  /** @format date-time */
  assembledAt: string;
  game: GamePreviewMetadata;
  availability: 'pregame' | 'metadata_only';
  reason: PreviewReason;
  analysis: FreePreviewAnalysis | null;
}
export interface AdjustedGamePreview {
  /** @format date-time */
  assembledAt: string;
  game: GamePreviewMetadata;
  availability: 'pregame' | 'metadata_only';
  reason: PreviewReason;
  analysis: AdjustedPreviewAnalysis | null;
}
export interface GamePreviewError {
  message: string;
}

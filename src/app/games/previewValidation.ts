import Joi from 'joi';
import {
  DivisionClassification,
  GameStatus,
  MediaType,
  SeasonType,
} from '../enums';
import { isTeamSeasonSnapshotPayload } from '../teams/seasonOverviewPayload';
import {
  GamePreviewMetadata,
  ScheduleWindow,
  AdjustedPreviewAnalysis,
  PreviewSection,
  SeriesHistory,
} from './previewTypes';
import { PreviewCore } from './previewGame';
import { readPreviewEnrichment } from './previewEnrichment';
import { PreviewContextTeam } from './previewContext';
import { PreviewSnapshotTeam } from './previewSnapshots';

const integer = Joi.number().integer().max(Number.MAX_SAFE_INTEGER),
  id = integer.min(1),
  number = Joi.number(),
  nullable = number.allow(null);
const text = Joi.string(),
  nullableText = text.allow('', null),
  date = Joi.string().isoDate();
const venue = Joi.object({
  id,
  name: nullableText,
  city: nullableText,
  state: nullableText,
}).allow(null);
const team = Joi.object({
  id,
  name: text,
  conference: nullableText,
  conferenceAbbreviation: nullableText,
  classification: Joi.string()
    .valid(...Object.values(DivisionClassification))
    .allow(null),
  points: integer.allow(null),
});
const metadata = Joi.object({
  id,
  season: id,
  week: integer.min(0),
  seasonType: Joi.string().valid(...Object.values(SeasonType), 'preseason'),
  startDate: date.allow(null),
  startTimeTBD: Joi.boolean().allow(null),
  status: Joi.string().valid(...Object.values(GameStatus)),
  statusCheckedAt: date,
  neutralSite: Joi.boolean(),
  conferenceGame: Joi.boolean().allow(null),
  venue,
  homeTeam: team,
  awayTeam: team,
  playoff: Joi.object({
    competition: Joi.string().valid('cfp'),
    format: text,
    round: text,
    roundName: text,
    bracketSlot: text,
    homeSeed: integer.allow(null),
    awaySeed: integer.allow(null),
    bowlName: nullableText,
  }).allow(null),
});
const core = Joi.object({
  game: metadata,
  classifications: Joi.array()
    .items(Joi.string().valid(...Object.values(DivisionClassification)))
    .unique(),
  conferences: Joi.array().items(text).unique(),
}).custom((v, h) =>
  v.game.homeTeam.id !== v.game.awayTeam.id ? v : h.error('any.invalid'),
);
const windowSchema = Joi.object({
  year: id,
  seasonType: Joi.string().valid('regular', 'postseason'),
  week: integer.min(0),
  startDate: date,
  endDate: date,
});
const sectionSchema = (data: Joi.Schema) =>
  Joi.object({
    status: Joi.string().valid('available', 'no_data', 'unavailable'),
    reason: Joi.string()
      .valid('no_data', 'no_results_yet', 'source_error', 'invalid_data')
      .allow(null),
    assembledAt: date,
    sourceUpdatedAt: date.allow(null),
    data: data.allow(null),
  }).custom((v, helpers) => {
    if (v.status === 'available' && (v.reason !== null || v.data === null))
      return helpers.error('any.invalid');
    if (
      v.status === 'unavailable' &&
      (v.data !== null || !['source_error', 'invalid_data'].includes(v.reason))
    )
      return helpers.error('any.invalid');
    if (
      v.status === 'no_data' &&
      !['no_data', 'no_results_yet'].includes(v.reason)
    )
      return helpers.error('any.invalid');
    return v;
  });
const broadcast = Joi.object({
  mediaType: Joi.string().valid(...Object.values(MediaType)),
  outlet: text,
});
const odds = Joi.object({
  providerId: Joi.number().valid(888888, 999999),
  provider: Joi.string().valid('DraftKings', 'Bovada'),
  spread: nullable,
  overUnder: nullable,
  homeMoneyline: nullable,
  awayMoneyline: nullable,
}).custom((v, h) =>
  v.provider === (v.providerId === 888888 ? 'DraftKings' : 'Bovada') &&
  [v.spread, v.overUnder, v.homeMoneyline, v.awayMoneyline].some(
    (n) => n !== null,
  )
    ? v
    : h.error('any.invalid'),
);
const enrichment = Joi.object({
  id,
  broadcasts: sectionSchema(Joi.array().items(broadcast)),
  odds: sectionSchema(odds),
});
const check = (schema: Joi.Schema, value: unknown): boolean =>
  !schema.validate(value, {
    presence: 'required',
    convert: false,
    allowUnknown: false,
  }).error;
export const validGame = (value: unknown): value is PreviewCore =>
  check(core, value);
export const validCalendar = (value: unknown): value is ScheduleWindow[] =>
  check(Joi.array().items(windowSchema), value);
export interface PreviewSlate {
  assembledAt: string;
  core: PreviewCore[];
  enrichment: Awaited<ReturnType<typeof readPreviewEnrichment>>;
}
export const validSlate = (value: unknown): value is PreviewSlate =>
  check(
    Joi.object({
      assembledAt: date,
      core: Joi.array().items(core),
      enrichment: Joi.array().items(enrichment),
    }),
    value,
  );
export const validEnrichment = (
  value: unknown,
): value is Awaited<ReturnType<typeof readPreviewEnrichment>> =>
  check(Joi.array().items(enrichment), value);
const rating = Joi.object({
  rating: nullable,
  rank: integer.min(1).allow(null),
});
const ratings = Joi.object({
  core: Joi.object({ overall: rating, offense: rating, defense: rating }).allow(
    null,
  ),
  srs: rating.allow(null),
  elo: nullable,
  sp: Joi.object({
    overall: rating,
    offense: rating,
    defense: rating,
    specialTeams: rating,
  }).allow(null),
  fpi: Joi.object({
    overall: rating,
    offense: rating,
    defense: rating,
    specialTeams: rating,
  }).allow(null),
});
const recent = Joi.object({
  gameId: id,
  season: id,
  startDate: date,
  opponent: Joi.object({ id, name: text }),
  homeAway: Joi.string().valid('home', 'away'),
  neutralSite: Joi.boolean(),
  venue,
  teamPoints: integer.allow(null),
  opponentPoints: integer.allow(null),
  result: Joi.string().valid('win', 'loss', 'tie', 'unknown'),
});
const context = Joi.object({
  teamId: id,
  record: sectionSchema(
    Joi.object({
      games: integer.min(0),
      wins: integer.min(0),
      losses: integer.min(0),
      ties: integer.min(0),
    }),
  ),
  ratings: sectionSchema(ratings),
  recentResults: sectionSchema(Joi.array().items(recent).max(5)),
});
export const validContext = (value: unknown): value is PreviewContextTeam[] =>
  check(Joi.array().items(context).length(2), value);
const meeting = Joi.object({
  gameId: id,
  season: id,
  startDate: date,
  homeTeamId: id,
  homeTeam: text,
  awayTeamId: id,
  awayTeam: text,
  neutralSite: Joi.boolean(),
  venue,
  homePoints: integer.allow(null),
  awayPoints: integer.allow(null),
  winnerTeamId: id.allow(null),
  result: Joi.string().valid('win', 'tie', 'unknown'),
});
const series = Joi.object({
  homeTeamId: id,
  awayTeamId: id,
  meetings: integer.min(0),
  knownResults: integer.min(0),
  unknownResults: integer.min(0),
  homeWins: integer.min(0),
  awayWins: integer.min(0),
  ties: integer.min(0),
  firstSeason: id.allow(null),
  lastSeason: id.allow(null),
  latestMeeting: meeting.allow(null),
  streak: Joi.object({ teamId: id, wins: integer.min(1) }).allow(null),
  recentMeetings: Joi.array().items(meeting).max(5),
});
export const validSeries = (
  value: unknown,
): value is PreviewSection<SeriesHistory> =>
  check(sectionSchema(series), value);
const availability = Joi.object({
  status: Joi.string().valid('available', 'no_data', 'unavailable'),
  reason: Joi.string()
    .valid('no_data', 'source_error', 'invalid_data')
    .allow(null),
  assembledAt: date,
  sourceUpdatedAt: date.allow(null),
});
const player = Joi.object({
  athleteId: text,
  name: nullableText,
  position: nullableText,
  usage: nullable,
  averagePPA: nullable,
  totalPPA: nullable,
});
const statistics = Joi.object({
  season: id,
  isPreviousSeason: Joi.boolean(),
  advanced: Joi.object().unknown(true),
  passing: Joi.object().unknown(true).allow(null),
  rushing: Joi.object().unknown(true).allow(null),
}).custom((v, h) =>
  isTeamSeasonSnapshotPayload(
    {
      advanced: v.advanced,
      passing: v.passing,
      rushing: v.rushing,
      players: { ppa: [], usage: [] },
    },
    v.season,
    v.advanced.team,
  )
    ? v
    : h.error('any.invalid'),
);
const snapshot = Joi.object({
  teamId: id,
  season: id,
  statistics: sectionSchema(statistics),
  keyPlayers: Joi.object({
    season: id,
    ppa: availability,
    usage: availability,
    passing: sectionSchema(
      Joi.array().items(player).unique('athleteId').max(2),
    ),
    rushing: sectionSchema(
      Joi.array().items(player).unique('athleteId').max(3),
    ),
    receiving: sectionSchema(
      Joi.array().items(player).unique('athleteId').max(5),
    ),
  }),
});
export const validSnapshot = (value: unknown): value is PreviewSnapshotTeam =>
  check(snapshot, value);
const epa = Joi.object({ total: number, passing: number, rushing: number });
const success = Joi.object({
  total: number,
  standardDowns: number,
  passingDowns: number,
});
const rushing = Joi.object({
  lineYards: number,
  secondLevelYards: number,
  openFieldYards: number,
  highlightYards: number,
});
const teamMetrics = Joi.object({
  season: id,
  isPreviousSeason: Joi.boolean(),
  metrics: Joi.object({
    year: id,
    teamId: id,
    team: text,
    conference: text.allow(''),
    epa,
    epaAllowed: epa,
    successRate: success,
    successRateAllowed: success,
    rushing,
    rushingAllowed: rushing,
    explosiveness: number,
    explosivenessAllowed: number,
  }),
});
const adjustedPlayer = Joi.object({
  year: id,
  athleteId: text,
  athleteName: text,
  team: text,
  conference: text.allow(''),
  position: text,
  wepa: number,
  plays: integer.min(0).allow(null),
});
const kicker = Joi.object({
  year: id,
  athleteId: text,
  athleteName: text,
  team: text,
  conference: text.allow(''),
  paar: number,
  attempts: integer.min(0).allow(null),
});
const adjustedTeam = Joi.object({
  teamId: id,
  season: id,
  teamMetrics: sectionSchema(teamMetrics),
  passing: sectionSchema(
    Joi.array().items(adjustedPlayer).unique('athleteId').max(2),
  ),
  rushing: sectionSchema(
    Joi.array().items(adjustedPlayer).unique('athleteId').max(3),
  ),
  kicking: sectionSchema(Joi.array().items(kicker).max(1)),
});
export const validAdjusted = (
  value: unknown,
): value is AdjustedPreviewAnalysis =>
  check(Joi.object({ home: adjustedTeam, away: adjustedTeam }), value);
export const snapshotIdentity = (
  value: PreviewSnapshotTeam,
  game: GamePreviewMetadata,
  teamId: number,
): boolean =>
  value.teamId === teamId &&
  value.season === game.season &&
  value.keyPlayers.season === game.season &&
  (!value.statistics.data ||
    (value.statistics.data.season ===
      (value.statistics.data.isPreviousSeason
        ? game.season - 1
        : game.season) &&
      value.statistics.data.advanced.team ===
        (teamId === game.homeTeam.id
          ? game.homeTeam.name
          : game.awayTeam.name)));

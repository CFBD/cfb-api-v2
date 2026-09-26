import { Kysely } from 'kysely';
import { DB } from '../../config/types/db';
import { seasonOverviewRatings } from '../teams/seasonOverviewRatings';
import { mapSeasonOverviewRatings } from '../teams/seasonOverview';
import {
  GamePreviewMetadata,
  PreviewSection,
  RecentResult,
  SeriesHistory,
  SeriesMeeting,
} from './previewTypes';
import { TeamSeasonOverview } from '../teams/seasonOverviewTypes';
import {
  optionalRead,
  previewRead,
  section,
  storedUtc,
  utcBinding,
  PreviewDataError,
} from './previewRead';

export const previewRatingsQuery = (
  db: Kysely<DB>,
  year: number,
  ids: number[],
) =>
  seasonOverviewRatings(db, year)
    .selectFrom('team as t')
    .leftJoin('rankedCore as core', (join) =>
      join.onRef('core.teamId', '=', 't.id').on('core.year', '=', year),
    )
    .leftJoin('rankedSrs as srs', (join) =>
      join.onRef('srs.teamId', '=', 't.id').on('srs.year', '=', year),
    )
    .leftJoin('rankedSp as sp', (join) =>
      join.onRef('sp.teamId', '=', 't.id').on('sp.year', '=', year),
    )
    .leftJoin('rankedFpi as fpi', (join) =>
      join.onRef('fpi.teamId', '=', 't.id').on('fpi.year', '=', year),
    )
    .leftJoinLateral(
      (eb) =>
        eb
          .selectFrom('game as eg')
          .innerJoin('gameTeam as egt', 'egt.gameId', 'eg.id')
          .whereRef('egt.teamId', '=', 't.id')
          .where('eg.season', '=', year)
          .where('eg.status', '=', 'completed')
          .where('egt.endElo', 'is not', null)
          .orderBy('eg.startDate', 'desc')
          .orderBy('eg.id', 'desc')
          .select('egt.endElo')
          .limit(1)
          .as('elo'),
      (join) => join.onTrue(),
    )
    .where('t.id', 'in', ids)
    .select([
      't.id as teamId',
      'core.overall as coreOverall',
      'core.offense as coreOffense',
      'core.defense as coreDefense',
      'core.teamId as coreTeamId',
      'srs.rating as srsRating',
      'elo.endElo as eloRating',
      'sp.teamId as spTeamId',
      'sp.rating as spOverall',
      'sp.oRating as spOffense',
      'sp.dRating as spDefense',
      'sp.stRating as spSpecialTeams',
      'core.overallRank as coreOverallRank',
      'core.offenseRank as coreOffenseRank',
      'core.defenseRank as coreDefenseRank',
      'srs.ratingRank as srsRank',
      'sp.ratingRank as spOverallRank',
      'sp.oRatingRank as spOffenseRank',
      'sp.dRatingRank as spDefenseRank',
      'sp.stRatingRank as spSpecialTeamsRank',
      'fpi.teamId as fpiTeamId',
      'fpi.overallEfficiency as fpiOverall',
      'fpi.offensiveEfficiency as fpiOffense',
      'fpi.defensiveEfficiency as fpiDefense',
      'fpi.specialTeamsEfficiency as fpiSpecialTeams',
      'fpi.overallEfficiencyRank as fpiOverallRank',
      'fpi.offensiveEfficiencyRank as fpiOffenseRank',
      'fpi.defensiveEfficiencyRank as fpiDefenseRank',
      'fpi.specialTeamsEfficiencyRank as fpiSpecialTeamsRank',
    ]);

export const outcome = (
  winner: boolean | null,
  opponentWinner: boolean | null,
  points: number | null,
  opponentPoints: number | null,
): 'win' | 'loss' | 'tie' | 'unknown' => {
  if (winner === true && opponentWinner !== true) return 'win';
  if (opponentWinner === true && winner !== true) return 'loss';
  if (
    winner === false &&
    opponentWinner === false &&
    points !== null &&
    opponentPoints !== null &&
    points === opponentPoints
  )
    return 'tie';
  return 'unknown';
};
export const previewRecordsQuery = (
  db: Kysely<DB>,
  year: number,
  ids: number[],
) =>
  db
    .selectFrom('game as g')
    .innerJoin('gameTeam as gt', 'gt.gameId', 'g.id')
    .innerJoin('gameTeam as opp', (j) =>
      j
        .onRef('opp.gameId', '=', 'g.id')
        .onRef('opp.homeAway', '<>', 'gt.homeAway'),
    )
    .where('g.season', '=', year)
    .where('g.status', '=', 'completed')
    .where('gt.teamId', 'in', ids)
    .groupBy('gt.teamId')
    .select('gt.teamId')
    .select((eb) => [
      eb.fn.countAll<string>().as('games'),
      eb.fn
        .countAll<string>()
        .filterWhere(
          eb.and([
            eb('gt.winner', '=', true),
            eb.or([eb('opp.winner', '=', false), eb('opp.winner', 'is', null)]),
          ]),
        )
        .as('wins'),
      eb.fn
        .countAll<string>()
        .filterWhere(
          eb.and([
            eb('opp.winner', '=', true),
            eb.or([eb('gt.winner', '=', false), eb('gt.winner', 'is', null)]),
          ]),
        )
        .as('losses'),
      eb.fn
        .countAll<string>()
        .filterWhere(
          eb.and([
            eb('gt.winner', '=', false),
            eb('opp.winner', '=', false),
            eb('gt.points', '=', eb.ref('opp.points')),
          ]),
        )
        .as('ties'),
    ]);

const historyQuery = (db: Kysely<DB>, game: GamePreviewMetadata) =>
  db
    .selectFrom('game as g')
    .innerJoin('gameTeam as h', (j) =>
      j.onRef('h.gameId', '=', 'g.id').on('h.homeAway', '=', 'home'),
    )
    .innerJoin('gameTeam as a', (j) =>
      j.onRef('a.gameId', '=', 'g.id').on('a.homeAway', '=', 'away'),
    )
    .innerJoin('team as ht', 'ht.id', 'h.teamId')
    .innerJoin('team as at', 'at.id', 'a.teamId')
    .leftJoin('venue as v', 'v.id', 'g.venueId')
    .where('g.status', '=', 'completed')
    .where('g.id', '<>', game.id)
    .where((eb) =>
      eb(
        'g.startDate',
        '<',
        eb.cast<Date>(eb.val(utcBinding(game.startDate!)), 'timestamp'),
      ),
    )
    .select([
      'g.id as gameId',
      'g.season',
      'g.neutralSite',
      'ht.id as homeTeamId',
      'ht.school as homeTeam',
      'at.id as awayTeamId',
      'at.school as awayTeam',
      'h.points as homePoints',
      'a.points as awayPoints',
      'h.winner as homeWinner',
      'a.winner as awayWinner',
      'v.id as venueId',
      'v.name as venueName',
      'v.city as venueCity',
      'v.state as venueState',
    ])
    .select((eb) => eb.cast<string>('g.startDate', 'text').as('startDate'));
export const previewSeriesQuery = (db: Kysely<DB>, game: GamePreviewMetadata) =>
  historyQuery(db, game)
    .where('h.teamId', 'in', [game.homeTeam.id, game.awayTeam.id])
    .where('a.teamId', 'in', [game.homeTeam.id, game.awayTeam.id])
    .whereRef('h.teamId', '<>', 'a.teamId')
    .orderBy('g.startDate', 'desc')
    .orderBy('g.id', 'desc');
export const previewRecentQuery = (
  db: Kysely<DB>,
  game: GamePreviewMetadata,
) => {
  const recent = db
    .selectFrom('team as selected')
    .innerJoinLateral(
      (eb) =>
        eb
          .selectFrom('gameTeam as participant')
          .innerJoin('game as candidate', 'candidate.id', 'participant.gameId')
          .whereRef('participant.teamId', '=', 'selected.id')
          .where('candidate.season', '=', game.season)
          .where('candidate.status', '=', 'completed')
          .where('candidate.id', '<>', game.id)
          .where((eb) =>
            eb(
              'candidate.startDate',
              '<',
              eb.cast<Date>(eb.val(utcBinding(game.startDate!)), 'timestamp'),
            ),
          )
          .select('candidate.id as gameId')
          .orderBy('candidate.startDate', 'desc')
          .orderBy('candidate.id', 'desc')
          .limit(5)
          .as('latest'),
      (join) => join.onTrue(),
    )
    .where('selected.id', 'in', [game.homeTeam.id, game.awayTeam.id])
    .select(['selected.id as teamId', 'latest.gameId']);

  return historyQuery(db, game)
    .innerJoin(recent.as('recent'), 'recent.gameId', 'g.id')
    .select('recent.teamId')
    .orderBy('recent.teamId')
    .orderBy('g.startDate', 'desc')
    .orderBy('g.id', 'desc');
};
type HistoryRow = Awaited<
  ReturnType<ReturnType<typeof historyQuery>['execute']>
>[number];
const meeting = (r: HistoryRow): SeriesMeeting => {
  const result = outcome(
    r.homeWinner,
    r.awayWinner,
    r.homePoints,
    r.awayPoints,
  );
  const startDate = storedUtc(r.startDate);
  if (!startDate) throw new PreviewDataError();
  return {
    gameId: r.gameId,
    season: r.season,
    startDate,
    homeTeamId: r.homeTeamId,
    homeTeam: r.homeTeam,
    awayTeamId: r.awayTeamId,
    awayTeam: r.awayTeam,
    neutralSite: r.neutralSite,
    venue:
      r.venueId === null
        ? null
        : {
            id: r.venueId,
            name: r.venueName,
            city: r.venueCity,
            state: r.venueState,
          },
    homePoints: r.homePoints,
    awayPoints: r.awayPoints,
    winnerTeamId:
      result === 'win' ? r.homeTeamId : result === 'loss' ? r.awayTeamId : null,
    result: result === 'loss' ? 'win' : result,
  };
};
export const mapSeries = (
  game: GamePreviewMetadata,
  rows: HistoryRow[],
): SeriesHistory => {
  const meetings = rows.map(meeting);
  if (new Set(meetings.map((m) => m.gameId)).size !== meetings.length)
    throw new PreviewDataError();
  let streak: SeriesHistory['streak'] = null;
  const winner = meetings[0]?.winnerTeamId;
  if (winner) {
    let wins = 0;
    for (const m of meetings) {
      if (m.winnerTeamId !== winner) break;
      wins++;
    }
    streak = { teamId: winner, wins };
  }
  const homeWins = meetings.filter(
    (m) => m.winnerTeamId === game.homeTeam.id,
  ).length;
  const awayWins = meetings.filter(
    (m) => m.winnerTeamId === game.awayTeam.id,
  ).length;
  const ties = meetings.filter((m) => m.result === 'tie').length;
  return {
    homeTeamId: game.homeTeam.id,
    awayTeamId: game.awayTeam.id,
    meetings: meetings.length,
    knownResults: homeWins + awayWins + ties,
    unknownResults: meetings.length - homeWins - awayWins - ties,
    homeWins,
    awayWins,
    ties,
    firstSeason: meetings.length
      ? Math.min(...meetings.map((m) => m.season))
      : null,
    lastSeason: meetings.length
      ? Math.max(...meetings.map((m) => m.season))
      : null,
    latestMeeting: meetings[0] ?? null,
    streak,
    recentMeetings: meetings.slice(0, 5),
  };
};
export interface PreviewContextTeam {
  teamId: number;
  record: PreviewSection<TeamSeasonOverview['record']>;
  ratings: PreviewSection<TeamSeasonOverview['ratings']>;
  recentResults: PreviewSection<RecentResult[]>;
}
export const readPreviewContext = async (
  game: GamePreviewMetadata,
  deadline: number,
): Promise<PreviewContextTeam[]> => {
  const ids = [game.homeTeam.id, game.awayTeam.id];
  const [records, ratings] = await Promise.all([
    optionalRead(() =>
      previewRead(deadline, (db) =>
        previewRecordsQuery(db, game.season, ids).execute(),
      ),
    ),
    optionalRead(() =>
      previewRead(deadline, (db) =>
        previewRatingsQuery(db, game.season, ids).execute(),
      ),
    ),
  ]);
  const recent = await optionalRead(() =>
    previewRead(deadline, (db) => previewRecentQuery(db, game).execute()),
  );
  return ids.map((teamId) => {
    const record = records.data?.find((r) => r.teamId === teamId);
    const rating = ratings.data?.find((r) => r.teamId === teamId);
    const mapped = rating ? mapSeasonOverviewRatings(rating) : null;
    let recentResults: PreviewSection<RecentResult[]>;
    try {
      const data =
        recent.data
          ?.filter((r) => r.teamId === teamId)
          .map((r) => {
            const m = meeting(r);
            const home = r.homeTeamId === teamId;
            return {
              gameId: m.gameId,
              season: m.season,
              startDate: m.startDate,
              opponent: {
                id: home ? m.awayTeamId : m.homeTeamId,
                name: home ? m.awayTeam : m.homeTeam,
              },
              homeAway: home ? ('home' as const) : ('away' as const),
              neutralSite: m.neutralSite,
              venue: m.venue,
              teamPoints: home ? m.homePoints : m.awayPoints,
              opponentPoints: home ? m.awayPoints : m.homePoints,
              result: outcome(
                home ? r.homeWinner : r.awayWinner,
                home ? r.awayWinner : r.homeWinner,
                home ? r.homePoints : r.awayPoints,
                home ? r.awayPoints : r.homePoints,
              ),
            };
          }) ?? null;
      recentResults =
        data === null
          ? section(null, recent.reason)
          : section(data, data.length ? null : 'no_results_yet');
    } catch {
      recentResults = section(null, 'invalid_data');
    }
    return {
      teamId,
      record:
        records.data === null
          ? section(null, records.reason)
          : section({
              games: Number(record?.games ?? 0),
              wins: Number(record?.wins ?? 0),
              losses: Number(record?.losses ?? 0),
              ties: Number(record?.ties ?? 0),
            }),
      ratings:
        ratings.data === null
          ? section(null, ratings.reason)
          : section(
              mapped && Object.values(mapped).some((v) => v !== null)
                ? mapped
                : null,
              mapped && Object.values(mapped).some((v) => v !== null)
                ? null
                : 'no_data',
            ),
      recentResults,
    };
  });
};
export const readPreviewSeries = async (
  game: GamePreviewMetadata,
  deadline: number,
): Promise<PreviewSection<SeriesHistory>> => {
  const result = await optionalRead(() =>
    previewRead(deadline, async (db) =>
      mapSeries(game, await previewSeriesQuery(db, game).execute()),
    ),
  );
  return result.data && result.data.meetings === 0
    ? { ...result, status: 'no_data', reason: 'no_data' }
    : result;
};

import {
  AdjustedGamePreview,
  GamePreview,
  GamePreviewMetadata,
  FreePreviewTeam,
} from './previewTypes';
import {
  previewRead,
  PreviewDataError,
  PreviewNotFound,
  validatePreviewInteger,
  section,
  logPreviewResponse,
} from './previewRead';
import { previewCache } from './previewCache';
import {
  mapPreviewGames,
  previewGameQuery,
  previewIdentity,
  previewReason,
} from './previewGame';
import { readPreviewEnrichment } from './previewEnrichment';
import { readPreviewContext, readPreviewSeries } from './previewContext';
import {
  readPreviewSnapshots,
  projectPreviewPlayers,
} from './previewSnapshots';
import { readAdjustedPreview } from './previewAdjusted';
import {
  validGame,
  validEnrichment,
  validContext,
  validSeries,
  validSnapshot,
  snapshotIdentity,
  validAdjusted,
} from './previewValidation';

const loadGame = async (
  id: number,
  deadline: number,
  observe: (outcome: string) => void,
): Promise<GamePreviewMetadata> => {
  const core = await previewCache(
    `game:${id}`,
    10000,
    (v): v is import('./previewGame').PreviewCore =>
      validGame(v) &&
      v.game.id === id &&
      Date.now() - Date.parse(v.game.statusCheckedAt) < 10000 &&
      Date.parse(v.game.statusCheckedAt) <= Date.now(),
    async () => {
      const rows = await previewRead(deadline, (db) =>
        previewGameQuery(db).where('g.id', '=', id).execute(),
      );
      if (!rows.length) throw new PreviewNotFound();
      return mapPreviewGames(rows)[0];
    },
    deadline,
    observe,
  );
  // Redis reuse is additionally checked against the read timestamp at final return.
  return core.game;
};
const finalGame = async (
  game: GamePreviewMetadata,
  deadline: number,
  observe: (outcome: string) => void,
) => {
  if (Date.now() - Date.parse(game.statusCheckedAt) < 10000) return game;
  const current = await loadGame(game.id, deadline, observe);
  if (Date.now() - Date.parse(current.statusCheckedAt) >= 10000)
    throw new PreviewDataError('source_error');
  return current;
};
export const getGamePreview = async (gameId: number): Promise<GamePreview> => {
  validatePreviewInteger(gameId, 'gameId');
  const started = Date.now(),
    deadline = started + 8000;
  const cacheOutcomes: string[] = [];
  const observe = (outcome: string) => cacheOutcomes.push(outcome);
  const finish = (result: GamePreview): GamePreview => {
    logPreviewResponse(`free:${gameId}`, result, started, cacheOutcomes);
    return result;
  };
  const game = await loadGame(gameId, deadline, observe);
  const initialReason = previewReason(game);
  if (initialReason)
    return finish({
      assembledAt: new Date().toISOString(),
      game,
      availability: 'metadata_only',
      reason: initialReason,
      analysis: null,
    });
  const identity = previewIdentity(game);
  const enrichmentPromise = previewCache(
    `enrichment:${identity}:odds1`,
    60000,
    (v): v is Awaited<ReturnType<typeof readPreviewEnrichment>> =>
      validEnrichment(v) && v.length === 1 && v[0].id === gameId,
    () => readPreviewEnrichment([gameId], deadline),
    deadline,
    observe,
  ).catch(() => [
    {
      id: gameId,
      broadcasts: section<import('./previewTypes').PreviewBroadcast[]>(
        null,
        'source_error',
      ),
      odds: section<import('./previewTypes').SelectedOdds>(
        null,
        'source_error',
      ),
    },
  ]);
  let snapshotRead: ReturnType<typeof readPreviewSnapshots> | undefined;
  const snapshotsPromise = Promise.all(
    [game.homeTeam, game.awayTeam].map(async (team) => {
      try {
        return await previewCache(
          `team:${team.id}:${game.season}`,
          600000,
          (v): v is import('./previewSnapshots').PreviewSnapshotTeam =>
            validSnapshot(v) && snapshotIdentity(v, game, team.id),
          async () => {
            snapshotRead ??= readPreviewSnapshots(game, deadline);
            const result = (await snapshotRead).find(
              (r) => r.teamId === team.id,
            );
            if (!result) throw new PreviewDataError();
            return result;
          },
          deadline,
          observe,
        );
      } catch {
        return {
          teamId: team.id,
          season: game.season,
          statistics: section<import('./previewTypes').PreviewTeamStatistics>(
            null,
            'source_error',
          ),
          keyPlayers: projectPreviewPlayers(
            game.season,
            null,
            'source_error',
            null,
          ),
        };
      }
    }),
  );
  const contextPromise = previewCache(
    `context:${identity}`,
    300000,
    (v): v is Awaited<ReturnType<typeof readPreviewContext>> =>
      validContext(v) &&
      v.some((t) => t.teamId === game.homeTeam.id) &&
      v.some((t) => t.teamId === game.awayTeam.id) &&
      v.every((t) =>
        (t.recentResults.data ?? []).every(
          (r) =>
            r.season === game.season &&
            r.gameId !== game.id &&
            game.startDate !== null &&
            r.startDate < game.startDate,
        ),
      ),
    () => readPreviewContext(game, deadline),
    deadline,
    observe,
  ).catch(() =>
    [game.homeTeam, game.awayTeam].map((t) => ({
      teamId: t.id,
      record: section<
        import('../teams/seasonOverviewTypes').TeamSeasonOverview['record']
      >(null, 'source_error'),
      ratings: section<
        import('../teams/seasonOverviewTypes').TeamSeasonOverview['ratings']
      >(null, 'source_error'),
      recentResults: section<import('./previewTypes').RecentResult[]>(
        null,
        'source_error',
      ),
    })),
  );
  const seriesPromise = previewCache(
    `series:${identity}`,
    3600000,
    (v): v is Awaited<ReturnType<typeof readPreviewSeries>> =>
      validSeries(v) &&
      (!v.data ||
        (v.data.homeTeamId === game.homeTeam.id &&
          v.data.awayTeamId === game.awayTeam.id &&
          v.data.recentMeetings.every(
            (m) =>
              m.gameId !== game.id &&
              game.startDate !== null &&
              m.startDate < game.startDate &&
              [game.homeTeam.id, game.awayTeam.id].includes(m.homeTeamId) &&
              [game.homeTeam.id, game.awayTeam.id].includes(m.awayTeamId) &&
              m.homeTeamId !== m.awayTeamId,
          ))),
    () => readPreviewSeries(game, deadline),
    deadline,
    observe,
  ).catch(() =>
    section<import('./previewTypes').SeriesHistory>(null, 'source_error'),
  );
  // Independent cache reads overlap; cache refresh admission still bounds DB work.
  const [enrichment, snapshots, context, series] = await Promise.all([
    enrichmentPromise,
    snapshotsPromise,
    contextPromise,
    seriesPromise,
  ]);
  const current = await finalGame(game, deadline, observe),
    reason = previewReason(current);
  if (!reason && previewIdentity(current) !== identity)
    throw new PreviewDataError('source_error');
  const team = (id: number): FreePreviewTeam => {
    const snapshot = snapshots.find((t) => t.teamId === id),
      ctx = context.find((t) => t.teamId === id);
    if (!snapshot || !ctx) throw new PreviewDataError();
    return { ...snapshot, ...ctx };
  };

  return finish({
    assembledAt: new Date().toISOString(),
    game: current,
    availability: reason ? 'metadata_only' : 'pregame',
    reason,
    analysis: reason
      ? null
      : {
          broadcasts: enrichment[0].broadcasts,
          odds: enrichment[0].odds,
          home: team(game.homeTeam.id),
          away: team(game.awayTeam.id),
          series,
        },
  });
};
export const getAdjustedGamePreview = async (
  gameId: number,
): Promise<AdjustedGamePreview> => {
  validatePreviewInteger(gameId, 'gameId');
  const started = Date.now(),
    deadline = started + 8000;
  const cacheOutcomes: string[] = [];
  const observe = (outcome: string) => cacheOutcomes.push(outcome);
  const finish = (result: AdjustedGamePreview): AdjustedGamePreview => {
    logPreviewResponse(`adjusted:${gameId}`, result, started, cacheOutcomes);
    return result;
  };
  const game = await loadGame(gameId, deadline, observe),
    initialReason = previewReason(game);
  if (initialReason)
    return finish({
      assembledAt: new Date().toISOString(),
      game,
      availability: 'metadata_only',
      reason: initialReason,
      analysis: null,
    });
  const identity = previewIdentity(game);
  const analysis = await previewCache(
    `adjusted:${identity}`,
    900000,
    (v): v is import('./previewTypes').AdjustedPreviewAnalysis =>
      validAdjusted(v) &&
      v.home.teamId === game.homeTeam.id &&
      v.away.teamId === game.awayTeam.id &&
      [v.home, v.away].every(
        (t) =>
          t.season === game.season &&
          (!t.teamMetrics.data ||
            (t.teamMetrics.data.season ===
              (t.teamMetrics.data.isPreviousSeason
                ? game.season - 1
                : game.season) &&
              t.teamMetrics.data.metrics.year === t.teamMetrics.data.season &&
              t.teamMetrics.data.metrics.teamId === t.teamId)) &&
          [
            ...(t.passing.data ?? []),
            ...(t.rushing.data ?? []),
            ...(t.kicking.data ?? []),
          ].every(
            (p) =>
              p.year === game.season &&
              p.team ===
                (t.teamId === game.homeTeam.id
                  ? game.homeTeam.name
                  : game.awayTeam.name),
          ),
      ),
    () => readAdjustedPreview(game, deadline),
    deadline,
    observe,
  ).catch(() => {
    const empty = (
      teamId: number,
    ): import('./previewTypes').AdjustedPreviewTeam => ({
      teamId,
      season: game.season,
      teamMetrics: section(null, 'source_error'),
      passing: section(null, 'source_error'),
      rushing: section(null, 'source_error'),
      kicking: section(null, 'source_error'),
    });
    return { home: empty(game.homeTeam.id), away: empty(game.awayTeam.id) };
  });
  const current = await finalGame(game, deadline, observe),
    reason = previewReason(current);
  if (!reason && previewIdentity(current) !== identity)
    throw new PreviewDataError('source_error');

  return finish({
    assembledAt: new Date().toISOString(),
    game: current,
    availability: reason ? 'metadata_only' : 'pregame',
    reason,
    analysis: reason ? null : analysis,
  });
};

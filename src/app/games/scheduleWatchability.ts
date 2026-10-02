import { Kysely } from 'kysely';
import { DB } from '../../config/types/db';
import { GameStatus } from '../enums';
import { GamePreviewMetadata } from './previewTypes';
import { previewGameQuery } from './previewGame';

/**
 * The shared game query plus an optional stored score in the same statement.
 * `game_watchability` is joined by game, and `core_ratings` by (season, team)
 * for each participant. The two booleans say whether each participant's rating
 * is still from the CORE publication that produced the score.
 */
export const scheduleGameQuery = (db: Kysely<DB>) =>
  previewGameQuery(db)
    .leftJoin('gameWatchability as w', 'w.gameId', 'g.id')
    .leftJoin('coreRatings as hcr', (j) =>
      j.onRef('hcr.teamId', '=', 'h.teamId').onRef('hcr.year', '=', 'g.season'),
    )
    .leftJoin('coreRatings as acr', (j) =>
      j.onRef('acr.teamId', '=', 'a.teamId').onRef('acr.year', '=', 'g.season'),
    )
    .select([
      'w.gameId as watchGameId',
      'w.season as watchSeason',
      'w.week as watchWeek',
      'w.homeTeamId as watchHomeId',
      'w.awayTeamId as watchAwayId',
      'w.neutralSite as watchNeutralSite',
      'w.score as watchScore',
    ])
    .select((eb) => [
      eb('hcr.updatedAt', '=', eb.ref('w.sourceUpdatedAt')).as(
        'homeRatingCurrent',
      ),
      eb('acr.updatedAt', '=', eb.ref('w.sourceUpdatedAt')).as(
        'awayRatingCurrent',
      ),
    ]);

export type ScheduleGameRow = Awaited<
  ReturnType<ReturnType<typeof scheduleGameQuery>['execute']>
>[number];

/**
 * A game's stored score, or null when there is none or it is stale: the stored
 * season, week, participants, or site differ from the game, or a participant's
 * rating is from a different CORE publication.
 */
export const storedScore = (
  game: GamePreviewMetadata,
  row: ScheduleGameRow | undefined,
): number | null =>
  row &&
  row.watchGameId !== null &&
  row.watchSeason === game.season &&
  row.watchWeek === game.week &&
  row.watchHomeId === game.homeTeam.id &&
  row.watchAwayId === game.awayTeam.id &&
  row.watchNeutralSite === game.neutralSite &&
  (row.homeRatingCurrent as unknown) === true &&
  (row.awayRatingCurrent as unknown) === true
    ? row.watchScore
    : null;

/** A score is shown only before kickoff; the cached slate re-checks this on every response. */
export const currentWatchabilityScore = (
  score: number | null,
  game: GamePreviewMetadata,
  now: number,
): number | null =>
  score !== null &&
  game.status === GameStatus.Scheduled &&
  game.startDate !== null &&
  now < Date.parse(game.startDate)
    ? score
    : null;

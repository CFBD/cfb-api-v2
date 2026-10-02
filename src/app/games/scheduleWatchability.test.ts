import { testDatabase, gameRow } from './fixtures/game-previews/testing';
import { GameStatus } from '../enums';
import { mapPreviewGames } from './previewGame';
import {
  ScheduleGameRow,
  currentWatchabilityScore,
  scheduleGameQuery,
  storedScore,
} from './scheduleWatchability';

const row = (overrides: Partial<ScheduleGameRow> = {}): ScheduleGameRow => ({
  ...gameRow,
  id: 10,
  season: 2026,
  week: 5,
  startDate: '2026-10-03 23:00:00',
  watchGameId: 10,
  watchSeason: 2026,
  watchWeek: 5,
  watchHomeId: 130,
  watchAwayId: 194,
  watchNeutralSite: false,
  watchScore: 61.25,
  homeRatingCurrent: true,
  awayRatingCurrent: true,
  ...overrides,
});
const game = mapPreviewGames([row()])[0].game;

describe('storedScore', () => {
  it('returns the stored score unrounded, including zero', () => {
    expect(storedScore(game, row())).toBe(61.25);
    expect(storedScore(game, row({ watchScore: 0 }))).toBe(0);
  });
  it('is null without a row', () => {
    expect(storedScore(game, undefined)).toBeNull();
    expect(storedScore(game, row({ watchGameId: null }))).toBeNull();
  });
  it.each([
    ['season', { watchSeason: 2025 }],
    ['week', { watchWeek: 6 }],
    ['home team', { watchHomeId: 194 }],
    ['away team', { watchAwayId: 130 }],
    ['neutral site', { watchNeutralSite: true }],
    ['home rating publication', { homeRatingCurrent: false }],
    ['away rating publication', { awayRatingCurrent: false }],
    ['missing rating', { homeRatingCurrent: null }],
  ])('is null when the stored %s no longer matches', (_label, change) => {
    expect(
      storedScore(game, row(change as Partial<ScheduleGameRow>)),
    ).toBeNull();
  });
});

describe('currentWatchabilityScore', () => {
  const kickoff = Date.parse('2026-10-03T23:00:00.000Z');
  it('shows the score until kickoff, including zero', () => {
    expect(currentWatchabilityScore(7, game, kickoff - 1)).toBe(7);
    expect(currentWatchabilityScore(0, game, kickoff - 1)).toBe(0);
    expect(currentWatchabilityScore(7, game, kickoff)).toBeNull();
  });
  it('hides the score once status shows the game started', () => {
    for (const status of [GameStatus.InProgress, GameStatus.Completed])
      expect(
        currentWatchabilityScore(7, { ...game, status }, kickoff - 1),
      ).toBeNull();
  });
  it('is null for a missing score or kickoff', () => {
    expect(currentWatchabilityScore(null, game, 0)).toBeNull();
    expect(
      currentWatchabilityScore(7, { ...game, startDate: null }, 0),
    ).toBeNull();
  });
});

it('reads the score in the game statement by primary-key joins', async () => {
  const { db } = await testDatabase(() => []);
  const sql = scheduleGameQuery(db).compile().sql;
  expect(sql).toContain(
    'left join "game_watchability" as "w" on "w"."game_id" = "g"."id"',
  );
  expect(sql).toContain(
    '"hcr"."team_id" = "h"."team_id" and "hcr"."year" = "g"."season"',
  );
  expect(sql).toContain('"acr"."updated_at" = "w"."source_updated_at"');
  expect(sql.match(/\bfrom\b/g)).toHaveLength(1);
  for (const hidden of ['generated_at', 'quality', 'competitiveness'])
    expect(sql).not.toContain(`"w"."${hidden}"`);
});

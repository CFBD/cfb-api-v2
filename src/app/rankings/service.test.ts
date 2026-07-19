import { ValidateError } from 'tsoa';

import {
  getRankings,
  selectLatestRankingSnapshotId,
  validateRankingSelectors,
} from './service';
import { RankingPoll } from './types';

jest.mock('../../config/database', () => ({
  db: {},
  authDb: {},
  kdb: { selectFrom: jest.fn() },
}));

import { kdb } from '../../config/database';

const selectFrom = kdb.selectFrom as jest.Mock;

const createQueryBuilder = (rows: unknown[] = []) => {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['innerJoin', 'leftJoin', 'select', 'where']) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.execute = jest.fn().mockResolvedValue(rows);
  return builder;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('validateRankingSelectors', () => {
  test('rejects latest and final together', () => {
    expect(() => validateRankingSelectors(RankingPoll.Cfp, true, true)).toThrow(
      ValidateError,
    );
  });

  test('requires CFP poll for latest and final selectors', () => {
    expect(() => validateRankingSelectors(undefined, true, false)).toThrow(
      ValidateError,
    );
    expect(() => validateRankingSelectors(undefined, false, true)).toThrow(
      ValidateError,
    );
  });

  test('accepts CFP selectors independently', () => {
    expect(() =>
      validateRankingSelectors(RankingPoll.Cfp, true, false),
    ).not.toThrow();
    expect(() =>
      validateRankingSelectors(RankingPoll.Cfp, false, true),
    ).not.toThrow();
  });
});

describe('selectLatestRankingSnapshotId', () => {
  test('prefers the marked final snapshot over a later week', () => {
    expect(
      selectLatestRankingSnapshotId([
        { id: 1, week: 15, isFinal: true },
        { id: 2, week: 16, isFinal: false },
      ]),
    ).toBe(1);
  });

  test('uses greatest week and then greatest id without a final snapshot', () => {
    expect(
      selectLatestRankingSnapshotId([
        { id: 1, week: 14, isFinal: false },
        { id: 2, week: 15, isFinal: false },
        { id: 3, week: 15, isFinal: false },
      ]),
    ).toBe(3);
  });

  test('returns null when no snapshot matches the filters', () => {
    expect(selectLatestRankingSnapshotId([])).toBeNull();
  });
});

describe('getRankings CFP selectors', () => {
  test('final filters to the explicitly marked snapshot', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getRankings(2024, undefined, undefined, RankingPoll.Cfp, false, true);

    expect(builder.where.mock.calls).toContainEqual([
      'poll.isFinal',
      '=',
      true,
    ]);
    expect(builder.where.mock.calls).toContainEqual([
      'pollType.name',
      '=',
      'Playoff Committee Rankings',
    ]);
  });

  test('maps finality only for CFP polls', async () => {
    const builder = createQueryBuilder([
      {
        seasonType: 'regular',
        season: 2024,
        week: 15,
        pollId: 1,
        isFinal: true,
        poll: 'Playoff Committee Rankings',
        rank: 1,
        teamId: 1,
        school: 'Test State',
        conference: 'Test Conference',
        firstPlaceVotes: null,
        points: null,
      },
      {
        seasonType: 'regular',
        season: 2024,
        week: 15,
        pollId: 2,
        isFinal: false,
        poll: 'AP Top 25',
        rank: 1,
        teamId: 1,
        school: 'Test State',
        conference: 'Test Conference',
        firstPlaceVotes: 50,
        points: 1500,
      },
    ]);
    selectFrom.mockReturnValue(builder);

    const result = await getRankings(2024);

    expect(result[0].polls).toEqual([
      expect.objectContaining({
        poll: 'Playoff Committee Rankings',
        isFinal: true,
      }),
      expect.objectContaining({ poll: 'AP Top 25', isFinal: null }),
    ]);
  });
});

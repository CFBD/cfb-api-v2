jest.mock('../../config/database', () => ({
  db: {},
  authDb: {},
  kdb: { selectFrom: jest.fn() },
}));

import { kdb } from '../../config/database';
import { calculateWinPercentage, getCoaches, mapCoachRows } from './service';

const selectFrom = kdb.selectFrom as jest.Mock;

const createQueryBuilder = (rows: unknown[] = []) => {
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'innerJoin',
    'leftJoin',
    'select',
    'where',
    'orderBy',
  ]) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.execute = jest.fn().mockResolvedValue(rows);
  return builder;
};

const coachRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  firstName: 'Alex',
  lastName: 'Smith',
  teamId: 10,
  school: 'Test State',
  conference: 'Test Conference',
  year: 2025,
  games: 12,
  wins: 9,
  losses: 3,
  ties: 0,
  preseasonRank: 20,
  postseasonRank: 12,
  srs: '10.04',
  sp: '11.26',
  spOffense: '12.35',
  spDefense: '-1.25',
  hireDate: new Date('2024-12-01T00:00:00.000Z'),
  ...overrides,
});

describe('calculateWinPercentage', () => {
  test('includes ties and rounds to three decimal places', () => {
    expect(calculateWinPercentage(7, 1, 10)).toBe(0.75);
    expect(calculateWinPercentage(8, 0, 11)).toBe(0.727);
  });

  test('returns null for a zero-game season', () => {
    expect(calculateWinPercentage(0, 0, 0)).toBeNull();
  });
});

describe('mapCoachRows', () => {
  test('maps additive identity and context fields while preserving ratings', () => {
    expect(mapCoachRows([coachRow()])).toEqual([
      {
        id: 1,
        firstName: 'Alex',
        lastName: 'Smith',
        hireDate: new Date('2024-12-01T00:00:00.000Z'),
        seasons: [
          {
            teamId: 10,
            school: 'Test State',
            conference: 'Test Conference',
            year: 2025,
            games: 12,
            wins: 9,
            losses: 3,
            ties: 0,
            winPercentage: 0.75,
            preseasonRank: 20,
            postseasonRank: 12,
            srs: 10,
            spOverall: 11.3,
            spOffense: 12.4,
            spDefense: -1.2,
          },
        ],
      },
    ]);
  });

  test('keeps coaches with duplicate names separate by ID', () => {
    const result = mapCoachRows([
      coachRow({ id: 1, teamId: 10 }),
      coachRow({ id: 2, teamId: 20, school: 'Other State' }),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((coach) => coach.id)).toEqual([1, 2]);
  });

  test('keeps zero ratings and maps zero games without fabricated values', () => {
    const result = mapCoachRows([
      coachRow({
        games: 0,
        wins: 0,
        losses: 0,
        srs: '0',
        sp: '0',
        spOffense: null,
        spDefense: null,
      }),
    ]);

    expect(result[0].seasons[0]).toEqual(
      expect.objectContaining({
        winPercentage: null,
        srs: 0,
        spOverall: 0,
        spOffense: null,
        spDefense: null,
      }),
    );
  });
});

describe('getCoaches', () => {
  test('intersects existing filters and preserves deterministic ordering', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getCoaches('Alex', 'Smith', 'Test State', 2025, 2020, 2026);

    expect(builder.where).toHaveBeenCalledTimes(6);
    const expressionBuilder = jest.fn() as jest.Mock & { fn: jest.Mock };
    expressionBuilder.fn = jest.fn().mockReturnValue('lowered-column');
    for (const call of builder.where.mock.calls.slice(0, 3)) {
      const filter = call[0] as (eb: typeof expressionBuilder) => unknown;
      filter(expressionBuilder);
    }
    expect(expressionBuilder.fn.mock.calls).toEqual([
      ['lower', ['coach.firstName']],
      ['lower', ['coach.lastName']],
      ['lower', ['team.school']],
    ]);
    expect(expressionBuilder.mock.calls).toEqual([
      ['lowered-column', '=', 'alex'],
      ['lowered-column', '=', 'smith'],
      ['lowered-column', '=', 'test state'],
    ]);
    expect(builder.where.mock.calls).toContainEqual([
      'coachSeason.year',
      '=',
      2025,
    ]);
    expect(builder.where.mock.calls).toContainEqual([
      'coachSeason.year',
      '>=',
      2020,
    ]);
    expect(builder.where.mock.calls).toContainEqual([
      'coachSeason.year',
      '<=',
      2026,
    ]);
    expect(builder.orderBy.mock.calls).toEqual([
      ['coach.lastName'],
      ['coach.firstName'],
      ['coach.id'],
      ['coachSeason.year'],
      ['team.id'],
    ]);
  });

  test('returns an empty array when no rows match', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await expect(getCoaches(undefined, 'Nobody')).resolves.toEqual([]);
  });
});

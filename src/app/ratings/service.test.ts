import { ValidateError } from 'tsoa';

import { kdb } from '../../config/database';
import { getCore } from './service';

jest.mock('../../config/database', () => ({
  db: {},
  authDb: {},
  kdb: { selectFrom: jest.fn() },
}));

const selectFrom = kdb.selectFrom as jest.Mock;

const createQueryBuilder = (rows: unknown[] = []) => {
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'innerJoin',
    'leftJoin',
    'orderBy',
    'select',
    'where',
  ]) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.execute = jest.fn().mockResolvedValue(rows);
  return builder;
};

const createExpressionBuilder = () => {
  const expressionBuilder = jest.fn((...args: unknown[]) => ({
    args,
  })) as jest.Mock & {
    fn: jest.Mock;
    or: jest.Mock;
    ref: jest.Mock;
  };
  expressionBuilder.fn = jest.fn((name, args) => ({ args, name }));
  expressionBuilder.or = jest.fn((expressions) => ({ expressions }));
  expressionBuilder.ref = jest.fn((reference) => ({ reference }));
  return expressionBuilder;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getCore', () => {
  test('requires a year or team selector', async () => {
    await expect(getCore()).rejects.toMatchObject({
      fields: {
        year: {
          value: undefined,
          message: 'year required when team not specified',
        },
        team: {
          value: undefined,
          message: 'team required when year not specified',
        },
      },
      message: 'Validation error',
      status: 400,
    });
    await expect(getCore()).rejects.toBeInstanceOf(ValidateError);
    expect(selectFrom).not.toHaveBeenCalled();
  });

  test('uses the CORE table, explicit joins, fields, and ordering', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getCore(2025);

    expect(selectFrom).toHaveBeenCalledWith('coreRatings');
    expect(builder.innerJoin).toHaveBeenCalledWith(
      'team',
      'coreRatings.teamId',
      'team.id',
    );
    expect(builder.leftJoin).toHaveBeenCalledWith(
      'conference',
      'conferenceTeam.conferenceId',
      'conference.id',
    );
    expect(builder.select).toHaveBeenCalledWith([
      'coreRatings.year',
      'coreRatings.throughSeasonType',
      'coreRatings.throughWeek',
      'team.school as team',
      'conference.name as conference',
      'coreRatings.overall',
      'coreRatings.offense',
      'coreRatings.defense',
      'coreRatings.offensePlays',
      'coreRatings.defensePlays',
      'coreRatings.modelVersion',
    ]);
    expect(builder.orderBy.mock.calls).toEqual([
      ['coreRatings.year', 'desc'],
      ['coreRatings.overall', 'desc'],
      ['team.school', 'asc'],
    ]);
    expect(builder.where).toHaveBeenCalledWith('coreRatings.year', '=', 2025);

    const joinedTables = [
      ...builder.innerJoin.mock.calls,
      ...builder.leftJoin.mock.calls,
    ].map(([table]) => table);
    expect(joinedTables).not.toContain('teamInfo');
    expect(joinedTables).not.toContain('venue');
  });

  test('season-bounds the left conference membership join', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getCore(2025);

    const membershipJoin = builder.leftJoin.mock.calls.find(
      ([table]) => table === 'conferenceTeam',
    );
    expect(membershipJoin).toBeDefined();

    const join = {
      onRef: jest.fn(),
      on: jest.fn(),
    };
    join.onRef.mockReturnValue(join);
    join.on.mockReturnValue(join);
    membershipJoin?.[1](join);

    expect(join.onRef.mock.calls).toEqual([
      ['team.id', '=', 'conferenceTeam.teamId'],
      ['conferenceTeam.startYear', '<=', 'coreRatings.year'],
    ]);

    const expressionBuilder = createExpressionBuilder();
    join.on.mock.calls[0][0](expressionBuilder);
    expect(expressionBuilder.ref).toHaveBeenCalledWith('coreRatings.year');
    expect(expressionBuilder).toHaveBeenCalledWith(
      'conferenceTeam.endYear',
      '>=',
      { reference: 'coreRatings.year' },
    );
    expect(expressionBuilder).toHaveBeenCalledWith(
      'conferenceTeam.endYear',
      'is',
      null,
    );
    expect(expressionBuilder.or).toHaveBeenCalledTimes(1);
  });

  test('matches an exact team name case-insensitively', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getCore(undefined, 'Test State');

    const teamFilter = builder.where.mock.calls.find(
      ([argument]) => typeof argument === 'function',
    );
    const expressionBuilder = createExpressionBuilder();
    teamFilter?.[0](expressionBuilder);

    expect(expressionBuilder.fn).toHaveBeenCalledWith('lower', ['team.school']);
    expect(expressionBuilder).toHaveBeenCalledWith(
      { args: ['team.school'], name: 'lower' },
      '=',
      'test state',
    );
  });

  test('matches conference name or abbreviation case-insensitively', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getCore(2025, 'Test State', 'SEC');

    const functionFilters = builder.where.mock.calls.filter(
      ([argument]) => typeof argument === 'function',
    );
    expect(functionFilters).toHaveLength(2);

    const expressionBuilder = createExpressionBuilder();
    functionFilters[1][0](expressionBuilder);

    expect(expressionBuilder.fn.mock.calls).toEqual([
      ['lower', ['conference.name']],
      ['lower', ['conference.abbreviation']],
    ]);
    expect(expressionBuilder).toHaveBeenCalledWith(
      { args: ['conference.name'], name: 'lower' },
      '=',
      'sec',
    );
    expect(expressionBuilder).toHaveBeenCalledWith(
      { args: ['conference.abbreviation'], name: 'lower' },
      '=',
      'sec',
    );
    expect(expressionBuilder.or).toHaveBeenCalledTimes(1);
  });

  test('maps stored precision, Week 0 zeroes, and nullable conferences', async () => {
    const builder = createQueryBuilder([
      {
        year: 2026,
        throughSeasonType: 'regular',
        throughWeek: 0,
        team: 'Independent State',
        conference: null,
        overall: '0',
        offense: '10.123456789',
        defense: '10.123456789',
        offensePlays: '0',
        defensePlays: '0',
        modelVersion: 'core-preseason-v1',
      },
    ]);
    selectFrom.mockReturnValue(builder);

    await expect(getCore(2026)).resolves.toEqual([
      {
        year: 2026,
        throughSeasonType: 'regular',
        throughWeek: 0,
        team: 'Independent State',
        conference: null,
        overall: 0,
        offense: 10.12,
        defense: 10.12,
        offensePlays: 0,
        defensePlays: 0,
        modelVersion: 'core-preseason-v1',
      },
    ]);
  });

  test('returns an empty array when no rating matches', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await expect(getCore(undefined, 'Unknown State')).resolves.toEqual([]);
  });
});

jest.mock('../../config/database', () => ({
  db: {},
  authDb: {},
  kdb: { selectFrom: jest.fn() },
}));

import { ValidateError } from 'tsoa';

import { kdb } from '../../config/database';
import {
  calculateWinPercentage,
  getCoaches,
  getCoachProfile,
  getCoachSeasons,
  getCoachTenures,
  mapDetailedCoachSeasons,
  mapCoachProfile,
  mapCoachRows,
  mapCoachTenures,
  selectApPollType,
  validateCoachProfileSelector,
  validateCoachSeasonSelectors,
  validateCoachTenureSelectors,
} from './service';

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

describe('coach profile', () => {
  const identity = {
    id: 1,
    firstName: 'Alex',
    lastName: 'Smith',
    displayName: 'Coach Alex Smith',
    birthDate: new Date('1970-01-02T00:00:00.000Z'),
    almaMaterTeamId: 20,
    almaMaterSchool: 'Alma State',
    graduationYear: 1992,
    wikidataId: 'Q123',
    hallOfFameYear: null,
  };
  const career = {
    seasons: '3',
    teams: '2',
    firstYear: 2022,
    lastYear: 2024,
    games: '30',
    wins: '20',
    losses: '9',
    ties: '1',
  };

  test('requires a positive integer coach ID', () => {
    for (const coachId of [0, -1, 1.5, undefined]) {
      expect(() => validateCoachProfileSelector(coachId as number)).toThrow(
        ValidateError,
      );
    }
  });

  test('maps career totals, profile fields, and one current team', () => {
    expect(
      mapCoachProfile(identity, career, [
        { id: 10, school: 'Test State', conference: 'Test Conference' },
      ]),
    ).toEqual({
      id: 1,
      firstName: 'Alex',
      lastName: 'Smith',
      displayName: 'Coach Alex Smith',
      currentTeam: {
        id: 10,
        school: 'Test State',
        conference: 'Test Conference',
      },
      career: {
        seasons: 3,
        teams: 2,
        firstYear: 2022,
        lastYear: 2024,
        games: 30,
        wins: 20,
        losses: 9,
        ties: 1,
        winPercentage: 0.683,
      },
      birthDate: '1970-01-02',
      almaMater: { id: 20, school: 'Alma State' },
      graduationYear: 1992,
      wikidataId: 'Q123',
      hallOfFameYear: null,
    });
  });

  test('maps zero or multiple open stints to no current team', () => {
    expect(mapCoachProfile(identity, career, []).currentTeam).toBeNull();
    expect(
      mapCoachProfile(identity, career, [
        { id: 10, school: 'Test State', conference: null },
        { id: 11, school: 'Other State', conference: null },
      ]).currentTeam,
    ).toBeNull();
  });

  test('returns null for an unknown coach without issuing aggregate queries', async () => {
    const builder = createQueryBuilder();
    builder.executeTakeFirst = jest.fn().mockResolvedValue(undefined);
    selectFrom.mockReturnValue(builder);

    await expect(getCoachProfile(999)).resolves.toBeNull();
    expect(selectFrom).toHaveBeenCalledTimes(1);
  });
});

describe('coach tenure validation', () => {
  test('requires a coach or team selector', () => {
    expect(() => validateCoachTenureSelectors()).toThrow(ValidateError);
  });

  test('rejects invalid selectors', () => {
    expect(() => validateCoachTenureSelectors(0)).toThrow(ValidateError);
    expect(() => validateCoachTenureSelectors(undefined, '')).toThrow(
      ValidateError,
    );
    expect(() => validateCoachTenureSelectors(1, undefined, 2024.5)).toThrow(
      ValidateError,
    );
  });

  test('accepts intersecting positive selectors', () => {
    expect(() =>
      validateCoachTenureSelectors(1, 'Test State', 2024),
    ).not.toThrow();
  });

  test('returns an empty array without batch queries when no tenures match', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await expect(getCoachTenures(999)).resolves.toEqual([]);
    expect(selectFrom).toHaveBeenCalledTimes(1);
  });

  test('intersects coach, team, year, and inactive filters', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getCoachTenures(1, 'Test State', 2024, false);

    expect(builder.where.mock.calls).toEqual(
      expect.arrayContaining([
        ['coachTeam.coachId', '=', 1],
        ['coachTeam.startYear', '<=', 2024],
      ]),
    );
    const functionFilters = builder.where.mock.calls.filter(
      ([argument]) => typeof argument === 'function',
    );
    expect(functionFilters).toHaveLength(3);
    const expressionBuilder = jest.fn() as jest.Mock & { fn: jest.Mock };
    expressionBuilder.fn = jest.fn().mockReturnValue('lowered-column');
    functionFilters[0][0](expressionBuilder);
    expect(expressionBuilder.fn).toHaveBeenCalledWith('lower', ['team.school']);
    expect(expressionBuilder).toHaveBeenCalledWith(
      'lowered-column',
      '=',
      'test state',
    );
  });

  test('uses one matching query and three batch queries', async () => {
    const tenureBuilder = createQueryBuilder([
      {
        id: 100,
        coachId: 1,
        firstName: 'Alex',
        lastName: 'Smith',
        teamId: 10,
        school: 'Test State',
        hireDate: null,
        startYear: 2024,
        endYear: null,
        startDate: null,
        endDate: null,
        isInterim: false,
      },
    ]);
    const seasonBuilder = createQueryBuilder();
    const intervalBuilder = createQueryBuilder();
    const gameBuilder = createQueryBuilder();
    selectFrom
      .mockReturnValueOnce(tenureBuilder)
      .mockReturnValueOnce(seasonBuilder)
      .mockReturnValueOnce(intervalBuilder)
      .mockReturnValueOnce(gameBuilder);

    const result = await getCoachTenures(1);

    expect(selectFrom.mock.calls.map(([table]) => table)).toEqual([
      'coachTeam',
      'coachSeason',
      'coachTeam',
      'game',
    ]);
    expect(result).toEqual([
      expect.objectContaining({
        id: 100,
        active: true,
        seasons: 0,
        record: {
          games: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          winPercentage: null,
        },
      }),
    ]);
  });
});

describe('mapCoachTenures', () => {
  const tenure = (
    overrides: Record<string, unknown> = {},
  ): Parameters<typeof mapCoachTenures>[0][number] => ({
    id: 100,
    coachId: 1,
    firstName: 'Alex',
    lastName: 'Smith',
    teamId: 10,
    school: 'Test State',
    hireDate: '2023-12-01',
    startYear: 2024,
    endYear: 2024,
    startDate: null,
    endDate: null,
    isInterim: false,
    ...overrides,
  });
  const season = (
    overrides: Record<string, unknown> = {},
  ): Parameters<typeof mapCoachTenures>[1][number] => ({
    coachId: 1,
    teamId: 10,
    year: 2024,
    games: 2,
    wins: 1,
    losses: 1,
    ties: 0,
    ...overrides,
  });
  const interval = (
    overrides: Record<string, unknown> = {},
  ): Parameters<typeof mapCoachTenures>[2][number] => ({
    id: 100,
    coachId: 1,
    teamId: 10,
    startYear: 2024,
    endYear: 2024,
    startDate: null,
    endDate: null,
    ...overrides,
  });
  const game = (
    overrides: Record<string, unknown> = {},
  ): Parameters<typeof mapCoachTenures>[3][number] => ({
    id: 1000,
    season: 2024,
    startDate: new Date('2024-09-01T16:00:00.000Z'),
    teamId: 10,
    points: 24,
    opponentPoints: 17,
    ...overrides,
  });

  test('uses authoritative coach-season records for a single-coach year', () => {
    expect(
      mapCoachTenures([tenure()], [season()], [interval()], [])[0],
    ).toEqual(
      expect.objectContaining({
        active: false,
        seasons: 1,
        attributionComplete: true,
        record: {
          games: 2,
          wins: 1,
          losses: 1,
          ties: 0,
          winPercentage: 0.5,
        },
      }),
    );
  });

  test('attributes a split year to exact non-overlapping stints', () => {
    const handoff = new Date('2024-10-01T00:00:00.000Z');
    const tenures = [
      tenure({ endDate: handoff }),
      tenure({
        id: 200,
        coachId: 2,
        firstName: 'Blake',
        startDate: handoff,
      }),
    ];
    const seasons = [
      season({ games: 1, wins: 1, losses: 0 }),
      season({ coachId: 2, games: 1, wins: 0, losses: 1 }),
    ];
    const intervals = [
      interval({ endDate: handoff }),
      interval({ id: 200, coachId: 2, startDate: handoff }),
    ];
    const games = [
      game(),
      game({
        id: 1001,
        startDate: new Date('2024-10-15T00:00:00.000Z'),
        points: 10,
        opponentPoints: 20,
      }),
    ];

    const result = mapCoachTenures(tenures, seasons, intervals, games);

    expect(result.map((row) => row.record)).toEqual([
      {
        games: 1,
        wins: 1,
        losses: 0,
        ties: 0,
        winPercentage: 1,
      },
      {
        games: 1,
        wins: 0,
        losses: 1,
        ties: 0,
        winPercentage: 0,
      },
    ]);
    expect(result.every((row) => row.attributionComplete)).toBe(true);
  });

  test('marks unresolved split years incomplete while retaining each coach record', () => {
    const tenures = [
      tenure(),
      tenure({ id: 200, coachId: 2, firstName: 'Blake' }),
    ];
    const seasons = [
      season({ games: 1, wins: 1, losses: 0 }),
      season({ coachId: 2, games: 1, wins: 0, losses: 1 }),
    ];
    const intervals = [interval(), interval({ id: 200, coachId: 2 })];

    const result = mapCoachTenures(tenures, seasons, intervals, []);

    expect(result.map((row) => row.record.games)).toEqual([1, 1]);
    expect(result.every((row) => !row.attributionComplete)).toBe(true);
  });

  test('divides a same-season return by stint without double-counting', () => {
    const firstEnd = new Date('2024-09-15T00:00:00.000Z');
    const returnStart = new Date('2024-10-15T00:00:00.000Z');
    const tenures = [
      tenure({ endDate: firstEnd }),
      tenure({ id: 200, startDate: returnStart }),
    ];
    const intervals = [
      interval({ endDate: firstEnd }),
      interval({ id: 200, startDate: returnStart }),
    ];
    const games = [
      game(),
      game({
        id: 1001,
        startDate: new Date('2024-11-01T00:00:00.000Z'),
        points: 10,
        opponentPoints: 20,
      }),
    ];

    const result = mapCoachTenures(tenures, [season()], intervals, games);

    expect(result.map((row) => row.record.games)).toEqual([1, 1]);
    expect(result.reduce((total, row) => total + row.record.games, 0)).toBe(2);
    expect(result.every((row) => row.attributionComplete)).toBe(true);
  });
});

describe('detailed coach seasons', () => {
  const baseRow = (overrides: Record<string, unknown> = {}) => ({
    coachId: 1,
    firstName: 'Alex',
    lastName: 'Smith',
    teamId: 10,
    school: 'Test State',
    conference: 'Test Conference',
    year: 2024,
    games: 2,
    wins: 1,
    losses: 1,
    ties: 0,
    preseasonRank: 20,
    postseasonRank: 8,
    srs: '10.04',
    spOverall: '11.26',
    spOffense: '12.35',
    spDefense: '-1.25',
    spSpecialTeams: '2.24',
    strengthOfSchedule: '4.75',
    secondOrderWins: '9.50',
    fpi: '13.2',
    recruitingRank: 12,
    recruitingPoints: '245.6',
    ...overrides,
  });
  const context = (
    overrides: Record<string, unknown> = {},
  ): Parameters<typeof mapDetailedCoachSeasons>[1] => ({
    teamMetrics: [
      { teamId: 10, year: 2023, srs: '8.0', spOverall: '10.0' },
      { teamId: 10, year: 2024, srs: '10.04', spOverall: '11.26' },
    ],
    teamWins: [
      { teamId: 10, year: 2023, wins: '8' },
      { teamId: 10, year: 2024, wins: '1' },
    ],
    talents: [{ teamId: 10, year: 2024, talent: '900.5' }],
    polls: [
      {
        pollId: 1,
        year: 2024,
        seasonType: 'regular',
        week: 1,
        teamId: 10,
        rank: 8,
      },
      {
        pollId: 2,
        year: 2024,
        seasonType: 'regular',
        week: 2,
        teamId: 10,
        rank: 5,
      },
    ],
    draftCoverage: { minYear: 2020, maxYear: 2025 },
    draftPicks: [
      { teamId: 10, year: 2025, round: 1 },
      { teamId: 10, year: 2025, round: 3 },
    ],
    cfpParticipants: [{ teamId: 10, year: 2024, seed: 4 }],
    cfpGames: [
      {
        teamId: 10,
        year: 2024,
        roundCode: 'championship',
        winner: true,
        status: 'completed',
      },
    ],
    attributionSeasons: [
      {
        coachId: 1,
        teamId: 10,
        year: 2024,
        games: 2,
        wins: 1,
        losses: 1,
        ties: 0,
      },
    ],
    intervals: [
      {
        id: 100,
        coachId: 1,
        teamId: 10,
        startYear: 2024,
        endYear: 2024,
        startDate: null,
        endDate: null,
      },
    ],
    games: [
      {
        id: 1,
        season: 2024,
        startDate: new Date('2024-09-01T16:00:00.000Z'),
        teamId: 10,
        points: 24,
        opponentPoints: 17,
        conferenceGame: true,
        seasonType: 'regular',
        neutralSite: false,
        homeAway: 'home',
      },
      {
        id: 2,
        season: 2024,
        startDate: new Date('2024-12-20T16:00:00.000Z'),
        teamId: 10,
        points: 10,
        opponentPoints: 20,
        conferenceGame: false,
        seasonType: 'postseason',
        neutralSite: true,
        homeAway: 'away',
      },
    ],
    ...overrides,
  });

  test('validates required, intersecting, and range selectors', () => {
    expect(() => validateCoachSeasonSelectors()).toThrow(ValidateError);
    expect(() =>
      validateCoachSeasonSelectors(1, 'Test State', undefined, 2020, 2024),
    ).not.toThrow();
    expect(() =>
      validateCoachSeasonSelectors(1, undefined, 2024, 2020),
    ).toThrow(ValidateError);
    expect(() =>
      validateCoachSeasonSelectors(
        undefined,
        'Test State',
        undefined,
        2025,
        2024,
      ),
    ).toThrow(ValidateError);
    expect(() => validateCoachSeasonSelectors(0)).toThrow(ValidateError);
    expect(() => validateCoachSeasonSelectors(undefined, '   ')).toThrow(
      ValidateError,
    );
  });

  test('returns no rows without issuing context queries', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await expect(getCoachSeasons(999)).resolves.toEqual([]);
    expect(selectFrom).toHaveBeenCalledTimes(1);
  });

  test('matches a team selector case-insensitively', async () => {
    const builder = createQueryBuilder();
    selectFrom.mockReturnValue(builder);

    await getCoachSeasons(undefined, 'Test State', 2024);

    const teamFilter = builder.where.mock.calls.find(
      ([argument]) => typeof argument === 'function',
    )?.[0];
    const expressionBuilder = jest.fn() as jest.Mock & { fn: jest.Mock };
    expressionBuilder.fn = jest.fn().mockReturnValue('lowered-column');
    teamFilter(expressionBuilder);

    expect(expressionBuilder.fn).toHaveBeenCalledWith('lower', ['team.school']);
    expect(expressionBuilder).toHaveBeenCalledWith(
      'lowered-column',
      '=',
      'test state',
    );
  });

  test('resolves the AP poll type semantically and rejects ambiguity', () => {
    expect(
      selectApPollType([
        { id: 1, name: 'AP Top 25', shortName: 'Associated Press' },
      ]),
    ).toBe(1);
    expect(() =>
      selectApPollType([
        { id: 1, name: 'AP Top 25', shortName: 'AP' },
        { id: 2, name: 'Other', shortName: 'AP Poll' },
      ]),
    ).toThrow(/Expected one/);
  });

  test('maps bounded team context and reconciled coach attribution', () => {
    expect(mapDetailedCoachSeasons([baseRow()], context())).toEqual([
      {
        coach: { id: 1, firstName: 'Alex', lastName: 'Smith' },
        team: {
          id: 10,
          school: 'Test State',
          conference: 'Test Conference',
        },
        year: 2024,
        games: 2,
        wins: 1,
        losses: 1,
        ties: 0,
        winPercentage: 0.5,
        preseasonRank: 20,
        postseasonRank: 8,
        srs: 10,
        spOverall: 11.3,
        spOffense: 12.4,
        spDefense: -1.2,
        teamMetrics: {
          spSpecialTeams: 2.2,
          strengthOfSchedule: 4.75,
          secondOrderWins: 9.5,
          fpi: 13.2,
          yearOverYear: { wins: -7, srs: 2, spOverall: 1.3 },
        },
        recruiting: { rank: 12, points: 245.6, talent: 900.5 },
        pollResume: {
          preseasonRank: 20,
          postseasonRank: 8,
          bestRank: 5,
          weeksRanked: 2,
          weeksTopTen: 2,
        },
        attributionComplete: true,
        recordSplits: {
          conference: {
            games: 1,
            wins: 1,
            losses: 0,
            ties: 0,
            winPercentage: 1,
          },
          postseason: {
            games: 1,
            wins: 0,
            losses: 1,
            ties: 0,
            winPercentage: 0,
          },
          home: {
            games: 1,
            wins: 1,
            losses: 0,
            ties: 0,
            winPercentage: 1,
          },
          away: {
            games: 0,
            wins: 0,
            losses: 0,
            ties: 0,
            winPercentage: null,
          },
          neutral: {
            games: 1,
            wins: 0,
            losses: 1,
            ties: 0,
            winPercentage: 0,
          },
        },
        scoring: {
          pointsFor: 34,
          pointsAgainst: 37,
          averagePointDifferential: -1.5,
        },
        cfp: { appeared: true, seed: 4, outcome: 'champion' },
        draftFollowingSeason: {
          year: 2025,
          totalPicks: 2,
          firstRoundPicks: 1,
        },
      },
    ]);
  });

  test('nulls attribution fields for an unresolved split season', () => {
    const result = mapDetailedCoachSeasons(
      [baseRow({ games: 1, wins: 1, losses: 0 })],
      context({
        attributionSeasons: [
          {
            coachId: 1,
            teamId: 10,
            year: 2024,
            games: 1,
            wins: 1,
            losses: 0,
            ties: 0,
          },
          {
            coachId: 2,
            teamId: 10,
            year: 2024,
            games: 1,
            wins: 0,
            losses: 1,
            ties: 0,
          },
        ],
        intervals: [],
      }),
    )[0];

    expect(result.attributionComplete).toBe(false);
    expect(result.recordSplits).toBeNull();
    expect(result.scoring).toBeNull();
  });

  test('attributes an exact split season without sharing coach results', () => {
    const handoff = new Date('2024-10-01T00:00:00.000Z');
    const result = mapDetailedCoachSeasons(
      [baseRow({ games: 1, wins: 1, losses: 0 })],
      context({
        attributionSeasons: [
          {
            coachId: 1,
            teamId: 10,
            year: 2024,
            games: 1,
            wins: 1,
            losses: 0,
            ties: 0,
          },
          {
            coachId: 2,
            teamId: 10,
            year: 2024,
            games: 1,
            wins: 0,
            losses: 1,
            ties: 0,
          },
        ],
        intervals: [
          {
            id: 100,
            coachId: 1,
            teamId: 10,
            startYear: 2024,
            endYear: 2024,
            startDate: null,
            endDate: handoff,
          },
          {
            id: 200,
            coachId: 2,
            teamId: 10,
            startYear: 2024,
            endYear: 2024,
            startDate: handoff,
            endDate: null,
          },
        ],
      }),
    )[0];

    expect(result.attributionComplete).toBe(true);
    expect(result.scoring).toEqual({
      pointsFor: 24,
      pointsAgainst: 17,
      averagePointDifferential: 7,
    });
  });

  test('distinguishes no poll coverage from an unranked team', () => {
    expect(
      mapDetailedCoachSeasons([baseRow()], context({ polls: [] }))[0]
        .pollResume,
    ).toBeNull();
    expect(
      mapDetailedCoachSeasons(
        [baseRow()],
        context({
          polls: [
            {
              pollId: 1,
              year: 2024,
              seasonType: 'regular',
              week: 1,
              teamId: null,
              rank: null,
            },
          ],
        }),
      )[0].pollResume,
    ).toEqual({
      preseasonRank: 20,
      postseasonRank: 8,
      bestRank: null,
      weeksRanked: 0,
      weeksTopTen: 0,
    });
  });

  test('collapses identical duplicates and nulls conflicting team values', () => {
    const result = mapDetailedCoachSeasons(
      [
        baseRow(),
        baseRow({
          conference: 'Other Conference',
          srs: '12.0',
          recruitingPoints: '245.6',
        }),
      ],
      context({
        talents: [
          { teamId: 10, year: 2024, talent: '900.5' },
          { teamId: 10, year: 2024, talent: '901.5' },
        ],
      }),
    )[0];

    expect(result.team.conference).toBeNull();
    expect(result.srs).toBeNull();
    expect(result.recruiting.points).toBe(245.6);
    expect(result.recruiting.talent).toBeNull();
  });

  test('returns zero picks only inside known draft coverage', () => {
    expect(
      mapDetailedCoachSeasons([baseRow()], context({ draftPicks: [] }))[0]
        .draftFollowingSeason,
    ).toEqual({ year: 2025, totalPicks: 0, firstRoundPicks: 0 });
    expect(
      mapDetailedCoachSeasons(
        [baseRow()],
        context({
          draftCoverage: { minYear: 2020, maxYear: 2024 },
          draftPicks: [],
        }),
      )[0].draftFollowingSeason,
    ).toBeNull();
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

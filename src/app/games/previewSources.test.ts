import { testDatabase, game, gameRow } from './fixtures/game-previews/testing';
import * as reads from './previewRead';
import { readPreviewEnrichment } from './previewEnrichment';
import {
  mapPreviewGames,
  previewReason,
  previewGameQuery,
} from './previewGame';
import {
  readPreviewSnapshots,
  projectPreviewPlayers,
} from './previewSnapshots';
import { isTeamSeasonSnapshotPayload } from '../teams/seasonOverviewPayload';
import { formatSeasonAdvancedStats } from '../teams/seasonOverviewFormatting';
import fixture from '../teams/fixtures/team-season-snapshots/contract.json';
import { GameStatus } from '../enums';
import {
  outcome,
  previewRatingsQuery,
  previewRecordsQuery,
  previewRecentQuery,
  previewSeriesQuery,
  readPreviewSeries,
} from './previewContext';
import {
  previewAdjustedPlayersQuery,
  readAdjustedPreview,
} from './previewAdjusted';
import { validSnapshot, validGame, validEnrichment } from './previewValidation';

const payload =
  (): import('../teams/seasonOverviewTypes').TeamSeasonSnapshotPayload => {
    const copy = structuredClone(fixture);
    if (!isTeamSeasonSnapshotPayload(copy, 2025, 'Michigan'))
      throw Error('fixture invalid');
    return copy;
  };
const install = async (respond: Parameters<typeof testDatabase>[0]) => {
  const result = await testDatabase(respond);
  jest
    .spyOn(reads, 'previewRead')
    .mockImplementation((_deadline, read) => read(result.db));
  return result;
};
afterEach(() => jest.restoreAllMocks());
it('keeps dated previews available until completion, including TBD and ongoing games', () => {
  for (const startTimeTBD of [false, true, null]) {
    for (const status of [GameStatus.Scheduled, GameStatus.InProgress]) {
      expect(previewReason({ ...game, startTimeTBD, status })).toBeNull();
    }
  }
  expect(previewReason({ ...game, status: GameStatus.Completed })).toBe(
    'game_completed',
  );
  expect(previewReason({ ...game, startDate: null })).toBe('kickoff_unknown');
});
it('collapses identical affiliations, preserves conflicting sets, and rejects invalid sides', () => {
  const mapped = mapPreviewGames([
    gameRow,
    {
      ...gameRow,
      homeConference: 'Other',
      homeAbbreviation: 'X',
      homeClassification: 'fcs',
    },
  ]);
  expect(mapped).toHaveLength(1);
  expect(mapped[0].game.homeTeam.conference).toBeNull();
  expect(mapped[0].classifications).toEqual(['fbs', 'fcs']);
  expect(mapped[0].conferences).toEqual(['b1g', 'x']);
  expect(validGame(mapped[0])).toBe(true);
  expect(() =>
    mapPreviewGames([gameRow, { ...gameRow, homeGameTeamId: '3' }]),
  ).toThrow();
  expect(() => mapPreviewGames([{ ...gameRow, homeId: null }])).toThrow();
  expect(() => mapPreviewGames([{ ...gameRow, awayId: 130 }])).toThrow();
});
it('keeps current scores only for live games and preserves null final scores', () => {
  expect(
    mapPreviewGames([
      {
        ...gameRow,
        status: 'in_progress',
        currentHomeScore: 0,
        currentAwayScore: 7,
      },
    ])[0].game.homeTeam.points,
  ).toBe(0);
  expect(
    mapPreviewGames([
      { ...gameRow, status: 'completed', currentHomeScore: 0 },
    ])[0].game.homeTeam.points,
  ).toBeNull();
});
it('selects a sparse DraftKings row as a unit and deduplicates ordered media', async () => {
  await install((q) =>
    q.sql.includes('game_media')
      ? [
          { gameId: 123, mediaType: 'tv', name: 'ESPN' },
          { gameId: 123, mediaType: 'tv', name: 'ESPN' },
          { gameId: 123, mediaType: 'radio', name: 'Radio' },
        ]
      : [
          {
            gameId: 123,
            linesProviderId: 888888,
            name: 'DraftKings',
            spread: '0',
            overUnder: null,
            moneylineHome: null,
            moneylineAway: null,
          },
          {
            gameId: 123,
            linesProviderId: 999999,
            name: 'Bovada',
            spread: '-7',
            overUnder: '50',
            moneylineHome: -200,
            moneylineAway: 180,
          },
        ],
  );
  const result = await readPreviewEnrichment([123], Date.now() + 8000);
  expect(result[0].odds.data).toEqual({
    providerId: 888888,
    provider: 'DraftKings',
    spread: 0,
    overUnder: null,
    homeMoneyline: null,
    awayMoneyline: null,
  });
  expect(result[0].broadcasts.data?.map((x) => x.outlet)).toEqual([
    'Radio',
    'ESPN',
  ]);
  expect(validEnrichment(result)).toBe(true);
});
it.each([
  ['empty', 'available'],
  ['invalid', 'unavailable'],
  ['failure', 'unavailable'],
] as const)(
  'handles %s preferred odds without inventing absence',
  async (mode, status) => {
    await install((q) => {
      if (q.sql.includes('game_media')) return [];
      if (mode === 'failure') throw Error('private SQL');
      return [
        {
          gameId: 123,
          linesProviderId: 888888,
          name: 'DraftKings',
          spread: mode === 'invalid' ? 'NaN' : null,
          overUnder: null,
          moneylineHome: null,
          moneylineAway: null,
        },
        {
          gameId: 123,
          linesProviderId: 999999,
          name: 'Bovada',
          spread: '-2',
          overUnder: null,
          moneylineHome: null,
          moneylineAway: null,
        },
      ];
    });
    const [result] = await readPreviewEnrichment([123], Date.now() + 8000);
    expect(result.odds.status).toBe(status);
    if (mode === 'empty') expect(result.odds.data?.provider).toBe('Bovada');
    else expect(result.odds.data).toBeNull();
    expect(JSON.stringify(result)).not.toContain('private SQL');
    expect(result.broadcasts.status).toBe('no_data');
  },
);
it('preserves every complete snapshot metric and labels per-team fallback', async () => {
  const prior = payload();
  const nextGame = { ...game, season: 2026 };
  const { queries } = await install((q) =>
    q.parameters.includes(2025)
      ? [
          {
            teamId: 130,
            season: 2025,
            formatVersion: 1,
            generatedAt: new Date('2026-01-02Z'),
            payload: prior,
          },
        ]
      : [],
  );
  const [home, away] = await readPreviewSnapshots(nextGame, Date.now() + 8000);
  expect(home.statistics.data).toEqual({
    season: 2025,
    isPreviousSeason: true,
    advanced: formatSeasonAdvancedStats(prior.advanced),
    passing: prior.passing,
    rushing: prior.rushing,
  });
  expect(home.keyPlayers.passing).toMatchObject({
    status: 'no_data',
    data: [],
  });
  expect(away.statistics.status).toBe('no_data');
  expect(home.statistics.sourceUpdatedAt).toBe('2026-01-02T00:00:00.000Z');
  expect(validSnapshot(home)).toBe(true);
  expect(queries).toHaveLength(2);
});
it.each(['invalid', 'failure'])(
  'never falls back after %s current snapshot',
  async (mode) => {
    const { queries } = await install(() => {
      if (mode === 'failure') throw Error('db error');
      return [
        {
          teamId: 130,
          season: 2025,
          formatVersion: 2,
          generatedAt: new Date(),
          payload: fixture,
        },
        {
          teamId: 194,
          season: 2025,
          formatVersion: 2,
          generatedAt: new Date(),
          payload: fixture,
        },
      ];
    });
    const result = await readPreviewSnapshots(game, Date.now() + 8000);
    expect(result[0].statistics.status).toBe('unavailable');
    expect(result[0].keyPlayers.ppa.status).toBe('unavailable');
    expect(queries).toHaveLength(1);
  },
);
it('selects receiving backs, rushing QBs, source-only rows, and independent caps', () => {
  const p = payload();
  const proto = p.players.ppa[0],
    usage = p.players.usage[0];
  p.players.ppa = Array.from({ length: 12 }, (_, i) => ({
    ...proto,
    id: String(i),
    position: i < 3 ? 'QB' : 'RB',
    averagePPA: { ...proto.averagePPA, pass: 0, rush: -0.5 },
    totalPPA: { ...proto.totalPPA, pass: i, rush: -i },
  }));
  p.players.usage = Array.from({ length: 11 }, (_, i) => ({
    ...usage,
    id: String(i),
    position: i < 3 ? 'QB' : 'RB',
    usage: { ...usage.usage, pass: i / 20, rush: i / 20 },
  }));
  const result = projectPreviewPlayers(2025, p, null, null);
  expect(result.passing.data?.map((x) => x.athleteId)).toEqual(['2', '1']);
  expect(result.receiving.data).toHaveLength(5);
  expect(result.rushing.data).toHaveLength(3);
  expect(result.rushing.data?.[0].athleteId).toBe('10');
  expect(result.receiving.data?.some((x) => x.position === 'RB')).toBe(true);
});
it('does not treat an empty sum as participation or guess unknown positions', () => {
  const p = payload();
  const first = p.players.ppa.slice(0, 1);
  p.players.ppa = first.map((row) => ({
    ...row,
    position: 'QB',
    averagePPA: { ...row.averagePPA, pass: null, rush: null },
    totalPPA: { ...row.totalPPA, pass: 0, rush: 0 },
  }));
  p.players.usage = [];
  expect(projectPreviewPlayers(2025, p, null, null).passing.status).toBe(
    'no_data',
  );
  p.players.ppa[0].averagePPA.pass = 0;
  expect(projectPreviewPlayers(2025, p, null, null).passing.status).toBe(
    'available',
  );
  p.players.ppa[0].position = null;
  expect(projectPreviewPlayers(2025, p, null, null).passing.status).toBe(
    'no_data',
  );
});
it('preserves the other player family after conflicting duplicates', () => {
  const p = payload();
  const row = { ...p.players.ppa[0], position: 'QB' };
  p.players.ppa = [row, { ...row, totalPPA: { ...row.totalPPA, pass: 999 } }];
  p.players.usage = [
    {
      ...p.players.usage[0],
      id: row.id,
      position: 'QB',
      usage: { ...p.players.usage[0].usage, pass: 0.5 },
    },
  ];
  const result = projectPreviewPlayers(2025, p, null, null);
  expect(result.ppa.status).toBe('unavailable');
  expect(result.passing.data?.[0].usage).toBe(0.5);
  expect(result.passing.data?.[0].averagePPA).toBeNull();
});
it.each([
  [null, null, null, null, 'unknown'],
  [false, false, null, null, 'unknown'],
  [true, true, 7, 7, 'unknown'],
  [false, false, 0, 0, 'tie'],
  [true, false, null, null, 'win'],
  [null, true, null, null, 'loss'],
] as const)('keeps result semantics %s/%s', (a, b, x, y, result) =>
  expect(outcome(a, b, x, y)).toBe(result),
);
it('counts the full series, caps details, and breaks streak at unknown outcomes', async () => {
  await install(() =>
    Array.from({ length: 8 }, (_, i) => ({
      gameId: 120 - i,
      season: 2024 - i,
      startDate: `${2024 - i}-09-01 12:00:00`,
      neutralSite: false,
      homeTeamId: 130,
      homeTeam: 'Michigan',
      awayTeamId: 194,
      awayTeam: 'Ohio State',
      homePoints: i === 2 ? null : 7,
      awayPoints: 0,
      homeWinner: i === 2 ? null : true,
      awayWinner: false,
      venueId: null,
      venueName: null,
      venueCity: null,
      venueState: null,
    })),
  );
  const result = await readPreviewSeries(game, Date.now() + 8000);
  expect(result.data).toMatchObject({
    meetings: 8,
    homeWins: 7,
    unknownResults: 1,
    streak: { teamId: 130, wins: 2 },
  });
  expect(result.data?.recentMeetings).toHaveLength(5);
});
it('keeps current kicking when other adjusted sources are absent', async () => {
  const { queries } = await install((q) =>
    q.parameters.includes('field_goals')
      ? [
          {
            teamId: 130,
            athleteId: '7',
            athleteName: 'Kicker',
            metricType: 'field_goals',
            year: 2025,
            team: 'Michigan',
            conference: 'Big Ten',
            position: 'PK',
            metricValue: '1.256',
            plays: null,
          },
        ]
      : [],
  );
  const result = await readAdjustedPreview(game, Date.now() + 8000);
  expect(queries).toHaveLength(3);
  expect(
    queries.filter((q) => q.sql.includes('adjusted_player_metrics')),
  ).toHaveLength(1);
  expect(result.home.teamMetrics.status).toBe('no_data');
  expect(result.home.passing.status).toBe('no_data');
  expect(result.home.kicking.data?.[0]).toMatchObject({
    athleteId: '7',
    paar: 1.26,
    attempts: null,
  });
});
it('bounds source SQL without raw-stat reads, rank narrowing, or per-game enrichment', async () => {
  const { db } = await testDatabase(() => []);
  const queries = [
    previewGameQuery(db).where('g.id', '=', 123).compile(),
    previewRatingsQuery(db, 2025, [130, 194]).compile(),
    previewRecordsQuery(db, 2025, [130, 194]).compile(),
    previewRecentQuery(db, game).compile(),
    previewSeriesQuery(db, game).compile(),
    previewAdjustedPlayersQuery(db, game).compile(),
  ];
  for (const query of queries) {
    expect(query.sql).not.toMatch(
      /\b(?:play_stat|drive|player_usage_stats|scoreboard)\b/,
    );
    expect(query.sql).not.toMatch(/^(?:insert|update|delete)/);
  }
  expect(queries[1].sql).toContain('rank() over');
  expect(queries[3].sql).toContain('inner join lateral');
  expect(queries[3].sql).toContain('"participant"."team_id" = "selected"."id"');
  expect(queries[3].parameters).toContain(5);
  expect(queries[4].parameters).toContain(123);
  expect(queries[5].sql).toContain('group by');
  expect(queries[5].sql).toContain('nulls last');
});

it('filters and limits each team before loading recent game details', async () => {
  const { db } = await testDatabase(() => []);
  const { sql, parameters } = previewRecentQuery(db, game).compile();
  const candidates = sql.slice(
    sql.indexOf('inner join lateral'),
    sql.indexOf('as "latest"'),
  );
  expect(candidates).toContain('"participant"."team_id" = "selected"."id"');
  expect(candidates).toMatch(/"candidate"\."season" = \$\d+/);
  expect(candidates).toMatch(/"candidate"\."status" = \$\d+/);
  expect(candidates).toMatch(/"candidate"\."id" <> \$\d+/);
  expect(candidates).toMatch(/"candidate"\."start_date" < cast\(/);
  expect(candidates).toMatch(
    /order by "candidate"\."start_date" desc, "candidate"\."id" desc limit \$\d+/,
  );
  expect(candidates).not.toMatch(/join "(?:team|venue)"/);
  expect(parameters).toEqual([
    'home',
    'away',
    game.season,
    'completed',
    game.id,
    '2025-09-27 19:30:00.000',
    5,
    game.homeTeam.id,
    game.awayTeam.id,
    'completed',
    game.id,
    '2025-09-27 19:30:00.000',
  ]);
});

it('keeps complete adjusted metrics and independent team source seasons', async () => {
  const metrics = {
    epa: '0',
    epaAllowed: '-1',
    passingEpa: '2',
    passingEpaAllowed: '3',
    rushingEpa: '4',
    rushingEpaAllowed: '5',
    success: '0.4',
    successAllowed: '0.5',
    standardDownsSuccess: '0.6',
    standardDownsSuccessAllowed: '0.7',
    passingDownsSuccess: '0.2',
    passingDownsSuccessAllowed: '0.3',
    lineYards: '1',
    lineYardsAllowed: '2',
    secondLevelYards: '3',
    secondLevelYardsAllowed: '4',
    openFieldYards: '5',
    openFieldYardsAllowed: '6',
    highlightYards: '7',
    highlightYardsAllowed: '8',
    explosiveness: '-0.1',
    explosivenessAllowed: '0.2',
  };
  await install((q) =>
    !q.sql.includes('adjusted_team_metrics')
      ? []
      : q.parameters.includes(2025)
        ? [
            {
              ...metrics,
              teamId: 130,
              year: 2025,
              team: 'Michigan',
              conference: 'B1G',
            },
          ]
        : [
            {
              ...metrics,
              teamId: 194,
              year: 2024,
              team: 'Ohio State',
              conference: 'B1G',
            },
          ],
  );
  const result = await readAdjustedPreview(game, Date.now() + 8000);
  expect(result.home.teamMetrics.data).toMatchObject({
    season: 2025,
    isPreviousSeason: false,
  });
  expect(result.away.teamMetrics.data).toMatchObject({
    season: 2024,
    isPreviousSeason: true,
  });
  expect(result.home.teamMetrics.data?.metrics).toEqual({
    year: 2025,
    teamId: 130,
    team: 'Michigan',
    conference: 'B1G',
    epa: { total: 0, passing: 2, rushing: 4 },
    epaAllowed: { total: -1, passing: 3, rushing: 5 },
    successRate: { total: 0.4, standardDowns: 0.6, passingDowns: 0.2 },
    successRateAllowed: { total: 0.5, standardDowns: 0.7, passingDowns: 0.3 },
    rushing: {
      lineYards: 1,
      secondLevelYards: 3,
      openFieldYards: 5,
      highlightYards: 7,
    },
    rushingAllowed: {
      lineYards: 2,
      secondLevelYards: 4,
      openFieldYards: 6,
      highlightYards: 8,
    },
    explosiveness: -0.1,
    explosivenessAllowed: 0.2,
  });
});

it('supports any canonical preseason game and rejects malformed cache identities', () => {
  expect(
    mapPreviewGames([{ ...gameRow, seasonType: 'preseason' }])[0].game
      .seasonType,
  ).toBe('preseason');
  const core = mapPreviewGames([gameRow])[0];
  expect(
    validGame({
      ...core,
      game: {
        ...core.game,
        awayTeam: { ...core.game.awayTeam, id: core.game.homeTeam.id },
      },
    }),
  ).toBe(false);
});

it('keeps batched player categories and validation independent by team', async () => {
  await install((q) =>
    q.sql.includes('adjusted_player_metrics')
      ? [130, 194].flatMap((teamId) =>
          ['passing', 'rushing', 'field_goals'].map((metricType) => ({
            teamId,
            athleteId: String(teamId),
            athleteName: 'Player',
            year: game.season,
            team: teamId === 130 ? 'Michigan' : 'Ohio State',
            conference: 'Big Ten',
            position: 'QB',
            metricType,
            metricValue:
              metricType === 'passing' && teamId === 130 ? 'NaN' : '1.256',
            plays: 10,
          })),
        )
      : [],
  );
  const result = await readAdjustedPreview(game, Date.now() + 8000);
  expect(result.home.passing).toMatchObject({
    status: 'unavailable',
    reason: 'invalid_data',
    data: null,
  });
  expect(result.home.rushing.data).toHaveLength(1);
  expect(result.home.rushing.data?.[0]).toMatchObject({
    athleteId: '130',
    wepa: 1.26,
  });
  expect(result.home.kicking.data?.[0]).toMatchObject({
    athleteId: '130',
    paar: 1.26,
    attempts: 10,
  });
  expect(result.away.passing.data?.[0]).toMatchObject({
    athleteId: '194',
    wepa: 1.26,
  });
});

it('still reads players but never falls back after adjusted team source failure', async () => {
  const { queries } = await install((q) => {
    if (q.sql.includes('adjusted_team_metrics')) throw Error('source failed');
    return [];
  });
  const result = await readAdjustedPreview(game, Date.now() + 8000);
  expect(queries).toHaveLength(2);
  expect(result.home.teamMetrics.reason).toBe('source_error');
  expect(result.home.passing.status).toBe('no_data');
  expect(result.home.kicking.status).toBe('no_data');
});

it('ranks and caps each batched adjusted category separately', async () => {
  const { db } = await testDatabase(() => []);
  const { sql, parameters } = previewAdjustedPlayersQuery(db, game).compile();
  expect(sql).toContain('partition by "team_id", "metric_type"');
  expect(sql).toContain('"plays" desc nulls last');
  expect(sql).toContain('cast("athlete_id" as text)');
  expect(parameters.slice(-6)).toEqual([
    'passing',
    '2',
    'rushing',
    '3',
    'field_goals',
    '1',
  ]);
  expect(parameters).toContain(game.season);
  expect(parameters).not.toContain(game.season - 1);
});

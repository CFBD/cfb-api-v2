import type { PlayByPlayGameResponse } from './types';

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('../../config/database', () => ({
  kdb: { selectFrom: jest.fn() },
}));

const feed = (gameId = 1): PlayByPlayGameResponse => {
  const team = (id: string) => ({
    id,
    displayName: `Team ${id}`,
    location: `Team ${id}`,
  });
  const drive = (id: string) => ({
    id,
    team: team(id),
    offensivePlays: 1,
    yards: 5,
    start: { period: { number: 1 }, yardLine: 50 },
    plays: [
      {
        id: `play-${id}`,
        type: { id: '5', text: 'Rush' },
        start: { team: team(id), down: 1, distance: 10, yardsToEndzone: 50 },
        end: { team: team(id), down: 2, distance: 5, yardsToEndzone: 45 },
        period: { number: 1 },
        clock: { displayValue: '10:00' },
        wallclock: '2026-09-05T18:00:00Z',
        statYardage: 5,
        homeScore: 0,
        awayScore: 0,
        scoringPlay: false,
        text: 'Rush for five yards',
      },
    ],
  });
  return {
    header: {
      id: String(gameId),
      competitions: [
        {
          competitors: ['1', '2'].map((id) => ({
            team: team(id),
            homeAway: id === '1' ? 'home' : 'away',
            score: '0',
            linescores: [{ displayValue: '0' }],
          })),
          status: {
            type: { description: 'In Progress' },
            period: 1,
            displayClock: '10:00',
          },
        },
      ],
    },
    drives: { previous: [drive('1'), drive('2')] },
  } as unknown as PlayByPlayGameResponse;
};

const rows = [
  { down: 1, distance: 10, yardLine: 50, ppa: 1.25 },
  { down: 2, distance: 5, yardLine: 45, ppa: 2.5 },
];

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('live play caching and EPA lookup', () => {
  let getLivePlays: typeof import('./service').getLivePlays;
  let get: jest.Mock;
  let post: jest.Mock;
  let execute: jest.Mock;
  const originalFeedUrl = process.env.PLAYS_URL;
  const originalMlUrl = process.env.ML_API_URL;

  beforeEach(async () => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-05T18:00:00Z'));
    process.env.PLAYS_URL = 'https://feed.example/summary';
    process.env.ML_API_URL = 'https://ml.example';
    const { default: axios } = await import('axios');
    get = axios.get as jest.Mock;
    post = axios.post as jest.Mock;
    get.mockImplementation((_url, options) =>
      Promise.resolve({ data: feed(options.params.event) }),
    );
    post.mockResolvedValue({ data: { prediction: 0.75 } });
    execute = jest.fn().mockResolvedValue(rows);
    const builder = { select: jest.fn(), execute };
    builder.select.mockReturnValue(builder);
    const { kdb } = await import('../../config/database');
    (kdb.selectFrom as jest.Mock).mockReturnValue(builder);
    ({ getLivePlays } = await import('./service'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalFeedUrl === undefined) delete process.env.PLAYS_URL;
    else process.env.PLAYS_URL = originalFeedUrl;
    if (originalMlUrl === undefined) delete process.env.ML_API_URL;
    else process.env.ML_API_URL = originalMlUrl;
  });

  test('preserves EPA, team metrics, timestamps, and optional predictions', async () => {
    const game = await getLivePlays(1);
    expect(game.drives[0].plays[0]).toMatchObject({
      epa: 1.25,
      wallClock: new Date('2026-09-05T18:00:00Z'),
      success: true,
      rushPass: 'rush',
    });
    expect(game.teams[0]).toMatchObject({ totalEpa: 1.3, deserveToWin: 0.75 });
    expect(game.teams[1].deserveToWin).toBe(0.25);
    expect(get).toHaveBeenCalledWith('https://feed.example/summary', {
      params: { event: 1 },
      timeout: 10000,
      signal: expect.any(AbortSignal),
    });
    expect(post).toHaveBeenCalledWith(
      'https://ml.example/predict/pgwe',
      expect.any(Object),
      { timeout: 2000, signal: expect.any(AbortSignal) },
    );
  });

  test('preserves the first EPA match and returns null for missing lookups', async () => {
    execute.mockResolvedValueOnce([...rows, { ...rows[0], ppa: 99 }]);
    expect((await getLivePlays(1)).drives[0].plays[0].epa).toBe(1.25);
    const other = feed(2);
    other.drives.previous[0].plays[0].start.distance = 99;
    get.mockResolvedValueOnce({ data: other });
    expect((await getLivePlays(2)).drives[0].plays[0].epa).toBeNull();
  });

  test('does not treat a missing field position as zero yards to goal', async () => {
    execute.mockResolvedValueOnce([
      ...rows,
      { down: 1, distance: 10, yardLine: 0, ppa: 6 },
    ]);
    const data = feed();
    data.drives.previous[0].plays[0].start.yardsToEndzone =
      null as unknown as number;
    get.mockResolvedValueOnce({ data });
    expect((await getLivePlays(1)).drives[0].plays[0].epa).toBeNull();
  });

  test('preserves touchdown EPA without requiring an end-state lookup', async () => {
    const data = feed();
    const play = data.drives.previous[0].plays[0];
    play.scoringPlay = true;
    play.scoreValue = 6;
    get.mockResolvedValueOnce({ data });
    expect((await getLivePlays(1)).drives[0].plays[0].epa).toBe(4.75);
  });

  test('shares concurrent same-game work and caches from completion for five seconds', async () => {
    const upstream = deferred<{ data: PlayByPlayGameResponse }>();
    get.mockReturnValueOnce(upstream.promise);
    const first = getLivePlays(1);
    const second = getLivePlays(1);
    expect(first).toBe(second);
    jest.advanceTimersByTime(2000);
    upstream.resolve({ data: feed() });
    const game = await first;
    jest.advanceTimersByTime(4999);
    expect(await getLivePlays(1)).toBe(game);
    expect(get).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await Promise.all([getLivePlays(1), getLivePlays(1)]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('shares the initial EPA load across different games', async () => {
    const database = deferred<typeof rows>();
    execute.mockReturnValueOnce(database.promise);
    const first = getLivePlays(1);
    const second = getLivePlays(2);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
    database.resolve(rows);
    const games = await Promise.all([first, second]);
    expect(games.map((game) => game.id)).toEqual([1, 2]);
    expect(get).toHaveBeenCalledTimes(2);
  });

  test('clears failed EPA initialization so the next request can retry', async () => {
    execute.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(getLivePlays(1)).rejects.toThrow('database unavailable');
    expect(get).not.toHaveBeenCalled();
    await expect(getLivePlays(1)).resolves.toMatchObject({ id: 1 });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  test('shares upstream errors without caching a failed result', async () => {
    const upstream = deferred<{ data: PlayByPlayGameResponse }>();
    get.mockReturnValueOnce(upstream.promise);
    const first = getLivePlays(1);
    const second = getLivePlays(1);
    const failures = Promise.allSettled([first, second]);
    upstream.reject(new Error('feed timeout'));
    expect((await failures).map((result) => result.status)).toEqual([
      'rejected',
      'rejected',
    ]);
    await expect(getLivePlays(1)).resolves.toMatchObject({ id: 1 });
    expect(get).toHaveBeenCalledTimes(2);
  });

  test('returns base data when the optional ML call times out', async () => {
    post.mockRejectedValueOnce(new Error('ML timeout'));
    const game = await getLivePlays(1);
    expect(game.drives[0].plays[0].epa).toBe(1.25);
    expect(game.teams.every((team) => team.deserveToWin === undefined)).toBe(
      true,
    );
  });

  test('bounds retained games and refreshes evicted entries', async () => {
    for (let id = 1; id <= 129; id += 1) await getLivePlays(id);
    expect(get).toHaveBeenCalledTimes(129);
    await getLivePlays(2);
    expect(get).toHaveBeenCalledTimes(129);
    await getLivePlays(1);
    expect(get).toHaveBeenCalledTimes(130);
  });
});

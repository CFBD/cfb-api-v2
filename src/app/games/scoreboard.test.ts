import { DivisionClassification } from '../enums';
import { getScoreboard, ScoreboardRedis } from './scoreboard';
import { Selectable } from 'kysely';
import { Scoreboard as ScoreboardRow } from '../../config/types/db';

const row = {
  id: 1,
  startDate: new Date('2026-08-21T16:00:00.000Z'),
  startTimeTbd: false,
  tv: 'ESPN',
  neutralSite: false,
  conferenceGame: true,
  status: 'in_progress',
  currentPeriod: 2,
  currentClock: '00:12:34',
  currentSituation: '2nd & 5',
  currentPossession: 'Michigan',
  lastPlay: 'Rush for 5 yards',
  venue: 'Michigan Stadium',
  city: 'Ann Arbor',
  state: 'MI',
  homeId: 1,
  homeTeam: 'Michigan',
  homeConference: 'Big Ten',
  homeConferenceAbbreviation: 'B1G',
  homeClassification: 'fbs',
  homePoints: 14,
  homeLineScores: [7, 7],
  homeWinProbability: '0.75',
  homeLocation: 'Ann Arbor, MI',
  awayId: 2,
  awayTeam: 'Opponent',
  awayConference: 'Other',
  awayConferenceAbbreviation: 'OTH',
  awayClassification: 'fcs',
  awayPoints: 7,
  awayLineScores: [0, 7],
  awayLocation: 'Elsewhere',
  temperature: '70',
  weatherDescription: 'Clear',
  windSpeed: '5',
  windDirection: '180',
  spread: '-7.5',
  overUnder: '48.5',
  moneylineHome: -250,
  moneylineAway: 200,
} as unknown as Selectable<ScoreboardRow>;

class MemoryRedis implements ScoreboardRedis {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(
    key: string,
    value: string,
    options: { EX?: number; PX?: number; NX?: boolean },
  ): Promise<string | null> {
    if (options.NX && this.values.has(key)) {
      return null;
    }
    this.values.set(key, value);
    return 'OK';
  }

  async eval(
    _script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<number> {
    const [key] = options.keys;
    const [owner] = options.arguments;
    if (this.values.get(key) === owner) {
      this.values.delete(key);
      return 1;
    }
    return 0;
  }
}

describe('scoreboard cache', () => {
  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('refreshes one canonical snapshot and reuses it for filtering', async () => {
    const redis = new MemoryRedis();
    const queryAll = jest.fn().mockResolvedValue([row]);
    const queryFiltered = jest.fn();
    const now = () => new Date('2026-08-21T16:00:30.000Z');

    const fbs = await getScoreboard(DivisionClassification.FBS, undefined, {
      redis,
      queryAll,
      queryFiltered,
      now,
    });
    const fcs = await getScoreboard(DivisionClassification.FCS, 'oth', {
      redis,
      queryAll,
      queryFiltered,
      now,
    });

    expect(queryAll).toHaveBeenCalledTimes(1);
    expect(queryFiltered).not.toHaveBeenCalled();
    expect(fbs).toHaveLength(1);
    expect(fcs).toHaveLength(1);
    expect(fcs[0].startDate).toEqual(row.startDate);
    expect(fbs[0].homeTeam.winProbability).toBe(0.75);
    expect(fbs[0].awayTeam.winProbability).toBe(0.25);
  });

  test('coalesces concurrent cache misses', async () => {
    const redis = new MemoryRedis();
    const queryAll = jest.fn(
      () =>
        new Promise<(typeof row)[]>((resolve) =>
          setTimeout(() => resolve([row]), 10),
        ),
    );
    const queryFiltered = jest.fn();

    const [first, second] = await Promise.all([
      getScoreboard(DivisionClassification.FBS, undefined, {
        redis,
        queryAll,
        queryFiltered,
      }),
      getScoreboard(DivisionClassification.FBS, undefined, {
        redis,
        queryAll,
        queryFiltered,
      }),
    ]);

    expect(queryAll).toHaveBeenCalledTimes(1);
    expect(queryFiltered).not.toHaveBeenCalled();
    expect(first).toEqual(second);
  });

  test('uses the request-filtered database path when Redis fails', async () => {
    const redis: ScoreboardRedis = {
      get: jest.fn().mockRejectedValue(new Error('unavailable')),
      set: jest.fn(),
      eval: jest.fn(),
    };
    const queryFiltered = jest.fn().mockResolvedValue([row]);

    const result = await getScoreboard(DivisionClassification.FBS, 'B1G', {
      redis,
      queryFiltered,
    });

    expect(queryFiltered).toHaveBeenCalledWith(
      DivisionClassification.FBS,
      'B1G',
    );
    expect(result).toHaveLength(1);
  });
  test('reuses the parsed snapshot for one second, then sees Redis updates', async () => {
    const redis = new MemoryRedis();
    const read = jest.spyOn(redis, 'get');
    let time = Date.parse('2026-08-21T16:00:30Z');
    const dependencies = {
      redis,
      queryAll: jest.fn().mockResolvedValue([row]),
      queryFiltered: jest.fn(),
      now: () => new Date(time),
    };
    const first = await getScoreboard(
      DivisionClassification.FBS,
      undefined,
      dependencies,
    );
    read.mockClear();
    const snapshotKey = 'cfb-api:v1:scoreboard:snapshot';
    const updated = JSON.parse(redis.values.get(snapshotKey)!);
    updated.games[0].response.homeTeam.points = 21;
    redis.values.set(snapshotKey, JSON.stringify(updated));
    time += 999;
    expect(
      (await getScoreboard(DivisionClassification.FBS, 'b1g', dependencies))[0],
    ).toBe(first[0]);
    expect(read).not.toHaveBeenCalled();
    time += 1;
    const [second, concurrent] = await Promise.all([
      getScoreboard(DivisionClassification.FBS, undefined, dependencies),
      getScoreboard(DivisionClassification.FCS, 'OTH', dependencies),
    ]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(second[0].homeTeam.points).toBe(21);
    expect(concurrent[0]).toBe(second[0]);
    expect(second[0].startDate).toEqual(row.startDate);
    expect(dependencies.queryAll).toHaveBeenCalledTimes(1);
  });

  test('never extends the original sixty-second snapshot lifetime', async () => {
    const redis = new MemoryRedis();
    let time = Date.parse('2026-08-21T16:00:00Z');
    const queryAll = jest.fn().mockResolvedValue([row]);
    const dependencies = {
      redis,
      queryAll,
      queryFiltered: jest.fn(),
      now: () => new Date(time),
    };
    await getScoreboard(DivisionClassification.FBS, undefined, dependencies);
    time += 59_500;
    await getScoreboard(DivisionClassification.FBS, undefined, dependencies);
    expect(queryAll).toHaveBeenCalledTimes(1);
    time += 500;
    await getScoreboard(DivisionClassification.FBS, undefined, dependencies);
    expect(queryAll).toHaveBeenCalledTimes(2);
  });

  test('retries Redis after an error and isolates snapshots by client', async () => {
    const redis = new MemoryRedis();
    const queryFiltered = jest
      .fn()
      .mockResolvedValue([{ ...row, homePoints: 99 }]);
    const queryAll = jest.fn().mockResolvedValue([row]);
    const read = jest
      .spyOn(redis, 'get')
      .mockRejectedValueOnce(new Error('offline'));
    const dependencies = { redis, queryAll, queryFiltered };
    expect(
      (
        await getScoreboard(DivisionClassification.FBS, undefined, dependencies)
      )[0].homeTeam.points,
    ).toBe(99);
    expect(
      (
        await getScoreboard(DivisionClassification.FBS, undefined, dependencies)
      )[0].homeTeam.points,
    ).toBe(14);
    expect(read).toHaveBeenCalledTimes(2);
    const otherQuery = jest.fn().mockResolvedValue([]);
    expect(
      await getScoreboard(DivisionClassification.FBS, undefined, {
        redis: new MemoryRedis(),
        queryAll: otherQuery,
      }),
    ).toEqual([]);
    expect(otherQuery).toHaveBeenCalledTimes(1);
  });
});

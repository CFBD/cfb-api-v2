const mockPrimaryAny = jest.fn();
const mockPrimarySelectFrom = jest.fn();
const mockPrimaryTask = jest.fn();
const mockPrimaryWith = jest.fn();
const mockReplicaAny = jest.fn();
const mockReplicaSelectFrom = jest.fn();
const mockReplicaTask = jest.fn();
const mockReplicaWith = jest.fn();

jest.mock('../../config/database', () => ({
  db: {
    any: mockPrimaryAny,
    task: mockPrimaryTask,
  },
  kdb: {
    selectFrom: mockPrimarySelectFrom,
    with: mockPrimaryWith,
  },
  replicaDb: {
    any: mockReplicaAny,
    task: mockReplicaTask,
  },
  replicaKdb: {
    selectFrom: mockReplicaSelectFrom,
    with: mockReplicaWith,
  },
}));

import {
  getAdvancedGameStats,
  getAdvancedStats,
  getPlayerGameSuccessRates,
  getPlayerSeasonStats,
  getPlayerSeasonSuccessRates,
} from './service';

const createQueryBuilder = (): Record<string, jest.Mock> => {
  const builder: Record<string, jest.Mock> = {};
  const chainMethods = [
    'distinct',
    'groupBy',
    'having',
    'innerJoin',
    'leftJoin',
    'orderBy',
    'select',
    'selectFrom',
    'union',
    'where',
  ];

  for (const method of chainMethods) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }

  builder.execute = jest.fn().mockResolvedValue([]);
  return builder;
};

type ReplicaTaskContext = {
  batch: (tasks: Promise<unknown[]>[]) => Promise<unknown[][]>;
};

describe('stats replica routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockPrimarySelectFrom.mockReturnValue(createQueryBuilder());
    mockPrimaryWith.mockReturnValue(createQueryBuilder());
    mockReplicaSelectFrom.mockReturnValue(createQueryBuilder());
    mockReplicaWith.mockReturnValue(createQueryBuilder());
    mockReplicaAny.mockResolvedValue([]);
    mockReplicaTask.mockImplementation(
      async (
        callback: (task: ReplicaTaskContext) => Promise<unknown[][]>,
      ): Promise<unknown[][]> =>
        await callback({
          batch: async (tasks) => await Promise.all(tasks),
        }),
    );
  });

  test('routes /stats/player/season through the replica', async () => {
    await getPlayerSeasonStats(2025);

    expect(mockReplicaSelectFrom).toHaveBeenCalledWith('game');
    expect(mockPrimarySelectFrom).not.toHaveBeenCalled();
  });

  test('routes /stats/player/success/game through the replica', async () => {
    await getPlayerGameSuccessRates(2025, 1);

    expect(mockReplicaWith).toHaveBeenCalledWith(
      'creditedPlayerPlays',
      expect.any(Function),
    );
    expect(mockPrimaryWith).not.toHaveBeenCalled();
  });

  test('routes every /stats/season/advanced query through the replica', async () => {
    await getAdvancedStats(2025);

    expect(mockReplicaSelectFrom).toHaveBeenCalledWith('gameHavocStats');
    expect(mockReplicaAny).toHaveBeenCalledTimes(3);
    expect(mockReplicaTask).toHaveBeenCalledTimes(1);
    expect(mockPrimarySelectFrom).not.toHaveBeenCalled();
    expect(mockPrimaryAny).not.toHaveBeenCalled();
    expect(mockPrimaryTask).not.toHaveBeenCalled();
  });

  test('routes /stats/game/advanced through the replica', async () => {
    await getAdvancedGameStats(2025);

    expect(mockReplicaWith).toHaveBeenCalledWith('plays', expect.any(Function));
    expect(mockPrimaryWith).not.toHaveBeenCalled();
  });

  test('keeps /stats/player/success on the primary', async () => {
    await getPlayerSeasonSuccessRates(2025);

    expect(mockPrimaryWith).toHaveBeenCalledWith(
      'creditedPlayerPlays',
      expect.any(Function),
    );
    expect(mockReplicaWith).not.toHaveBeenCalled();
  });
});

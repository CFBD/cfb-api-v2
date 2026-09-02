const mockPrimarySelectFrom = jest.fn();
const mockReplicaSelectFrom = jest.fn();

jest.mock('../../config/database', () => ({
  kdb: { selectFrom: mockPrimarySelectFrom },
  replicaKdb: { selectFrom: mockReplicaSelectFrom },
}));

import { getPlayStats, getPlayTypes } from './service';

const createQueryBuilder = (): Record<string, jest.Mock> => {
  const builder: Record<string, jest.Mock> = {};
  const chainMethods = [
    'distinct',
    'innerJoin',
    'limit',
    'orderBy',
    'select',
    'where',
  ];

  for (const method of chainMethods) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }

  builder.execute = jest.fn().mockResolvedValue([]);
  return builder;
};

describe('plays replica routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrimarySelectFrom.mockReturnValue(createQueryBuilder());
    mockReplicaSelectFrom.mockReturnValue(createQueryBuilder());
  });

  test('routes /plays/stats through the replica', async () => {
    await getPlayStats();

    expect(mockReplicaSelectFrom).toHaveBeenCalledWith('team');
    expect(mockPrimarySelectFrom).not.toHaveBeenCalled();
  });

  test('keeps other plays queries on the primary', async () => {
    await getPlayTypes();

    expect(mockPrimarySelectFrom).toHaveBeenCalledWith('playType');
    expect(mockReplicaSelectFrom).not.toHaveBeenCalled();
  });
});

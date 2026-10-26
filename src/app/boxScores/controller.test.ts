import { BoxScoresController } from './controller';
import { getAdvancedBoxScore } from './service';
import { UnsupportedBoxScoreError } from './wire';

jest.mock('../../config/middleware', () => ({ standard: [] }));
jest.mock('./service', () => ({ getAdvancedBoxScore: jest.fn() }));

const ok = jest.fn();
const notFound = jest.fn((status: number, body: unknown) => ({ status, body }));

beforeEach(() => jest.clearAllMocks());

it('returns 404 for games without play data instead of failing', async () => {
  jest
    .mocked(getAdvancedBoxScore)
    .mockRejectedValue(
      new UnsupportedBoxScoreError('Unsupported legacy box score'),
    );
  const result = await new BoxScoresController().getAdvancedBoxScore(
    401871057,
    ok,
    notFound,
  );
  expect(notFound).toHaveBeenCalledWith(404, {
    message: 'Advanced box score is not available for this game.',
  });
  expect(result).toEqual({
    status: 404,
    body: { message: 'Advanced box score is not available for this game.' },
  });
});

it('propagates other failures as server errors', async () => {
  jest
    .mocked(getAdvancedBoxScore)
    .mockRejectedValue(new Error('connection lost'));
  await expect(
    new BoxScoresController().getAdvancedBoxScore(1, ok, notFound),
  ).rejects.toThrow('connection lost');
  expect(notFound).not.toHaveBeenCalled();
});

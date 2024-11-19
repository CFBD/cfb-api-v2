import cors from './cors';

describe('cors middleware tests', () => {
  test('cors allowed for domain origin', async () => {
    const next = jest.fn();

    cors(
      { headers: { origin: 'https://collegefootballdata.com' } },
      {
        setHeader: () => {},
        end: () => {},
      },
      next,
    );

    expect(next).toHaveBeenCalled();
  });

  test('cors not allowed for no origin', async () => {
    const next = jest.fn();

    try {
      cors(
        { headers: {} },
        {
          setHeader: () => {},
          end: () => {},
        },
        next,
      );

      expect(next).not.toHaveBeenCalled();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  test('cors not allowed for other origin', async () => {
    const next = jest.fn();

    try {
      cors(
        { headers: { origin: 'https://example.com' } },
        {
          setHeader: () => {},
          end: () => {},
        },
        next,
      );

      expect(next).not.toHaveBeenCalled();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });
});

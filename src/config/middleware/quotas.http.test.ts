import express, { Application, Response } from 'express';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';
import { authDb } from '../database';
import { updateQuotas } from './quotas';

const refund = jest.spyOn(authDb, 'one');
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

const withServer = async (
  app: Application,
  run: (url: string) => Promise<void>,
) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

const createApp = () => {
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, {
      user: { id: 1, remainingCalls: 999 },
      quotaReserved: true,
    });
    next();
  });
  app.use(updateQuotas);
  return app;
};

beforeEach(() => {
  refund.mockReset();
  refund.mockResolvedValue({ remaining_calls: 1000 });
});

test.each([200, 400, 500])(
  'real Express JSON response preserves status %i, body, and quota header',
  async (status) => {
    const app = createApp();
    let chainable = false;
    app.get('/', (_req, res) => {
      chainable = res.status(status).json({ message: 'response' }) === res;
    });
    await withServer(app, async (url) => {
      const response = await fetch(url);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ message: 'response' });
      expect(response.headers.get('x-calllimit-remaining')).toBe(
        status === 200 ? '999' : '1000',
      );
      expect(chainable).toBe(true);
      expect(refund).toHaveBeenCalledTimes(status === 200 ? 0 : 1);
    });
  },
);

test.each(['duplicate', 'ended', 'disconnected'] as const)(
  'delayed refund tolerates a response that is %s without a rejected send',
  async (scenario) => {
    let completeRefund!: (value: { remaining_calls: number }) => void;
    refund.mockImplementation(
      () => new Promise((resolve) => (completeRefund = resolve)),
    );
    const app = createApp();
    const rejected: unknown[] = [];
    const returned: unknown[] = [];
    let responseObject: Response;
    app.get('/', (_req, res) => {
      responseObject = res;
      returned.push(res.status(400).send('first'));
      if (scenario === 'duplicate') returned.push(res.send('second'));
      if (scenario === 'ended') res.end('already ended');
      if (scenario === 'disconnected') res.destroy();
      // Capture the old implementation's rejected promises so the regression
      // fails by assertion instead of crashing the Jest worker.
      for (const value of returned) {
        void Promise.resolve(value).catch((error) => rejected.push(error));
      }
      completeRefund({ remaining_calls: 1000 });
    });
    await withServer(app, async (url) => {
      if (scenario === 'disconnected') {
        await expect(fetch(url)).rejects.toThrow();
      } else {
        const response = await fetch(url);
        expect(await response.text()).toBe(
          scenario === 'ended' ? 'already ended' : 'first',
        );
      }
      await flush();
      expect(rejected).toEqual([]);
      expect(returned.every((value) => value === responseObject)).toBe(true);
      expect(refund).toHaveBeenCalledTimes(1);
    });
  },
);

test('a failed refund still sends the error response and current quota', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  refund.mockRejectedValue(new Error('database unavailable'));
  const app = createApp();
  app.get('/', (_req, res) =>
    res.status(500).send({ message: 'original error' }),
  );
  try {
    await withServer(app, async (url) => {
      const response = await fetch(url);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ message: 'original error' });
      expect(response.headers.get('x-calllimit-remaining')).toBe('999');
      expect(log).toHaveBeenCalledWith(
        'Error refunding remaining calls',
        expect.any(Error),
      );
    });
  } finally {
    log.mockRestore();
  }
});

test('a send failure after refund reaches Express error handling', async () => {
  const app = createApp();
  const errors: unknown[] = [];
  const circular: { self?: unknown } = {};
  circular.self = circular;
  app.get('/', (_req, res) => res.status(400).send(circular));
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: Response,
      _next: express.NextFunction,
    ) => {
      void _next; // Express identifies error handlers by their four arguments.
      errors.push(error);
      res.status(500).send({ message: 'handled serialization failure' });
    },
  );
  await withServer(app, async (url) => {
    const response = await fetch(url);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'handled serialization failure',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(TypeError);
    expect(refund).toHaveBeenCalledTimes(1);
  });
});

test('anonymous responses preserve Express send and do not touch quotas', async () => {
  const app = express();
  app.use(updateQuotas);
  app.get('/', (_req, res) => res.send(Buffer.from('documentation')));
  await withServer(app, async (url) => {
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('documentation');
    expect(response.headers.has('x-calllimit-remaining')).toBe(false);
    expect(refund).not.toHaveBeenCalled();
  });
});

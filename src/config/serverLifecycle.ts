import { Server } from 'node:http';

export const installGracefulShutdown = (
  server: Server,
  closeResources: () => Promise<void>,
): void => {
  let stopping = false;
  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      process.exit(1);
    }, 8000);
    deadline.unref();
    server.close(() => {
      void closeResources().then(
        () => {
          clearTimeout(deadline);
          process.exit(0);
        },
        (error) => {
          console.error('API shutdown failed', error);
          process.exit(1);
        },
      );
    });
    server.closeIdleConnections();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('disconnect', shutdown);
};

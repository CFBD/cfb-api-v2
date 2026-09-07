import type { Config } from 'jest';

const config: Config = {
  clearMocks: true,
  coverageProvider: 'v8',
  // CPU-based defaults can start dozens of TypeScript workers on developer
  // machines. Bound concurrency and recycle workers between large suites.
  maxWorkers: 2,
  workerIdleMemoryLimit: '512MB',
  // Typecheck separately with pnpm typecheck / pnpm build. Jest only needs
  // per-file transformation, not a full TypeScript program in each worker.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
    '^.+\\.jsx?$': 'babel-jest',
  },
  // Build mirrors source tests; never discover those generated copies.
  roots: ['<rootDir>/src'],
  setupFiles: ['<rootDir>/src/test/setup.ts'],
};

export default config;

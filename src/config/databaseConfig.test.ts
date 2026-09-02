import { getDatabaseConnectionConfigs } from './databaseConfig';

const primaryEnvironment: NodeJS.ProcessEnv = {
  DATABASE: 'cfb',
  DATABASE_HOST: 'primary.example.com',
  DATABASE_PASSWORD: 'password',
  DATABASE_PORT: '5432',
  DATABASE_USER: 'cfb-user',
};

describe('database connection configuration', () => {
  test('uses the replica host and port with the primary credentials', () => {
    const { primary, replica } = getDatabaseConnectionConfigs({
      ...primaryEnvironment,
      DATABASE_REPLICA_HOST: 'replica.example.com',
      DATABASE_REPLICA_PORT: '5433',
    });

    expect(replica).toEqual({
      ...primary,
      host: 'replica.example.com',
      port: '5433',
    });
    expect(replica).not.toBe(primary);
  });

  test.each([
    {},
    { DATABASE_REPLICA_HOST: 'replica.example.com' },
    { DATABASE_REPLICA_PORT: '5433' },
  ])('falls back to the primary for incomplete replica settings', (replica) => {
    const configs = getDatabaseConnectionConfigs({
      ...primaryEnvironment,
      ...replica,
    });

    expect(configs.replica).toBe(configs.primary);
  });

  test('uses the PostgreSQL default port when the primary port is omitted', () => {
    const environment = { ...primaryEnvironment };
    delete environment.DATABASE_PORT;

    const { primary } = getDatabaseConnectionConfigs(environment);

    expect(primary.port).toBe('5432');
  });
});

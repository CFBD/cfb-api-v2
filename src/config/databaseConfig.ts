export interface DatabaseConnectionConfig {
  database: string | undefined;
  host: string | undefined;
  password: string | undefined;
  port: string;
  user: string | undefined;
}

export interface DatabaseConnectionConfigs {
  primary: DatabaseConnectionConfig;
  replica: DatabaseConnectionConfig;
}

export const getDatabaseConnectionConfigs = (
  environment: NodeJS.ProcessEnv = process.env,
): DatabaseConnectionConfigs => {
  const primary: DatabaseConnectionConfig = {
    database: environment.DATABASE,
    host: environment.DATABASE_HOST,
    password: environment.DATABASE_PASSWORD,
    port: environment.DATABASE_PORT || '5432',
    user: environment.DATABASE_USER,
  };

  const replicaHost = environment.DATABASE_REPLICA_HOST;
  const replicaPort = environment.DATABASE_REPLICA_PORT;

  if (!replicaHost || !replicaPort) {
    return { primary, replica: primary };
  }

  return {
    primary,
    replica: {
      ...primary,
      host: replicaHost,
      port: replicaPort,
    },
  };
};

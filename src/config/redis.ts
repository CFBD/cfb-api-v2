import { createClient, RedisClientType } from 'redis';

let client: RedisClientType | undefined;
let connection: Promise<RedisClientType | null> | undefined;

export const getRedisClient = async (): Promise<RedisClientType | null> => {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    return null;
  }

  if (client?.isReady) {
    return client;
  }
  if (connection) {
    return connection;
  }

  client = createClient({
    url,
    password: process.env.REDIS_PASSWORD?.trim() || undefined,
  });
  client.on('error', () => {
    console.error('Redis client error.');
  });

  connection = client
    .connect()
    .then(() => client ?? null)
    .catch(() => {
      console.error('Redis connection unavailable; using database fallback.');
      client = undefined;
      connection = undefined;
      return null;
    });

  return connection;
};

export const closeRedisConnection = async (): Promise<void> => {
  if (client?.isOpen) await client.disconnect();
  client = undefined;
  connection = undefined;
};

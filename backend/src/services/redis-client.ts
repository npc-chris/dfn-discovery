import Redis from 'ioredis';

let client: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (client) {
    return client;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  client.on('error', () => {
    // Redis failures should not break scoring; callers can fall back to no cache.
  });

  return client;
}

export async function getRedisConnection(): Promise<Redis | null> {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  if (redis.status === 'wait' || redis.status === 'end') {
    try {
      await redis.connect();
    } catch {
      return null;
    }
  }

  return redis;
}

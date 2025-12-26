import Redis from "ioredis";
import { RateLimiterRedis } from "rate-limiter-flexible";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

export const redisClient = new Redis(redisUrl);

type CommonOpts = {
  storeClient: Redis;
  keyPrefix: string;
};

const commonOpts: CommonOpts = {
  storeClient: redisClient,
  keyPrefix: "rlflx",
};

// General (all GraphQL requests) - 200 requests per minute per key
export const rlGeneral = new RateLimiterRedis({
  points: 200,
  duration: 60,
  ...commonOpts,
});

// Mutations (stricter) - 20 per minute
export const rlMutations = new RateLimiterRedis({
  points: 20,
  duration: 60,
  ...commonOpts,
});

// Auth attempts - 5 per 10 minutes
export const rlAuth = new RateLimiterRedis({
  points: 5,
  duration: 10 * 60,
  ...commonOpts,
});

// Create-journey or join flows - 3 per hour
export const rlCreateJourney =
  process.env.NODE_ENV === "test"
    ? ({
        consume: async () => Promise.resolve(),
      } as unknown as RateLimiterRedis)
    : new RateLimiterRedis({
        points: 3,
        duration: 60 * 60,
        ...commonOpts,
      });

// Socket webhook per-journey (10/min) and per-key (100/min) can be created where needed.

export default {
  redisClient,
  rlGeneral,
  rlMutations,
  rlAuth,
  rlCreateJourney,
};

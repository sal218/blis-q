/**
 * Shared Upstash Redis client.
 *
 * Exported as a singleton — null when env vars are absent (local dev /
 * test environments without Redis configured).  Callers must handle the
 * null case gracefully (fall back to in-process state or allow-all).
 */

import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

let redisClient: Redis | null = null;

if (url && token && url.startsWith("https://")) {
  redisClient = new Redis({ url, token });
}

export { redisClient as redis };

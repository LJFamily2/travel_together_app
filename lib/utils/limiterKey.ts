/* eslint-disable @typescript-eslint/no-explicit-any */
/* Helper to build rate limiter keys from GraphQL context */

export function getRateLimiterKey(context: any, explicitUserId?: string) {
  const userId =
    explicitUserId || context?.user?.userId || context?.user?.id || null;
  const req = context?.req as { headers?: any } | undefined;
  const ip =
    req?.headers?.get?.("x-forwarded-for") ||
    req?.headers?.get?.("x-real-ip") ||
    req?.headers?.["x-forwarded-for"] ||
    req?.headers?.["x-real-ip"] ||
    "unknown";
  return userId ? `user:${userId}` : `ip:${ip}`;
}

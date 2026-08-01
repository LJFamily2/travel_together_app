import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { rlMutations } from "../rateLimiter";
import type { VoiceApiError } from "./types";

/**
 * Verifies the same appJwt used by the GraphQL layer (see lib/authOptions.ts /
 * app/api/graphql/route.ts). The client already sends this as
 * `Authorization: Bearer <jwt>` via Apollo's authLink reading the
 * "guestToken" cookie - these voice routes are called with plain fetch, so
 * we read the same header manually here rather than introduce a second auth
 * scheme.
 */
export function getVerifiedUserId(req: NextRequest): string | null {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || "";
  if (!token || token === "undefined" || token === "null") return null;

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not defined");
    return null;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as {
      userId?: string;
      id?: string;
    };
    return decoded.userId || decoded.id || null;
  } catch {
    return null;
  }
}

/**
 * Runs auth + rate limiting for a voice API route. Returns a NextResponse to
 * short-circuit with (401/429) if the request should be rejected, or the
 * verified userId to proceed with.
 *
 * Reuses rlMutations (20/min per user) - the same bucket the GraphQL layer
 * applies to addExpense and friends - since a voice request is a precursor
 * to the same mutation and calls paid OpenRouter APIs, so it deserves at
 * least as strict a limit as a direct mutation, not the more generous
 * rlGeneral bucket.
 */
export async function requireAuthAndRateLimit(
  req: NextRequest,
): Promise<{ userId: string } | NextResponse<VoiceApiError>> {
  const userId = getVerifiedUserId(req);
  if (!userId) {
    return NextResponse.json<VoiceApiError>(
      { error: "Unauthorized. Please sign in again." },
      { status: 401 },
    );
  }

  try {
    await rlMutations.consume(`user:${userId}`);
  } catch {
    return NextResponse.json<VoiceApiError>(
      { error: "Too many requests. Please slow down and try again shortly." },
      { status: 429 },
    );
  }

  return { userId };
}

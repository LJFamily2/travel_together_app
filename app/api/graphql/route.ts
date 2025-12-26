/* eslint-disable @typescript-eslint/no-explicit-any */
import { ApolloServer } from "@apollo/server";
/* Minimal ApolloError fallback to avoid adding dependency on apollo-server-errors */
class ApolloError extends Error {
  public extensions: { code?: string; [key: string]: any };
  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApolloError";
    this.extensions = {};
    if (code) this.extensions.code = code;
  }
}
import { startServerAndCreateNextHandler } from "@as-integrations/next";
import { NextRequest } from "next/server";
import typeDefs from "../../../lib/graphql/typeDefs";
import resolvers from "../../../lib/graphql/resolvers/index";
import dbConnect from "../../../lib/mongodb";
import { rlGeneral, rlCreateJourney } from "../../../lib/rateLimiter";
import jwt from "jsonwebtoken";

interface Context {
  req: NextRequest;
  user: any;
}

const server = new ApolloServer<Context>({
  typeDefs,
  resolvers,
});

const apiHandler = startServerAndCreateNextHandler<NextRequest, Context>(
  server,
  {
    context: async (req) => {
      await dbConnect();
      const token =
        req.headers.get("authorization")?.replace("Bearer ", "") || "";
      let user = null;
      if (token) {
        try {
          if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is not defined");
          }
          user = jwt.verify(token, process.env.JWT_SECRET);
        } catch (e) {
          console.error("Invalid token");
        }
      }

      // Rate limit: per-user (from JWT) or per-IP fallback
      try {
        const userId =
          user && (user as any).userId
            ? (user as any).userId
            : user && (user as any).id
            ? (user as any).id
            : null;
        const ip =
          req.headers.get("x-forwarded-for") ||
          req.headers.get("x-real-ip") ||
          "unknown";
        const key = userId ? `user:${userId}` : `ip:${ip}`;
        await rlGeneral.consume(key);
      } catch (e) {
        throw new ApolloError("Too many requests", "TOO_MANY_REQUESTS");
      }
      return { req, user, limiters: { rlCreateJourney } };
    },
  }
);

export async function GET(request: NextRequest) {
  return apiHandler(request);
}

export async function POST(request: NextRequest) {
  return apiHandler(request);
}

import { ApolloServer } from "@apollo/server";
import { startServerAndCreateNextHandler } from "@as-integrations/next";
import { NextRequest } from "next/server";
import typeDefs from "../../../lib/graphql/typeDefs";
import resolvers from "../../../lib/graphql/resolvers/index";
import dbConnect from "../../../lib/mongodb";
import jwt from "jsonwebtoken";

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

const apiHandler = startServerAndCreateNextHandler<NextRequest>(server, {
  context: async (req) => {
    await dbConnect();
    const token =
      req.headers.get("authorization")?.replace("Bearer ", "") || "";
    let user = null;
    if (token) {
      try {
        user = jwt.verify(token, process.env.JWT_SECRET || "fallback_secret");
      } catch (e) {
        console.error("Invalid token");
      }
    }
    return { req, user };
  },
});

export async function GET(request: NextRequest) {
  return apiHandler(request);
}

export async function POST(request: NextRequest) {
  return apiHandler(request);
}

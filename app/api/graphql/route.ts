import { ApolloServer } from "@apollo/server";
import { startServerAndCreateNextHandler } from "@as-integrations/next";
import { NextRequest } from "next/server";
import typeDefs from "../../../lib/graphql/typeDefs";
import resolvers from "../../../lib/graphql/resolvers/index";
import dbConnect from "../../../lib/mongodb";

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

const apiHandler = startServerAndCreateNextHandler<NextRequest>(server, {
  context: async (req) => {
    await dbConnect();
    return { req };
  },
});

export async function GET(request: NextRequest) {
  return apiHandler(request);
}

export async function POST(request: NextRequest) {
  return apiHandler(request);
}

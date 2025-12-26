import { jest } from "@jest/globals";

// Avoid importing ESM-only packages during test requires
jest.mock("nanoid", () => ({ nanoid: () => "fixedid" }));
jest.mock("../lib/mongodb", () => jest.fn());

// Tests for resolver-level rate limiter calls

describe("Resolver rate-limiting", () => {
  let journeysResolvers: any;
  let usersResolvers: any;
  let rlModule: any;

  beforeEach(() => {
    // Clear module cache and require fresh
    jest.resetModules();
    // Ensure dbConnect mock and other mocks are in place before require
    journeysResolvers = require("../lib/graphql/resolvers/journeys").default;
    usersResolvers = require("../lib/graphql/resolvers/users").default;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("createJourney throws TOO_MANY_REQUESTS when rlCreateJourney consumed", async () => {
    const mockLimiter = {
      consume: jest.fn().mockRejectedValue(new Error("limited")),
    };

    const ctx = {
      user: { userId: "u1" },
      req: { headers: { get: () => "1.2.3.4" } },
      limiters: { rlCreateJourney: mockLimiter },
    };

    await expect(
      journeysResolvers.Mutation.createJourney(
        null,
        { leaderId: "u1", name: "Trip 1" },
        ctx
      )
    ).rejects.toMatchObject({ extensions: { code: "TOO_MANY_REQUESTS" } });

    expect(mockLimiter.consume).toHaveBeenCalled();
  });

  test("joinAsGuest throws TOO_MANY_REQUESTS when rlCreateJourney consumed", async () => {
    const mockLimiter2 = {
      consume: jest.fn().mockRejectedValue(new Error("limited")),
    };
    const ctx2 = {
      req: { headers: { get: () => "9.9.9.9" } },
      limiters: { rlCreateJourney: mockLimiter2 },
    };

    await expect(
      usersResolvers.Mutation.joinAsGuest(
        null,
        { name: "Guest", journeyId: "j1" },
        ctx2
      )
    ).rejects.toMatchObject({ extensions: { code: "TOO_MANY_REQUESTS" } });

    expect(mockLimiter2.consume).toHaveBeenCalled();
  });

  test("createGuestUser throws TOO_MANY_REQUESTS when rlCreateJourney consumed", async () => {
    const mockLimiter3 = {
      consume: jest.fn().mockRejectedValue(new Error("limited")),
    };
    const ctx3 = {
      user: { userId: "uLeader" },
      limiters: { rlCreateJourney: mockLimiter3 },
    };

    await expect(
      usersResolvers.Mutation.createGuestUser(
        null,
        { journeyId: "j1", name: "G" },
        ctx3
      )
    ).rejects.toMatchObject({ extensions: { code: "TOO_MANY_REQUESTS" } });

    expect(mockLimiter3.consume).toHaveBeenCalled();
  });
});

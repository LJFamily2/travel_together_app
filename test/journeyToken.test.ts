import journeyResolvers from "../lib/graphql/resolvers/journeys";
import Journey from "../lib/models/Journey";
import User from "../lib/models/User";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";

// Mock dependencies
jest.mock("../lib/mongodb", () => jest.fn());
jest.mock("../lib/models/Journey");
jest.mock("../lib/models/User");
jest.mock("jsonwebtoken");
jest.mock("nanoid", () => ({ nanoid: jest.fn(() => "fixed-jti") }));

describe("Journey Token Resolvers", () => {
  const { generateJoinToken, joinJourneyViaToken } = journeyResolvers.Mutation;

  beforeEach(() => {
    jest.clearAllMocks();
    // Provide secret for jwt.sign in tests
    process.env.NEXTAUTH_SECRET = "test-secret";
  });

  it("should generate a join token and persist jti/expiry on journey", async () => {
    const mockJourneyId = "journey-123";
    const mockJourneyInstance: any = {
      _id: mockJourneyId,
      save: jest.fn().mockResolvedValue(true),
      joinTokenJti: null,
      joinTokenExpiresAt: null,
      joinTokenUsed: false,
    };
    (Journey.findById as jest.Mock).mockResolvedValue(mockJourneyInstance);
    (jwt.sign as jest.Mock).mockReturnValue("mock-join-token");

    const token = await generateJoinToken({}, { journeyId: mockJourneyId });
    expect(Journey.findById).toHaveBeenCalledWith(mockJourneyId);
    expect(nanoid).toHaveBeenCalled();
    // ensure we attempt to persist joinTokenJti/expires
    expect(mockJourneyInstance.joinTokenJti).toBeTruthy();
    expect(mockJourneyInstance.joinTokenExpiresAt).toBeTruthy();
    expect(mockJourneyInstance.joinTokenUsed).toBe(false);
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        journeyId: mockJourneyId,
        type: "join_token",
        jti: expect.any(String),
      }),
      expect.any(String),
      { expiresIn: "5m" }
    );
    expect(token).toBe("mock-join-token");
  });

  it("should atomically mark token used and allow join via token for guest", async () => {
    const mockJourneyId = "journey-321";
    const mockJti = "fixed-jti";
    const mockToken = "dummy-token";
    // mock jwt.verify to return payload
    (jwt.verify as jest.Mock).mockImplementation(() => ({
      journeyId: mockJourneyId,
      type: "join_token",
      jti: mockJti,
    }));

    // findOneAndUpdate returns a truthy object when token verification passes
    (Journey.findOneAndUpdate as unknown as jest.Mock).mockResolvedValue({
      _id: mockJourneyId,
    });
    const mockJourneyInstance: any = {
      _id: mockJourneyId,
      members: [],
      save: jest.fn().mockResolvedValue(true),
    };
    (Journey.findById as jest.Mock).mockResolvedValue(mockJourneyInstance);

    // Mock User creation
    const mockUserInstance: any = {
      _id: "507f1f77bcf86cd799439011",
      name: "Guest",
      isGuest: true,
      save: jest.fn().mockResolvedValue(true),
      toObject: jest.fn().mockReturnValue({ name: "Guest" }),
    };
    // New User should be created if not authenticated
    (User as unknown as jest.Mock).mockImplementation(() => mockUserInstance);

    // Mock jwt.sign for auth token returned to client
    (jwt.sign as jest.Mock).mockReturnValue("auth-jwt-token");

    const result = await joinJourneyViaToken(
      {},
      { token: mockToken, name: "Guest" },
      {}
    );
    expect(Journey.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: mockJourneyId, joinTokenJti: mockJti }),
      expect.objectContaining({
        $set: expect.objectContaining({ joinTokenUsed: true }),
      })
    );
    // guest user created
    expect(User).toHaveBeenCalled();
    // journey members updated and saved
    expect(mockJourneyInstance.save).toHaveBeenCalled();
    // auth token returned
    expect(result.token).toBe("auth-jwt-token");
  });

  it("should allow join via short jti token", async () => {
    const mockJourneyId = "journey-jti";
    const mockJti = "short-jti";
    const mockToken = mockJti; // jti-only token in QR

    // Simulate verify failing so we hit the jti-only branch
    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error("Invalid token");
    });

    // Simulate findOneAndUpdate matching by joinTokenJti
    (Journey.findOneAndUpdate as unknown as jest.Mock).mockResolvedValue({
      _id: mockJourneyId,
    });
    const mockJourneyInstance: any = {
      _id: mockJourneyId,
      members: [],
      save: jest.fn().mockResolvedValue(true),
    };
    (Journey.findById as jest.Mock).mockResolvedValue(mockJourneyInstance);

    // Mock User creation
    const mockUserInstance: any = {
      _id: "507f1f77bcf86cd799439012",
      name: "GuestJti",
      isGuest: true,
      save: jest.fn().mockResolvedValue(true),
      toObject: jest.fn().mockReturnValue({ name: "GuestJti" }),
    };
    (User as unknown as jest.Mock).mockImplementation(() => mockUserInstance);
    (jwt.sign as jest.Mock).mockReturnValue("auth-jwt-token-jti");

    const result = await joinJourneyViaToken(
      {},
      { token: mockToken, name: "GuestJti" },
      {}
    );
    expect(Journey.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ joinTokenJti: mockJti }),
      expect.objectContaining({
        $set: expect.objectContaining({ joinTokenUsed: true }),
      })
    );
    expect(mockJourneyInstance.save).toHaveBeenCalled();
    expect(result.token).toBe("auth-jwt-token-jti");
  });

  it("should reject already-used token", async () => {
    const mockJourneyId = "journey-1234";
    const mockJti = "fixed-jti";
    const mockToken = "dummy-token";
    (jwt.verify as jest.Mock).mockImplementation(() => ({
      journeyId: mockJourneyId,
      type: "join_token",
      jti: mockJti,
    }));

    // Simulate token already used by returning null
    (Journey.findOneAndUpdate as unknown as jest.Mock).mockResolvedValue(null);

    await expect(
      joinJourneyViaToken({}, { token: mockToken, name: "Guest" }, {})
    ).rejects.toThrow("Invalid or used token");
    expect(Journey.findOneAndUpdate).toHaveBeenCalled();
  });
});

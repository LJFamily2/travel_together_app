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
    };
    (Journey.findById as jest.Mock).mockResolvedValue(mockJourneyInstance);
    (jwt.sign as jest.Mock).mockReturnValue("mock-join-token");

    const token = await generateJoinToken({}, { journeyId: mockJourneyId });
    expect(Journey.findById).toHaveBeenCalledWith(mockJourneyId);
    expect(nanoid).toHaveBeenCalled();
    // ensure we attempt to persist joinTokenJti/expires
    expect(mockJourneyInstance.joinTokenJti).toBeTruthy();
    expect(mockJourneyInstance.joinTokenExpiresAt).toBeTruthy();
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

  it("should allow join via token for guest", async () => {
    const mockJourneyId = "journey-321";
    const mockJti = "fixed-jti";
    const mockToken = "dummy-token";
    // mock jwt.verify to return payload
    (jwt.verify as jest.Mock).mockImplementation(() => ({
      journeyId: mockJourneyId,
      type: "join_token",
      jti: mockJti,
    }));

    const mockJourneyInstance: any = {
      _id: mockJourneyId,
      members: [],
      rejectedMembers: [],
      pendingMembers: [],
      isLocked: false,
      save: jest.fn().mockResolvedValue(true),
    };

    // Mock findOne to return the journey (valid token)
    (Journey.findOne as jest.Mock).mockResolvedValue(mockJourneyInstance);
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
    // Mock User.find for name uniqueness check
    (User.find as jest.Mock).mockResolvedValue([]);

    // Mock jwt.sign for auth token returned to client
    (jwt.sign as jest.Mock).mockReturnValue("auth-jwt-token");

    const result = await joinJourneyViaToken(
      {},
      { token: mockToken, name: "Guest" },
      {}
    );

    expect(Journey.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: mockJourneyId,
        joinTokenJti: mockJti,
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

    const mockJourneyInstance: any = {
      _id: mockJourneyId,
      members: [],
      rejectedMembers: [],
      pendingMembers: [],
      isLocked: false,
      save: jest.fn().mockResolvedValue(true),
    };

    // Mock findOne to return the journey (valid jti)
    (Journey.findOne as jest.Mock).mockResolvedValue(mockJourneyInstance);
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
    (User.find as jest.Mock).mockResolvedValue([]);
    (jwt.sign as jest.Mock).mockReturnValue("auth-jwt-token-jti");

    const result = await joinJourneyViaToken(
      {},
      { token: mockToken, name: "GuestJti" },
      {}
    );

    expect(Journey.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        joinTokenJti: mockJti,
      })
    );
    expect(mockJourneyInstance.save).toHaveBeenCalled();
    expect(result.token).toBe("auth-jwt-token-jti");
  });

  it("should reject expired or invalid token", async () => {
    const mockJourneyId = "journey-1234";
    const mockJti = "fixed-jti";
    const mockToken = "dummy-token";
    (jwt.verify as jest.Mock).mockImplementation(() => ({
      journeyId: mockJourneyId,
      type: "join_token",
      jti: mockJti,
    }));

    // Simulate token not found (expired or invalid)
    (Journey.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      joinJourneyViaToken({}, { token: mockToken, name: "Guest" }, {})
    ).rejects.toThrow("Invalid or expired token");
  });
});

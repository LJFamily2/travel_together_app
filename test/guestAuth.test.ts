import userResolvers from "../lib/graphql/resolvers/users";
import User from "../lib/models/User";
import Journey from "../lib/models/Journey";
import jwt from "jsonwebtoken";

// Mock dependencies
jest.mock("../lib/mongodb", () => jest.fn());
jest.mock("../lib/models/User");
jest.mock("../lib/models/Journey");
jest.mock("jsonwebtoken");

describe("Guest Authentication Resolver", () => {
  const { joinAsGuest } = userResolvers.Mutation;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
  });

  it("should create a guest user, add to journey, and return token", async () => {
    // Arrange
    const mockJourneyId = "journey-123";
    const mockUserName = "Guest User";
    const mockUserId = "user-456";
    const mockToken = "mock-jwt-token";

    // Mock User creation
    const mockUserInstance = {
      _id: mockUserId,
      name: mockUserName,
      isGuest: true,
      save: jest.fn().mockResolvedValue(true),
    };
    (User as unknown as jest.Mock).mockImplementation(() => mockUserInstance);

    // Mock Journey finding and updating
    const mockJourneyInstance = {
      _id: mockJourneyId,
      members: [],
      save: jest.fn().mockResolvedValue(true),
      populate: jest.fn().mockReturnThis(),
    };
    (Journey.findById as jest.Mock).mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockJourneyInstance),
    });

    // Mock JWT signing
    (jwt.sign as jest.Mock).mockReturnValue(mockToken);

    // Act
    const result = await joinAsGuest(
      {},
      { name: mockUserName, journeyId: mockJourneyId }
    );

    // Assert
    // 1. Check User creation
    expect(User).toHaveBeenCalledWith({
      name: mockUserName,
      isGuest: true,
    });
    expect(mockUserInstance.save).toHaveBeenCalled();

    // 2. Check Journey update (findByIdAndUpdate should have been called to $push the new member)
    expect(Journey.findById).toHaveBeenCalledWith(mockJourneyId);
    expect(Journey.findByIdAndUpdate).toHaveBeenCalledWith(mockJourneyId, {
      $push: { members: mockUserId },
    });

    // 3. Check JWT generation
    expect(jwt.sign).toHaveBeenCalledWith(
      { userId: mockUserId, isGuest: true, journeyId: mockJourneyId },
      expect.any(String), // secret
      { expiresIn: "30d" }
    );

    // 4. Check Result
    expect(result).toEqual({
      token: mockToken,
      user: mockUserInstance,
    });
  });

  it("should throw error if journey is not found", async () => {
    // Arrange
    const mockJourneyId = "invalid-journey";
    const mockUserName = "Guest User";

    // Mock User creation (still happens before journey check in current implementation)
    const mockUserInstance = {
      _id: "user-456",
      save: jest.fn().mockResolvedValue(true),
    };
    (User as unknown as jest.Mock).mockImplementation(() => mockUserInstance);

    // Mock Journey not found
    (Journey.findById as jest.Mock).mockReturnValue({
      populate: jest.fn().mockResolvedValue(null),
    });

    // Act & Assert
    await expect(
      joinAsGuest({}, { name: mockUserName, journeyId: mockJourneyId })
    ).rejects.toThrow("Journey not found");
  });
});

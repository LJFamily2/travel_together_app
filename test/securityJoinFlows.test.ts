import journeyResolvers from "../lib/graphql/resolvers/journeys";
import Journey from "../lib/models/Journey";
import User from "../lib/models/User";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import mongoose from "mongoose";

// Mock dependencies
jest.mock("../lib/mongodb", () => jest.fn());
jest.mock("../lib/models/Journey");
jest.mock("../lib/models/User");
jest.mock("jsonwebtoken");
jest.mock("bcryptjs");
jest.mock("nanoid", () => ({ nanoid: jest.fn(() => "fixed-jti") }));
jest.mock("../lib/utils/notifySocket", () => ({
  notifyJourneyUpdate: jest.fn(),
}));
jest.mock("../lib/utils/expiration", () => ({
  refreshJourneyExpiration: jest.fn(),
  calculateJwtExpiration: jest.fn(() => 30 * 24 * 60 * 60),
}));

describe("Join Flow Security Tests", () => {
  const { joinJourneyViaToken, toggleApprovalRequirement } =
    journeyResolvers.Mutation;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
  });

  describe("Host Approval Flow", () => {
    it("should enforce approval when enabled via toggle", async () => {
      const mockJourneyId = "journey-approval-lifecycle";
      const mockToken = "valid-token";

      // 1. Setup Journey Mock (Initially approval OFF)
      const mockJourneyInstance: any = {
        _id: mockJourneyId,
        slug: "test-journey",
        requireApproval: false,
        members: [],
        pendingMembers: [],
        save: jest.fn().mockResolvedValue(true),
        toObject: jest.fn().mockReturnValue({ slug: "test-journey" }),
      };

      (Journey.findById as jest.Mock).mockResolvedValue(mockJourneyInstance);

      // 2. Toggle Approval ON
      await toggleApprovalRequirement(
        {},
        { journeyId: mockJourneyId, requireApproval: true }
      );

      expect(mockJourneyInstance.requireApproval).toBe(true);

      // 3. Prepare for Join
      // IMPORTANT: Ensure findOne returns the updated instance
      (Journey.findOne as jest.Mock).mockResolvedValue(mockJourneyInstance);

      (jwt.verify as jest.Mock).mockReturnValue({
        journeyId: mockJourneyId,
        type: "join_token",
        jti: "fixed-jti",
      });

      const mockUserInstance: any = {
        _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
        name: "Guest Pending",
        isGuest: true,
        save: jest.fn().mockResolvedValue(true),
        toObject: jest.fn().mockReturnValue({ name: "Guest Pending" }),
      };
      (User as unknown as jest.Mock).mockImplementation(() => mockUserInstance);
      (User.find as jest.Mock).mockResolvedValue([]); // Mock finding existing users for name check

      // 4. Join with Token
      (jwt.sign as jest.Mock).mockReturnValue("mock-auth-token"); // Mock sign for the token return

      const result = await joinJourneyViaToken(
        {},
        { token: mockToken, name: "Guest Pending" },
        {}
      );

      // 5. Verify Result
      expect(result.isPending).toBe(true);
      expect(result.token).toBeDefined(); // Should return a token now
      expect(mockJourneyInstance.pendingMembers).toHaveLength(1);
      expect(mockJourneyInstance.members).toHaveLength(0);

      // 6. Verify Loop Prevention (Retry with token)
      // The client will now have the token and send it in the header (context)
      const userId = result.user.id.toString();

      // Reset mocks
      mockJourneyInstance.save.mockClear();
      const notifyMock =
        require("../lib/utils/notifySocket").notifyJourneyUpdate;
      notifyMock.mockClear();

      // Mock User.findById for the second call
      (User.findById as jest.Mock).mockResolvedValue(mockUserInstance);

      // Call again with user context
      const resultRetry = await joinJourneyViaToken(
        {},
        { token: mockToken, name: "Guest Pending" },
        { user: { userId } }
      );

      expect(resultRetry.isPending).toBe(true);
      // Should NOT have called save (no new pending member added)
      expect(mockJourneyInstance.save).not.toHaveBeenCalled();
      // Should NOT have notified (no update needed)
      expect(notifyMock).not.toHaveBeenCalled();
    });
  });
});

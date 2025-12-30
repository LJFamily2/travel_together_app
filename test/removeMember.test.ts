import journeyResolvers from "../lib/graphql/resolvers/journeys";
import Journey from "../lib/models/Journey";

// Mock dependencies
jest.mock("../lib/mongodb", () => jest.fn());
jest.mock("../lib/models/Journey");
jest.mock("nanoid", () => ({ nanoid: jest.fn(() => "fixed-id") }));

describe("Journey Resolvers - removeMember", () => {
  const { removeMember } = journeyResolvers.Mutation;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should remove a member if requester is leader", async () => {
    const mockJourneyId = "journey-123";
    const mockLeaderId = "leader-1";
    const mockMemberId = "member-2";

    const mockJourney = {
      _id: mockJourneyId,
      leaderId: mockLeaderId,
      members: [mockLeaderId, mockMemberId],
      save: jest.fn().mockResolvedValue(true),
      populate: jest.fn().mockReturnThis(),
    };

    (Journey.findById as jest.Mock).mockResolvedValue(mockJourney);

    const context = { user: { userId: mockLeaderId } };
    await removeMember(
      {},
      { journeyId: mockJourneyId, memberId: mockMemberId },
      context
    );

    expect(Journey.findById).toHaveBeenCalledWith(mockJourneyId);
    expect(mockJourney.members).toEqual([mockLeaderId]);
    expect(mockJourney.save).toHaveBeenCalled();
  });

  it("should throw error if requester is not leader", async () => {
    const mockJourneyId = "journey-123";
    const mockLeaderId = "leader-1";
    const mockMemberId = "member-2";
    const mockOtherUserId = "user-3";

    const mockJourney = {
      _id: mockJourneyId,
      leaderId: mockLeaderId,
      members: [mockLeaderId, mockMemberId],
    };

    (Journey.findById as jest.Mock).mockResolvedValue(mockJourney);

    const context = { user: { userId: mockOtherUserId } };
    await expect(
      removeMember(
        {},
        { journeyId: mockJourneyId, memberId: mockMemberId },
        context
      )
    ).rejects.toThrow("Only the leader can remove members");
  });

  it("should throw error if trying to remove leader", async () => {
    const mockJourneyId = "journey-123";
    const mockLeaderId = "leader-1";

    const mockJourney = {
      _id: mockJourneyId,
      leaderId: mockLeaderId,
      members: [mockLeaderId],
    };

    (Journey.findById as jest.Mock).mockResolvedValue(mockJourney);

    const context = { user: { userId: mockLeaderId } };
    await expect(
      removeMember(
        {},
        { journeyId: mockJourneyId, memberId: mockLeaderId },
        context
      )
    ).rejects.toThrow("Leader cannot be removed");
  });
});

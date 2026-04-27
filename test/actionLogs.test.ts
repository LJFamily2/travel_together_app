import journeyResolvers from "../lib/graphql/resolvers/journeys";
import Journey from "../lib/models/Journey";
import ActionLog from "../lib/models/ActionLog";
import { logJourneyAction } from "../lib/utils/actionLog";

jest.mock("../lib/mongodb", () => jest.fn());
jest.mock("../lib/models/Journey");
jest.mock("../lib/models/ActionLog");
jest.mock("nanoid", () => ({ nanoid: jest.fn(() => "fixed-jti") }));
jest.mock("../lib/utils/actionLog", () => ({
  logJourneyAction: jest.fn().mockResolvedValue(undefined),
}));

describe("Journey action log resolvers", () => {
  const { getJourneyActions } = journeyResolvers.Query;
  const { toggleApprovalRequirement } = journeyResolvers.Mutation;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns action logs for authorized members", async () => {
    const logs = [{ _id: "log-1", action: "JOIN_TOKEN_GENERATED" }];
    const limit = jest.fn().mockResolvedValue(logs);
    const sort = jest.fn().mockReturnValue({ limit });

    (Journey.findById as jest.Mock).mockResolvedValue({
      leaderId: "leader-1",
      members: ["member-1"],
    });
    (ActionLog.find as jest.Mock).mockReturnValue({ sort });

    const result = await getJourneyActions(
      {},
      { journeyId: "journey-1", limit: 20 },
      { user: { userId: "member-1" } },
    );

    expect(ActionLog.find).toHaveBeenCalledWith({ journeyId: "journey-1" });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(limit).toHaveBeenCalledWith(20);
    expect(result).toEqual(logs);
  });

  it("writes action log when leader toggles approval requirement", async () => {
    const journeyInstance: any = {
      _id: "journey-2",
      leaderId: "leader-1",
      requireApproval: false,
      expireAt: null,
      save: jest.fn().mockResolvedValue(true),
    };

    (Journey.findById as jest.Mock).mockResolvedValue(journeyInstance);

    await toggleApprovalRequirement(
      {},
      { journeyId: "journey-2", requireApproval: true },
      { user: { userId: "leader-1" } },
    );

    expect(logJourneyAction).toHaveBeenCalledWith(
      expect.objectContaining({
        journeyId: "journey-2",
        action: "APPROVAL_REQUIREMENT_TOGGLED",
        actorId: "leader-1",
      }),
    );
  });
});

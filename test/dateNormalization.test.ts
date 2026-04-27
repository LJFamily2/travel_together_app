import journeyResolvers from "../lib/graphql/resolvers/journeys";
import Journey from "../lib/models/Journey";

jest.mock("../lib/mongodb", () => jest.fn());
jest.mock("../lib/models/Journey");
jest.mock("../lib/utils/actionLog", () => ({
  logJourneyAction: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("slugify", () => jest.fn(() => "sample-trip"));
jest.mock("nanoid", () => ({ nanoid: jest.fn(() => "abc123") }));

describe("Journey date normalization", () => {
  const { createJourney, updateJourney } = journeyResolvers.Mutation;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("normalizes date-only createJourney endDate to end-of-day UTC", async () => {
    const mockSave = jest.fn().mockResolvedValue(true);
    const mockPopulate = jest.fn().mockResolvedValue({ id: "journey-1" });
    let payload: any = null;

    (Journey as unknown as jest.Mock).mockImplementation((data: any) => {
      payload = data;
      return {
        ...data,
        _id: "journey-1",
        save: mockSave,
        populate: mockPopulate,
      };
    });

    await createJourney(
      {},
      {
        leaderId: "507f1f77bcf86cd799439011",
        name: "Sample Trip",
        startDate: "2026-05-01",
        endDate: "2026-05-10",
      },
      {
        limiters: {
          rlCreateJourney: {
            consume: jest.fn().mockResolvedValue(true),
          },
        },
      },
    );

    expect(payload.startDate).toBeInstanceOf(Date);
    expect(payload.endDate).toBeInstanceOf(Date);
    expect(payload.startDate.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(payload.endDate.toISOString()).toBe("2026-05-10T23:59:59.999Z");
  });

  it("normalizes date-only updateJourney endDate to end-of-day UTC", async () => {
    const journeyInstance: any = {
      _id: "journey-2",
      leaderId: "leader-1",
      name: "Old name",
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      endDate: new Date("2026-05-05T00:00:00.000Z"),
      expireAt: null,
      save: jest.fn().mockResolvedValue(true),
      populate: jest.fn().mockResolvedValue({ id: "journey-2" }),
    };

    (Journey.findById as jest.Mock).mockResolvedValue(journeyInstance);

    await updateJourney(
      {},
      {
        journeyId: "journey-2",
        endDate: "2026-05-20",
      },
      { user: { userId: "leader-1" } },
    );

    expect(journeyInstance.endDate).toBeInstanceOf(Date);
    expect(journeyInstance.endDate.toISOString()).toBe(
      "2026-05-20T23:59:59.999Z",
    );
    expect(journeyInstance.save).toHaveBeenCalled();
  });
});

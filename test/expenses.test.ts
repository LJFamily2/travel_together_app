import expenseResolvers from "../lib/graphql/resolvers/expenses";
import Expense from "../lib/models/Expense";
import Journey from "../lib/models/Journey";

jest.mock("../lib/mongodb", () => jest.fn());
jest.mock("../lib/models/Expense");
jest.mock("../lib/models/Journey");

jest.mock("../lib/utils/expiration", () => ({
  refreshJourneyExpiration: jest.fn().mockResolvedValue(null),
}));
jest.mock("../lib/utils/actionLog", () => ({
  logJourneyAction: jest.fn().mockResolvedValue(undefined),
}));

describe("Expense resolvers - addExpense", () => {
  const { addExpense } = expenseResolvers.Mutation;

  beforeEach(() => {
    jest.clearAllMocks();
    (Journey.findById as jest.Mock).mockResolvedValue({
      isInputLocked: false,
      endDate: null,
    });
  });

  it("accepts deduction-style splits (base amounts 0, deduction equals total)", async () => {
    const journeyId = "journey-1";
    const payerId = "507f1f77bcf86cd799439011";
    const totalAmount = 200000;

    // Mock Expense constructor to capture input and provide save/populate
    const mockSave = jest.fn().mockResolvedValue(true);
    const mockPopulate = jest
      .fn()
      .mockResolvedValue({ id: "exp-1", totalAmount });

    (Expense as unknown as jest.Mock).mockImplementation((data: any) => ({
      ...data,
      save: mockSave,
      populate: mockPopulate,
    }));

    const splits = [
      {
        userId: "507f1f77bcf86cd799439012",
        baseAmount: 0,
        deduction: totalAmount,
        reason: "Deduction",
      },
      {
        userId: "507f1f77bcf86cd799439011",
        baseAmount: 0,
        deduction: 0,
        reason: "Creator",
      },
    ];

    const result = await addExpense(
      {},
      { journeyId, payerId, totalAmount, description: "Deduction", splits },
      {} as any,
    );

    expect(mockSave).toHaveBeenCalled();
    expect(result).toEqual({ id: "exp-1", totalAmount });
  });

  it("throws when sum of splits (base + deduction) does not match total", async () => {
    const journeyId = "journey-1";
    const payerId = "507f1f77bcf86cd799439011";
    const totalAmount = 200000;

    const splits = [
      {
        userId: "507f1f77bcf86cd799439012",
        baseAmount: 0,
        deduction: 0,
        reason: "Bad",
      },
      {
        userId: "507f1f77bcf86cd799439011",
        baseAmount: 0,
        deduction: 0,
        reason: "Creator",
      },
    ];

    await expect(
      addExpense(
        {},
        { journeyId, payerId, totalAmount, description: "Bad", splits },
        {} as any,
      ),
    ).rejects.toThrow(/must equal the total amount/);
  });
});

describe("Expense resolvers - updateExpense & deleteExpense", () => {
  const { updateExpense, deleteExpense } = expenseResolvers.Mutation;

  beforeEach(() => {
    jest.clearAllMocks();
    (Journey.findById as jest.Mock).mockResolvedValue({
      isInputLocked: false,
      endDate: null,
      leaderId: "leader-1",
      expireAt: null,
    });
  });

  it("allows the payer to edit a deduction split and updates total", async () => {
    const expenseId = "exp-1";
    const payerId = "507f1f77bcf86cd799439011";

    const mockSave = jest.fn().mockResolvedValue(true);
    const mockPopulate = jest
      .fn()
      .mockResolvedValue({ id: expenseId, totalAmount: 150000 });

    const existingExpense: any = {
      _id: expenseId,
      payerId,
      journeyId: "journey-1",
      totalAmount: 200000,
      splits: [
        {
          userId: "507f1f77bcf86cd799439012",
          baseAmount: 0,
          deduction: 200000,
          reason: "Deduction",
        },
        {
          userId: "507f1f77bcf86cd799439011",
          baseAmount: 0,
          deduction: 0,
          reason: "Creator",
        },
      ],
      save: mockSave,
      populate: mockPopulate,
    };

    (Expense.findById as jest.Mock).mockResolvedValue(existingExpense);

    const newSplits = [
      {
        userId: "507f1f77bcf86cd799439012",
        baseAmount: 0,
        deduction: 150000,
        reason: "Adj",
      },
      {
        userId: "507f1f77bcf86cd799439011",
        baseAmount: 0,
        deduction: 0,
        reason: "Creator",
      },
    ];

    const result = await updateExpense(
      {},
      { expenseId, splits: newSplits, totalAmount: 150000 },
      { user: { userId: payerId } },
    );

    expect(mockSave).toHaveBeenCalled();
    expect(result).toEqual({ id: expenseId, totalAmount: 150000 });
  });

  it("throws when a non-payer attempts to edit", async () => {
    const expenseId = "exp-1";
    const payerId = "507f1f77bcf86cd799439011";

    const existingExpense: any = {
      _id: expenseId,
      payerId,
      journeyId: "journey-1",
      totalAmount: 200000,
      splits: [],
      save: jest.fn().mockResolvedValue(true),
    };

    (Expense.findById as jest.Mock).mockResolvedValue(existingExpense);

    await expect(
      updateExpense(
        {},
        { expenseId, splits: [] as any, totalAmount: 0 },
        { user: { userId: "other-user" } },
      ),
    ).rejects.toThrow(/Unauthorized/);
  });

  it("allows the journey leader to edit another member expense", async () => {
    const expenseId = "exp-owner-edit";
    const payerId = "507f1f77bcf86cd799439011";

    const existingExpense: any = {
      _id: expenseId,
      payerId,
      journeyId: "journey-1",
      totalAmount: 100,
      description: "Lunch",
      splits: [
        {
          userId: "507f1f77bcf86cd799439012",
          baseAmount: 100,
          deduction: 0,
        },
      ],
      save: jest.fn().mockResolvedValue(true),
      populate: jest
        .fn()
        .mockResolvedValue({ id: expenseId, totalAmount: 120 }),
    };

    (Expense.findById as jest.Mock).mockResolvedValue(existingExpense);

    const result = await updateExpense(
      {},
      { expenseId, totalAmount: 120 },
      { user: { userId: "leader-1" } },
    );

    expect(existingExpense.save).toHaveBeenCalled();
    expect(result).toEqual({ id: expenseId, totalAmount: 120 });
  });

  it("allows the payer to delete a deduction expense", async () => {
    const expenseId = "exp-1";
    const payerId = "507f1f77bcf86cd799439011";

    const existingExpense: any = {
      _id: expenseId,
      payerId,
      journeyId: "journey-1",
      totalAmount: 100,
      splits: [],
    };

    (Expense.findById as jest.Mock).mockResolvedValue(existingExpense);
    (Expense.findByIdAndDelete as jest.Mock) = jest
      .fn()
      .mockResolvedValue(true);

    const result = await deleteExpense(
      {},
      { expenseId },
      { user: { userId: payerId } },
    );

    expect(result).toBe(true);
  });

  it("throws when a non-payer attempts to delete", async () => {
    const expenseId = "exp-1";
    const payerId = "507f1f77bcf86cd799439011";

    const existingExpense: any = {
      _id: expenseId,
      payerId,
      journeyId: "journey-1",
      totalAmount: 100,
      splits: [],
    };

    (Expense.findById as jest.Mock).mockResolvedValue(existingExpense);

    await expect(
      deleteExpense({}, { expenseId }, { user: { userId: "other-user" } }),
    ).rejects.toThrow(/Unauthorized/);
  });

  it("allows the journey leader to delete another member expense", async () => {
    const expenseId = "exp-owner-delete";
    const payerId = "507f1f77bcf86cd799439011";

    const existingExpense: any = {
      _id: expenseId,
      payerId,
      journeyId: "journey-1",
      totalAmount: 90,
      description: "Taxi",
      splits: [],
    };

    (Expense.findById as jest.Mock).mockResolvedValue(existingExpense);
    (Expense.findByIdAndDelete as jest.Mock) = jest
      .fn()
      .mockResolvedValue(true);

    const result = await deleteExpense(
      {},
      { expenseId },
      { user: { userId: "leader-1" } },
    );

    expect(result).toBe(true);
  });
});

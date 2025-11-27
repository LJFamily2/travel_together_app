import dbConnect from "../mongodb";
import User from "../models/User";
import Journey from "../models/Journey";
import Expense from "../models/Expense";

const resolvers = {
  Query: {
    getJourneyDetails: async (
      _: unknown,
      { journeyId }: { journeyId: string },
    ) => {
      await dbConnect();
      // TODO: Implement privacy logic here (filter out Total Spend for others)
      // For now, just returning the journey with populated fields
      const journey = await Journey.findById(journeyId)
        .populate("leaderId")
        .populate("members");
      if (!journey) throw new Error("Journey not found");

      // Fetch expenses for this journey
      const expenses = await Expense.find({ journeyId })
        .populate("payerId")
        .populate("splits.userId");

      return { ...journey.toObject(), id: journey._id, expenses };
    },
    getUsers: async () => {
      await dbConnect();
      return await User.find({});
    },
  },
  Mutation: {
    createJourney: async (
      _: unknown,
      {
        leaderId,
        name,
        startDate,
        endDate,
      }: {
        leaderId: string;
        name: string;
        startDate?: string;
        endDate?: string;
      }
    ) => {
      await dbConnect();
      const newJourney = new Journey({
        leaderId,
        name,
        startDate,
        endDate,
        members: [leaderId], // Leader is automatically a member
        status: "active",
      });
      await newJourney.save();
      return await newJourney.populate("leaderId");
    },
    joinJourney: async (
      _: unknown,
      { journeyId, userId }: { journeyId: string; userId: string }
    ) => {
      await dbConnect();
      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      if (!journey.members.includes(userId as never)) {
        journey.members.push(userId as never);
        await journey.save();
      }
      return await journey.populate("members");
    },
    addExpense: async (
      _: unknown,
      { journeyId, payerId, totalAmount, description, splits }: never
    ) => {
      await dbConnect();
      // Logic check: (Split Amount) - (Deduction) = Final Owed is handled in UI or calculation,
      // here we just store the data.
      // However, we should validate that sum of baseAmounts equals totalAmount if required,
      // or just trust the input.

      const newExpense = new Expense({
        journeyId,
        payerId,
        totalAmount,
        description,
        splits,
      });
      await newExpense.save();
      return await newExpense.populate("payerId");
    },
    updateExpense: async (
      _: unknown,
      { expenseId, totalAmount, description, splits }: never
    ) => {
      await dbConnect();
      const expense = await Expense.findById(expenseId);
      if (!expense) throw new Error("Expense not found");

      if (totalAmount) expense.totalAmount = totalAmount;
      if (description) expense.description = description;
      if (splits) expense.splits = splits;

      await expense.save();
      return await expense.populate("payerId");
    },
    // --- NEW: Add this mutation ---
    createUser: async (
      _: unknown,
      { name, email }: { name: string; email?: string }
    ) => {
      await dbConnect();
      const newUser = new User({ name, email, isGuest: false });
      await newUser.save();
      return newUser;
    },
  },

  Journey: {
    expenses: async (parent: any) => {
      await dbConnect();
      return await Expense.find({ journeyId: parent.id })
        .populate("payerId")
        .populate("splits.userId");
    },
    leader: (parent: any) => parent.leaderId,
  },
  Expense: {
    payer: (parent: any) => parent.payerId,
  },
  Split: {
    user: (parent: any) => parent.userId,
  },
  BankInfo: {
    qrcode: (parent: any) => {
      if (parent.qrcode && Buffer.isBuffer(parent.qrcode)) {
        return parent.qrcode.toString("base64");
      }
      return parent.qrcode;
    },
  },
};

export default resolvers;

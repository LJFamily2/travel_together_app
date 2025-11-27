import mongoose from "mongoose";
import dbConnect from "../../mongodb";
import Expense, { IExpense } from "../../models/Expense";
import { notifyJourneyUpdate } from "../../utils/notifySocket";

interface SplitInput {
  userId: string;
  baseAmount: number;
  deduction?: number;
  reason?: string;
}

const expenseResolvers = {
  Mutation: {
    addExpense: async (
      _: unknown,
      {
        journeyId,
        payerId,
        totalAmount,
        description,
        splits,
      }: {
        journeyId: string;
        payerId: string;
        totalAmount: number;
        description: string;
        splits: SplitInput[];
      }
    ) => {
      await dbConnect();
      // Logic check: (Split Amount) - (Deduction) = Final Owed is handled in UI or calculation,
      // here we just store the data.

      const newExpense = new Expense({
        journeyId,
        payerId,
        totalAmount,
        description,
        splits: splits.map((s) => ({
          userId: new mongoose.Types.ObjectId(s.userId),
          baseAmount: s.baseAmount,
          deduction: s.deduction || 0,
          reason: s.reason,
        })),
      });
      await newExpense.save();

      // Notify socket server about the update
      await notifyJourneyUpdate(journeyId);

      return await newExpense.populate("payerId");
    },
    updateExpense: async (
      _: unknown,
      {
        expenseId,
        totalAmount,
        description,
        splits,
      }: {
        expenseId: string;
        totalAmount?: number;
        description?: string;
        splits?: SplitInput[];
      }
    ) => {
      await dbConnect();
      const expense = await Expense.findById(expenseId);
      if (!expense) throw new Error("Expense not found");

      if (totalAmount) expense.totalAmount = totalAmount;
      if (description) expense.description = description;
      if (splits) {
        expense.splits = splits.map((s) => ({
          userId: new mongoose.Types.ObjectId(s.userId),
          baseAmount: s.baseAmount,
          deduction: s.deduction || 0,
          reason: s.reason,
        }));
      }

      await expense.save();

      // Notify socket server about the update
      // We need journeyId, which is in the expense document
      await notifyJourneyUpdate(expense.journeyId.toString());

      return await expense.populate("payerId");
    },
  },
  Expense: {
    payer: (parent: IExpense) => parent.payerId,
  },
  Split: {
    user: (parent: { userId: string }) => parent.userId,
  },
};

export default expenseResolvers;

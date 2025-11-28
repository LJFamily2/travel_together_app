import mongoose from "mongoose";
import dbConnect from "../../mongodb";
import Expense, { IExpense } from "../../models/Expense";
import User from "../../models/User";
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
        imageBase64,
      }: {
        journeyId: string;
        payerId: string;
        totalAmount: number;
        description: string;
        splits: SplitInput[];
        imageBase64?: string;
      }
    ) => {
      await dbConnect();
      // Logic check: (Split Amount) - (Deduction) = Final Owed is handled in UI or calculation,
      // here we just store the data.

      let imageBuffer;
      if (imageBase64) {
        // Remove data:image/jpeg;base64, prefix if present
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        imageBuffer = Buffer.from(base64Data, "base64");
      }

      const newExpense = new Expense({
        journeyId,
        payerId,
        totalAmount,
        description,
        imageBinary: imageBuffer,
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
        payerId,
        totalAmount,
        description,
        splits,
        imageBase64,
      }: {
        expenseId: string;
        payerId?: string;
        totalAmount?: number;
        description?: string;
        splits?: SplitInput[];
        imageBase64?: string;
      },
      context: { user?: { userId?: string } }
    ) => {
      await dbConnect();
      const expense = await Expense.findById(expenseId);
      if (!expense) throw new Error("Expense not found");

      // Authorization: only the payer can change the expense
      const requesterId = context?.user?.userId;
      if (!requesterId || String(requesterId) !== String(expense.payerId)) {
        throw new Error(
          "Unauthorized: only the payer can update this expense."
        );
      }

      if (payerId) expense.payerId = new mongoose.Types.ObjectId(payerId);
      if (description) expense.description = description;

      if (imageBase64) {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        expense.imageBinary = Buffer.from(base64Data, "base64");
      }

      if (splits) {
        expense.splits = splits.map((s) => ({
          userId: new mongoose.Types.ObjectId(s.userId),
          baseAmount: s.baseAmount,
          deduction: s.deduction || 0,
          reason: s.reason,
        }));
        if (totalAmount !== undefined) {
          expense.totalAmount = totalAmount;
        }
      } else if (totalAmount !== undefined && totalAmount !== null) {
        // If splits are not being replaced, scale existing splits proportionally
        const oldTotal = expense.totalAmount || 0;
        if (oldTotal > 0) {
          const ratio = totalAmount / oldTotal;
          expense.splits = expense.splits.map((s: any) => ({
            userId: s.userId,
            baseAmount:
              Math.round((s.baseAmount * ratio + Number.EPSILON) * 100) / 100,
            deduction:
              Math.round(((s.deduction || 0) * ratio + Number.EPSILON) * 100) /
              100,
            reason: s.reason,
          }));
        }
        expense.totalAmount = totalAmount;
      }

      await expense.save();

      // Notify socket server about the update
      await notifyJourneyUpdate(expense.journeyId.toString());

      return await expense.populate("payerId");
    },
    deleteExpense: async (
      _: unknown,
      { expenseId }: { expenseId: string },
      context: { user?: { userId?: string } }
    ) => {
      await dbConnect();
      const expense = await Expense.findById(expenseId);
      if (!expense) throw new Error("Expense not found");

      const requesterId = context?.user?.userId;
      if (!requesterId || String(requesterId) !== String(expense.payerId)) {
        throw new Error(
          "Unauthorized: only the payer can delete this expense."
        );
      }

      const journeyId = expense.journeyId.toString();
      await Expense.findByIdAndDelete(expenseId);

      await notifyJourneyUpdate(journeyId);
      return true;
    },
  },
  Expense: {
    payer: (parent: IExpense) => parent.payerId,
    hasImage: (parent: IExpense) => !!parent.imageBinary,
  },
  Split: {
    user: async (parent: { userId: string }) => {
      await dbConnect();
      return await User.findById(parent.userId);
    },
  },
};

export default expenseResolvers;

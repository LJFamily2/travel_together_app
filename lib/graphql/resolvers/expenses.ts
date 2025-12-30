import mongoose from "mongoose";
import dbConnect from "../../mongodb";
import Expense, { IExpense } from "../../models/Expense";
import User from "../../models/User";
import { refreshJourneyExpiration } from "../../utils/expiration";

interface SplitInput {
  userId: string;
  baseAmount: number;
  deduction?: number;
  reason?: string;
}

type ExpenseWithHasImage = IExpense & { hasImage?: boolean };

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

      // Validate total amount matches splits (accounting for deductions)
      const sumBase = splits.reduce((acc, s) => acc + (s.baseAmount || 0), 0);
      const sumDeductions = splits.reduce(
        (acc, s) => acc + (s.deduction || 0),
        0
      );
      const totalFromSplits = sumBase + sumDeductions;
      if (Math.abs(totalFromSplits - totalAmount) > 0.01) {
        throw new Error(
          `The sum of splits (base: ${sumBase.toFixed(
            2
          )}, deductions: ${sumDeductions.toFixed(
            2
          )}, total: ${totalFromSplits.toFixed(
            2
          )}) must equal the total amount (${totalAmount.toFixed(2)})`
        );
      }

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

      // Inherit expireAt from Journey if it exists
      // Also refresh the journey expiration (Sliding Window)
      const newExpireAt = await refreshJourneyExpiration(journeyId);
      if (newExpireAt) {
        newExpense.expireAt = newExpireAt;
      }

      await newExpense.save();

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
          // Validate total matches the sum of base amounts and deductions
          const sumBase = expense.splits.reduce(
            (acc: number, s) => acc + (s.baseAmount || 0),
            0
          );
          const sumDeductions = expense.splits.reduce(
            (acc: number, s) => acc + (s.deduction || 0),
            0
          );
          const totalFromSplits = sumBase + sumDeductions;
          if (Math.abs(totalFromSplits - totalAmount) > 0.01) {
            throw new Error(
              `The sum of splits (base: ${sumBase.toFixed(
                2
              )}, deductions: ${sumDeductions.toFixed(
                2
              )}, total: ${totalFromSplits.toFixed(
                2
              )}) must equal the total amount (${totalAmount.toFixed(2)})`
            );
          }
          expense.totalAmount = totalAmount;
        }
      } else if (totalAmount !== undefined && totalAmount !== null) {
        // If splits are not being replaced, scale existing splits proportionally
        const oldTotal = expense.totalAmount || 0;
        if (oldTotal > 0) {
          const ratio = totalAmount / oldTotal;
          expense.splits = expense.splits.map((s) => ({
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

      // Refresh expiration on activity
      await refreshJourneyExpiration(expense.journeyId.toString());

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

      // Refresh expiration on activity
      await refreshJourneyExpiration(journeyId);

      return true;
    },
  },
  Expense: {
    payer: (parent: IExpense) => parent.payerId,
    hasImage: (parent: ExpenseWithHasImage) => {
      if (parent.hasImage !== undefined) return parent.hasImage;
      return !!parent.imageBinary;
    },
  },
  Split: {
    user: async (parent: { userId: string }) => {
      await dbConnect();
      return await User.findById(parent.userId);
    },
  },
};

export default expenseResolvers;

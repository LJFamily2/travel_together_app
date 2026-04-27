import mongoose from "mongoose";
import dbConnect from "../../mongodb";
import Journey from "../../models/Journey";
import Expense, { IExpense } from "../../models/Expense";
import User from "../../models/User";
import { refreshJourneyExpiration } from "../../utils/expiration";
import { logJourneyAction } from "../../utils/actionLog";

interface SplitInput {
  userId: string;
  baseAmount: number;
  deduction?: number;
  reason?: string;
}

type ExpenseWithHasImage = IExpense & { hasImage?: boolean };

const checkJourneyLock = async (journeyId: string) => {
  const journey = await Journey.findById(journeyId);
  if (!journey) throw new Error("Journey not found");

  if (journey.isInputLocked) {
    throw new Error("Journey input is locked. No changes allowed.");
  }

  if (journey.endDate) {
    const endDate = new Date(journey.endDate);
    // Set end date to end of day to be generous? Or exact time?
    // Usually end date implies the day inclusive.
    // Let's assume endDate is stored as Date.
    // If endDate is 2023-10-27T00:00:00.000Z, then strictly > means it's over.
    // But usually "end date" means "until the end of that day".
    // Let's check how endDate is stored.
    // In Journey model: endDate: { type: Date }.
    // In createJourney: it comes as string.
    // Let's assume strict comparison for now, or maybe add 1 day buffer if needed.
    // "when the journey end date meet" -> implies when it passes.
    if (new Date() > endDate) {
      throw new Error("Journey has ended. No changes allowed.");
    }
  }

  return journey;
};

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
      },
    ) => {
      await dbConnect();
      await checkJourneyLock(journeyId);

      // Logic check: (Split Amount) - (Deduction) = Final Owed is handled in UI or calculation,
      // here we just store the data.

      // Validate total amount matches splits (accounting for deductions)
      const sumBase = splits.reduce((acc, s) => acc + (s.baseAmount || 0), 0);
      const sumDeductions = splits.reduce(
        (acc, s) => acc + (s.deduction || 0),
        0,
      );
      const totalFromSplits = sumBase + sumDeductions;
      if (Math.abs(totalFromSplits - totalAmount) > 0.01) {
        throw new Error(
          `The sum of splits (base: ${sumBase.toFixed(
            2,
          )}, deductions: ${sumDeductions.toFixed(
            2,
          )}, total: ${totalFromSplits.toFixed(
            2,
          )}) must equal the total amount (${totalAmount.toFixed(2)})`,
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

      // Log the creation
      const journey = await Journey.findById(journeyId);
      await logJourneyAction({
        journeyId,
        action: "EXPENSE_CREATED",
        actorId: payerId,
        details: `Expense: ${description}`,
        expireAt: journey?.expireAt,
      });

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
      context: { user?: { userId?: string } },
    ) => {
      await dbConnect();
      const expense = await Expense.findById(expenseId);
      if (!expense) throw new Error("Expense not found");

      const journey = await checkJourneyLock(expense.journeyId.toString());

      // Authorization: payer or journey leader can change the expense
      const requesterId = context?.user?.userId;
      const isPayer =
        !!requesterId && String(requesterId) === String(expense.payerId);
      const isLeader =
        !!requesterId && String(requesterId) === String(journey.leaderId);

      if (!requesterId || (!isPayer && !isLeader)) {
        throw new Error(
          "Unauthorized: only the payer or journey leader can update this expense.",
        );
      }

      const before = {
        payerId: String(expense.payerId),
        totalAmount: expense.totalAmount,
        description: expense.description,
        splits: expense.splits.map((s) => ({
          userId: String(s.userId),
          baseAmount: s.baseAmount,
          deduction: s.deduction || 0,
          reason: s.reason,
        })),
      };

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
            0,
          );
          const sumDeductions = expense.splits.reduce(
            (acc: number, s) => acc + (s.deduction || 0),
            0,
          );
          const totalFromSplits = sumBase + sumDeductions;
          if (Math.abs(totalFromSplits - totalAmount) > 0.01) {
            throw new Error(
              `The sum of splits (base: ${sumBase.toFixed(
                2,
              )}, deductions: ${sumDeductions.toFixed(
                2,
              )}, total: ${totalFromSplits.toFixed(
                2,
              )}) must equal the total amount (${totalAmount.toFixed(2)})`,
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

      await logJourneyAction({
        journeyId: expense.journeyId,
        action: "EXPENSE_UPDATED",
        actorId: requesterId,
        targetType: "expense",
        targetId: expenseId,
        details: `Expense: ${expense.description}`,
        metadata: {
          before,
          after: {
            payerId: String(expense.payerId),
            totalAmount: expense.totalAmount,
            description: expense.description,
            splits: expense.splits.map((s) => ({
              userId: String(s.userId),
              baseAmount: s.baseAmount,
              deduction: s.deduction || 0,
              reason: s.reason,
            })),
          },
        },
        expireAt: journey.expireAt,
      });

      return await expense.populate("payerId");
    },
    deleteExpense: async (
      _: unknown,
      { expenseId }: { expenseId: string },
      context: { user?: { userId?: string } },
    ) => {
      await dbConnect();
      const expense = await Expense.findById(expenseId);
      if (!expense) throw new Error("Expense not found");

      const journey = await checkJourneyLock(expense.journeyId.toString());

      const requesterId = context?.user?.userId;
      const isPayer =
        !!requesterId && String(requesterId) === String(expense.payerId);
      const isLeader =
        !!requesterId && String(requesterId) === String(journey.leaderId);

      if (!requesterId || (!isPayer && !isLeader)) {
        throw new Error(
          "Unauthorized: only the payer or journey leader can delete this expense.",
        );
      }

      const journeyId = expense.journeyId.toString();

      const before = {
        payerId: String(expense.payerId),
        totalAmount: expense.totalAmount,
        description: expense.description,
        splits: expense.splits.map((s) => ({
          userId: String(s.userId),
          baseAmount: s.baseAmount,
          deduction: s.deduction || 0,
          reason: s.reason,
        })),
      };

      await Expense.findByIdAndDelete(expenseId);

      // Refresh expiration on activity
      await refreshJourneyExpiration(journeyId);

      await logJourneyAction({
        journeyId,
        action: "EXPENSE_DELETED",
        actorId: requesterId,
        targetType: "expense",
        targetId: expenseId,
        details: `Expense: ${expense.description}`,
        metadata: { before },
        expireAt: journey.expireAt,
      });

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

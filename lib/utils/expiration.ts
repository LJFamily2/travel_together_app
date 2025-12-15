import mongoose from "mongoose";
import Journey from "../models/Journey";
import Expense from "../models/Expense";
import User from "../models/User";

const INACTIVITY_WINDOW = 5 * 24 * 60 * 60 * 1000; // 5 days

/**
 * Updates the expiration date for a journey and its related data (expenses, guest users).
 * - If the journey has a fixed `endDate`, the expiration is fixed to `endDate + 5 days`.
 * - If the journey has NO `endDate`, the expiration is set to `now + 5 days` (Sliding Window).
 *
 * @param journeyId The ID of the journey to update
 * @returns The new expiration date
 */
export const refreshJourneyExpiration = async (
  journeyId: string
): Promise<Date | undefined> => {
  const journey = await Journey.findById(journeyId);
  if (!journey) return undefined;

  let newExpireAt: Date;

  if (journey.endDate) {
    // Fixed Schedule: End Date + 5 Days
    // We generally don't need to update this on every activity, but we check just in case
    newExpireAt = new Date(
      new Date(journey.endDate).getTime() + INACTIVITY_WINDOW
    );

    // If it's already set correctly, we might skip updates, but for consistency we ensure it matches
    // However, the requirement says "If no endDate is set... remove if user don't input for 5 days"
    // So we only do the sliding window if NO endDate is set.
    // If endDate IS set, the expiration is static. We don't need to "refresh" it on activity.
    return newExpireAt;
  } else {
    // Sliding Window: Now + 5 Days
    newExpireAt = new Date(Date.now() + INACTIVITY_WINDOW);
  }

  // Update Journey
  journey.expireAt = newExpireAt;
  await journey.save();

  // Update All Expenses
  await Expense.updateMany(
    { journeyId: journey._id },
    { $set: { expireAt: newExpireAt } }
  );

  // Update Guest Members
  // We only update users who are marked as guests and are members of this journey
  if (journey.members && journey.members.length > 0) {
    await User.updateMany(
      {
        _id: { $in: journey.members },
        isGuest: true,
      },
      { $set: { expireAt: newExpireAt } }
    );
  }

  return newExpireAt;
};

/**
 * Calculates the JWT expiration time in seconds based on the journey's expiration date.
 * @param journey The journey object
 * @returns The expiration time in seconds
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const calculateJwtExpiration = (journey: any): number => {
  if (!journey.expireAt) {
    return 30 * 24 * 60 * 60; // Default 30 days if no expireAt
  }
  const now = Date.now();
  const expireTime = new Date(journey.expireAt).getTime();
  const diffSeconds = Math.floor((expireTime - now) / 1000);

  return diffSeconds > 0 ? diffSeconds : 0;
};

import mongoose from "mongoose";
import dbConnect from "../../mongodb";
import Journey, { IJourney } from "../../models/Journey";
import Expense from "../../models/Expense";
import User from "../../models/User";
import { notifyJourneyUpdate } from "../../utils/notifySocket";
import { refreshJourneyExpiration } from "../../utils/expiration";

const journeyResolvers = {
  Query: {
    getJourneyDetails: async (
      _: unknown,
      { journeyId }: { journeyId: string }
    ) => {
      await dbConnect();
      // TODO: Implement privacy logic here (filter out Total Spend for others)
      // For now, just returning the journey with populated fields
      const journey = await Journey.findById(journeyId)
        .populate("leaderId")
        .populate("members");
      if (!journey) throw new Error("Journey not found");

      // Fetch expenses for this journey
      // Optimization: Let the Journey.expenses field resolver handle this
      // const expenses = await Expense.find({ journeyId })
      //   .populate("payerId")
      //   .populate("splits.userId");

      const journeyObj = journey.toObject();
      return {
        ...journeyObj,
        id: journey._id,
        expireAt: journeyObj.expireAt
          ? new Date(journeyObj.expireAt).toISOString()
          : null,
      };
    },
    getUserJourneys: async (
      _: unknown,
      __: unknown,
      context: { user?: { userId?: string } }
    ) => {
      await dbConnect();
      const userId = context?.user?.userId;
      if (!userId) throw new Error("Unauthorized");
      // Find journeys where the user is a member
      const journeys = await Journey.find({ members: userId }).populate([
        "leaderId",
        "members",
      ]);
      return journeys.map((j) => ({ ...j.toObject(), id: j._id }));
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

      // If endDate is provided, set expireAt to 5 days after endDate
      if (endDate) {
        const end = new Date(endDate);
        const expireAt = new Date(end.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days later
        newJourney.expireAt = expireAt;
      } else {
        // If no endDate, set initial expiration to 5 days from now (Inactivity Rule)
        newJourney.expireAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      }

      await newJourney.save();
      return await newJourney.populate(["leaderId", "members"]);
    },
    joinJourney: async (
      _: unknown,
      { journeyId, userId }: { journeyId: string; userId: string }
    ) => {
      await dbConnect();
      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      const isMember = journey.members.some(
        (memberId) => memberId.toString() === userId
      );

      if (!isMember) {
        journey.members.push(new mongoose.Types.ObjectId(userId));
        await journey.save();

        // Refresh expiration on activity
        await refreshJourneyExpiration(journeyId);

        // Notify socket server about the update
        await notifyJourneyUpdate(journeyId);
      }
      return await journey.populate(["leaderId", "members"]);
    },
    leaveJourney: async (
      _: unknown,
      {
        journeyId,
        leaderTimezoneOffsetMinutes,
      }: { journeyId: string; leaderTimezoneOffsetMinutes?: number },
      context: { user?: { userId?: string } }
    ) => {
      await dbConnect();
      const userId = context?.user?.userId;
      if (!userId) throw new Error("Unauthorized");

      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      const isLeader = journey.leaderId.toString() === userId;

      if (isLeader) {
        // Leader leaving: Schedule deletion in 3 hours
        // serverNow not stored or used further
        let deletionTime: Date;
        if (typeof leaderTimezoneOffsetMinutes === "number") {
          let offsetMins = leaderTimezoneOffsetMinutes;
          // Clamp offset values to a reasonable range to prevent accidental large shifts
          const maxOffsetMinutes = 14 * 60; // +14 hours
          const minOffsetMinutes = -12 * 60; // -12 hours
          if (offsetMins > maxOffsetMinutes || offsetMins < minOffsetMinutes) {
            console.warn(
              "leaveJourney: received invalid leaderTimezoneOffsetMinutes, clamping.",
              offsetMins
            );
            offsetMins = Math.max(
              Math.min(offsetMins, maxOffsetMinutes),
              minOffsetMinutes
            );
          }
          // If timezone offset is provided by client (minutes east of UTC), compute
          // deletionTime as: serverNow + 3 hours + offset. This intentionally
          // computes the leader-local 'now + 3h' as a UTC timestamp (leader local
          // date/time interpreted as a UTC timestamp), matching user request.
          const offsetMs = offsetMins * 60 * 1000;
          deletionTime = new Date(Date.now() + 3 * 60 * 60 * 1000 + offsetMs);
          // leaderTimezoneOffsetMinutes provided — handled above
        } else {
          // Default behavior: 3 hours from now in UTC
          deletionTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
        }
        // Computed deletionTime; stored below as UTC

        journey.expireAt = deletionTime;
        await journey.save();
        // expireAt saved on journey

        // Set expiration for all expenses in this journey
        await Expense.updateMany(
          { journeyId: journey._id },
          { $set: { expireAt: deletionTime } }
        );

        // Set expiration for all GUEST users in this journey
        // We find guests who are members of this journey
        const guestMembers = await User.find({
          _id: { $in: journey.members },
          isGuest: true,
        });

        const guestIds = guestMembers.map((u) => u._id);
        if (guestIds.length > 0) {
          await User.updateMany(
            { _id: { $in: guestIds } },
            { $set: { expireAt: deletionTime } }
          );
        }

        // Notify everyone and log result
        await notifyJourneyUpdate(journeyId);
        // Return the updated journey to the client
        const updated = await Journey.findById(journeyId)
          .populate("leaderId")
          .populate("members");
        if (!updated) throw new Error("Journey not found after update");
        const updatedObj = updated.toObject();
        return {
          ...updatedObj,
          id: updated._id,
          expireAt: updatedObj.expireAt
            ? new Date(updatedObj.expireAt).toISOString()
            : null,
        };
      } else {
        // Regular member leaving
        journey.members = journey.members.filter(
          (id) => id.toString() !== userId
        );
        await journey.save();

        // If the user is a guest, delete them immediately (or set immediate expiry)
        const user = await User.findById(userId);
        if (user && user.isGuest) {
          // We can delete immediately or set expireAt to now
          // Deleting immediately is cleaner for "leave" action
          await User.findByIdAndDelete(userId);
        }

        await notifyJourneyUpdate(journeyId);
        const updated = await Journey.findById(journeyId)
          .populate("leaderId")
          .populate("members");
        if (!updated) throw new Error("Journey not found after update");
        const updatedObj = updated.toObject();
        return {
          ...updatedObj,
          id: updated._id,
          expireAt: updatedObj.expireAt
            ? new Date(updatedObj.expireAt).toISOString()
            : null,
        };
      }
    },
  },
  Journey: {
    expenses: async (parent: IJourney) => {
      await dbConnect();
      // Use aggregation to avoid fetching the heavy imageBinary field
      // This significantly improves performance by not loading image data into memory
      const expenses = await Expense.aggregate([
        { $match: { journeyId: parent._id } },
        {
          $addFields: {
            hasImage: {
              $cond: [{ $ifNull: ["$imageBinary", false] }, true, false],
            },
            id: "$_id",
          },
        },
        { $project: { imageBinary: 0 } },
      ]);

      await Expense.populate(expenses, { path: "payerId" });
      await Expense.populate(expenses, { path: "splits.userId" });

      return expenses;
    },
    leader: (parent: IJourney) => parent.leaderId,
  },
};

export default journeyResolvers;

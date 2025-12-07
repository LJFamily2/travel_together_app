import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import slugify from "slugify";
import { nanoid } from "nanoid";
import dbConnect from "../../mongodb";
import Journey, { IJourney } from "../../models/Journey";
import Expense from "../../models/Expense";
import User from "../../models/User";
import { notifyJourneyUpdate } from "../../utils/notifySocket";
import { refreshJourneyExpiration } from "../../utils/expiration";

const journeyResolvers = {
  Query: {
    getJourneyDetails: async (_: unknown, { slug }: { slug: string }) => {
      await dbConnect();
      // TODO: Implement privacy logic here (filter out Total Spend for others)
      // For now, just returning the journey with populated fields
      const journey = await Journey.findOne({ slug })
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

      const slug = `${slugify(name, { lower: true, strict: true })}-${nanoid(
        6
      )}`;
      const baseDate = endDate ? new Date(endDate) : new Date();
      const expireAt = new Date(baseDate.getTime() + 5 * 24 * 60 * 60 * 1000);

      const newJourney = new Journey({
        leaderId,
        name,
        slug,
        startDate,
        endDate,
        members: [leaderId],
        status: "active",
        expireAt,
      });

      await newJourney.save();

      return await newJourney.populate(["leaderId", "members"]);
    },
    joinJourney: async (
      _: unknown,
      { journeyId, userId }: { journeyId: string; userId: string }
    ) => {
      await dbConnect();
      let journey;
      if (mongoose.Types.ObjectId.isValid(journeyId)) {
        journey = await Journey.findById(journeyId);
      }
      if (!journey) {
        journey = await Journey.findOne({ slug: journeyId });
      }
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
        await notifyJourneyUpdate(journey._id.toString());
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
        await notifyJourneyUpdate(journey._id.toString());
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

        await notifyJourneyUpdate(journey._id.toString());
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
    generateJoinToken: async (
      _: unknown,
      { journeyId }: { journeyId: string }
    ) => {
      await dbConnect();
      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      // single active token for journey: generate a jti and persist it
      const jti = nanoid();
      const expiresIn = 5 * 60 * 1000; // 5 minutes
      const expiresAt = new Date(Date.now() + expiresIn);

      // Persist jti and expiry to invalidate previous tokens
      journey.joinTokenJti = jti;
      journey.joinTokenExpiresAt = expiresAt;
      journey.joinTokenUsed = false;
      await journey.save();

      const token = jwt.sign(
        { journeyId, type: "join_token", jti },
        process.env.NEXTAUTH_SECRET!,
        { expiresIn: "5m" }
      );
      return token;
    },
    joinJourneyViaToken: async (
      _: unknown,
      { token, name }: { token: string; name?: string },
      context: { user?: { userId?: string } }
    ) => {
      await dbConnect();

      let decoded:
        | { journeyId?: string; type?: string; jti?: string }
        | undefined;
      let journey: any = null;
      try {
        decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as {
          journeyId?: string;
          type?: string;
          jti?: string;
        };
      } catch {
        decoded = undefined; // fall through to jti-only handling
      }

      if (
        decoded &&
        decoded.journeyId &&
        decoded.type === "join_token" &&
        decoded.jti
      ) {
        const journeyId = decoded.journeyId;

        // Atomically verify and mark token used so it's single-use
        const updatedJourney = await Journey.findOneAndUpdate(
          {
            _id: journeyId,
            joinTokenJti: decoded.jti,
            joinTokenUsed: { $ne: true },
            joinTokenExpiresAt: { $gt: new Date() },
          },
          {
            $set: {
              joinTokenUsed: true,
              joinTokenJti: null,
              joinTokenExpiresAt: null,
            },
          }
        );
        if (!updatedJourney) {
          throw new Error("Invalid or used token");
        }
        journey = await Journey.findById(journeyId);
      } else {
        // Treat token as short jti string (generated by nanoid), find journey by jti
        const jti = token;
        const updatedJourney = await Journey.findOneAndUpdate(
          {
            joinTokenJti: jti,
            joinTokenUsed: { $ne: true },
            joinTokenExpiresAt: { $gt: new Date() },
          },
          {
            $set: {
              joinTokenUsed: true,
              joinTokenJti: null,
              joinTokenExpiresAt: null,
            },
          }
        );
        if (!updatedJourney) {
          throw new Error("Invalid or used token");
        }
        journey = await Journey.findById(updatedJourney._id);
      }

      if (!journey) throw new Error("Journey not found");
      if (!journey) throw new Error("Journey not found");
      let userId = context?.user?.userId;
      let user;

      if (userId) {
        user = await User.findById(userId);
        if (!user) throw new Error("User not found");
      } else {
        if (!name) throw new Error("Name is required for guest access");

        user = new User({
          name,
          isGuest: true,
        });
        await user.save();
        userId = user._id.toString();
      }

      const isMember = journey.members.some(
        (memberId) => memberId.toString() === userId
      );

      if (!isMember) {
        journey.members.push(new mongoose.Types.ObjectId(userId!));
        await journey.save();
        await notifyJourneyUpdate(journey._id.toString());
      }

      const authToken = jwt.sign(
        { userId: user._id, email: user.email },
        process.env.NEXTAUTH_SECRET!,
        { expiresIn: "30d" }
      );

      return {
        token: authToken,
        user: {
          ...user.toObject(),
          id: user._id,
        },
        journeySlug: journey.slug,
      };
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

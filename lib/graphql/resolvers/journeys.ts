/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import slugify from "slugify";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
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
      { slug }: { slug: string },
      context: { user?: { userId?: string } }
    ) => {
      await dbConnect();
      const userId = context?.user?.userId;

      const journey = await Journey.findOne({ slug })
        .populate("leaderId")
        .populate("members")
        .populate("pendingMembers");
      if (!journey) throw new Error("Journey not found");

      // Check authorization
      if (!userId) {
        throw new Error("Unauthorized");
      }

      const isLeader =
        (journey.leaderId as any)._id.toString() === userId.toString();
      const isMember = journey.members.some(
        (m: any) => m._id.toString() === userId.toString()
      );

      if (!isLeader && !isMember) {
        throw new Error("Unauthorized");
      }

      const journeyObj = journey.toObject();
      return {
        ...journeyObj,
        id: journey._id,
        expireAt: journeyObj.expireAt
          ? new Date(journeyObj.expireAt).toISOString()
          : null,
        hasPassword: !!journey.password,
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
        await refreshJourneyExpiration(journeyId);
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
        let deletionTime: Date;
        if (typeof leaderTimezoneOffsetMinutes === "number") {
          let offsetMins = leaderTimezoneOffsetMinutes;
          const maxOffsetMinutes = 14 * 60;
          const minOffsetMinutes = -12 * 60;
          if (offsetMins > maxOffsetMinutes || offsetMins < minOffsetMinutes) {
            offsetMins = Math.max(
              Math.min(offsetMins, maxOffsetMinutes),
              minOffsetMinutes
            );
          }
          const offsetMs = offsetMins * 60 * 1000;
          deletionTime = new Date(Date.now() + 3 * 60 * 60 * 1000 + offsetMs);
        } else {
          deletionTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
        }

        journey.expireAt = deletionTime;
        await journey.save();

        await Expense.updateMany(
          { journeyId: journey._id },
          { $set: { expireAt: deletionTime } }
        );

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
      } else {
        journey.members = journey.members.filter(
          (id) => id.toString() !== userId
        );
        await journey.save();

        const user = await User.findById(userId);
        if (user && user.isGuest) {
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

      const jti = nanoid();
      const expiresIn = 5 * 60 * 1000; // 5 minutes
      const expiresAt = new Date(Date.now() + expiresIn);

      journey.joinTokenJti = jti;
      journey.joinTokenExpiresAt = expiresAt;
      journey.joinTokenUsed = false; // Reset used status, though we don't enforce single-use anymore
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
      {
        token,
        name,
        password,
      }: { token: string; name?: string; password?: string },
      context: { user?: { userId?: string } }
    ) => {
      await dbConnect();

      let decoded:
        | { journeyId?: string; type?: string; jti?: string }
        | undefined;
      let journey: IJourney | null = null;
      try {
        decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as {
          journeyId?: string;
          type?: string;
          jti?: string;
        };
      } catch {
        decoded = undefined;
      }

      if (
        decoded &&
        decoded.journeyId &&
        decoded.type === "join_token" &&
        decoded.jti
      ) {
        const journeyId = decoded.journeyId;
        // Check if token matches active token in DB and is not expired
        // We REMOVED the check for joinTokenUsed to allow multi-use
        journey = await Journey.findOne({
          _id: journeyId,
          joinTokenJti: decoded.jti,
          joinTokenExpiresAt: { $gt: new Date() },
        });
      } else {
        // Fallback for legacy or direct JTI tokens
        const jti = token;
        journey = await Journey.findOne({
          joinTokenJti: jti,
          joinTokenExpiresAt: { $gt: new Date() },
        });
      }

      if (!journey) throw new Error("Invalid or expired token");

      // Check if journey is locked
      if (journey.isLocked) {
        throw new Error("JOURNEY_LOCKED");
      }

      // Password check
      if (journey.password) {
        if (!password) {
          throw new Error("PASSWORD_REQUIRED");
        }
        const isValid = await bcrypt.compare(password, journey.password);
        if (!isValid) {
          throw new Error("INVALID_PASSWORD");
        }
      }

      let userId = context?.user?.userId;
      let user;

      if (userId) {
        user = await User.findById(userId);
        if (!user) throw new Error("User not found");

        // Check if user is in rejected list
        if (journey.rejectedMembers?.some((id) => id.toString() === userId)) {
          throw new Error("REJECTED");
        }
      } else {
        if (!name) throw new Error("Name is required for guest access");

        // Check for duplicate name in members or pending members
        // We need to fetch the users to check names
        const existingMemberIds = [
          ...journey.members,
          ...journey.pendingMembers,
        ];
        const existingUsers = await User.find({
          _id: { $in: existingMemberIds },
        });

        const nameExists = existingUsers.some(
          (u) => u.name.toLowerCase() === name.trim().toLowerCase()
        );

        if (nameExists) {
          throw new Error("NAME_TAKEN");
        }

        user = new User({
          name,
          isGuest: true,
        });
        await user.save();
        userId = user._id.toString();
      }

      // Check if already a member
      const isMember = journey.members.some(
        (memberId: mongoose.Types.ObjectId) => memberId.toString() === userId
      );

      if (isMember) {
        // Already a member, just return auth
        const authToken = jwt.sign(
          { userId: user._id, email: user.email },
          process.env.JWT_SECRET || "fallback_secret",
          { expiresIn: "30d" }
        );
        return {
          token: authToken,
          user: { ...user.toObject(), id: user._id },
          journeySlug: journey.slug,
          journeyId: journey._id,
          isPending: false,
        };
      }

      // Check approval
      if (journey.requireApproval) {
        const isPending = journey.pendingMembers.some(
          (id: mongoose.Types.ObjectId) => id.toString() === userId
        );
        if (!isPending) {
          journey.pendingMembers.push(new mongoose.Types.ObjectId(userId!));
          await journey.save();
          await notifyJourneyUpdate(journey._id.toString());
        }

        // Generate token for pending user so they have an identity
        if (!process.env.JWT_SECRET) {
          throw new Error("JWT_SECRET is not defined");
        }
        const authToken = jwt.sign(
          { userId: user._id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: "30d" }
        );

        return {
          isPending: true,
          journeyId: journey._id,
          token: authToken,
          user: { ...user.toObject(), id: user._id },
          journeySlug: journey.slug,
        };
      }

      // Add to members
      journey.members.push(new mongoose.Types.ObjectId(userId!));
      await journey.save();
      await notifyJourneyUpdate(journey._id.toString());

      if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not defined");
      }
      const authToken = jwt.sign(
        { userId: user._id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "30d" }
      );

      return {
        token: authToken,
        user: {
          ...user.toObject(),
          id: user._id,
        },
        journeySlug: journey.slug,
        journeyId: journey._id,
        isPending: false,
      };
    },
    setJourneyPassword: async (
      _: unknown,
      { journeyId, password }: { journeyId: string; password?: string }
    ) => {
      await dbConnect();
      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        journey.password = hashedPassword;
      } else {
        journey.password = undefined;
      }
      await journey.save();
      await notifyJourneyUpdate(journeyId);
      return true;
    },
    toggleApprovalRequirement: async (
      _: unknown,
      {
        journeyId,
        requireApproval,
      }: { journeyId: string; requireApproval: boolean }
    ) => {
      await dbConnect();
      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      journey.requireApproval = requireApproval;
      await journey.save();
      await notifyJourneyUpdate(journeyId);
      return journey;
    },
    toggleJourneyLock: async (
      _: unknown,
      { journeyId, isLocked }: { journeyId: string; isLocked: boolean }
    ) => {
      await dbConnect();
      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      journey.isLocked = isLocked;
      await journey.save();
      await notifyJourneyUpdate(journeyId);
      return journey;
    },
    approveJoinRequest: async (
      _: unknown,
      { journeyId, userId }: { journeyId: string; userId: string }
    ) => {
      await dbConnect();
      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      // Remove from pending
      journey.pendingMembers = journey.pendingMembers.filter(
        (id) => id.toString() !== userId
      );

      // Remove from rejected if present (allowing re-approval if manually done?)
      // Actually, if they are in rejected, they can't join. But if the host manually approves them via some other means?
      // For now, let's just ensure they are not in rejected list if we approve them.
      if (journey.rejectedMembers) {
        journey.rejectedMembers = journey.rejectedMembers.filter(
          (id) => id.toString() !== userId
        );
      }

      // Add to members if not already
      if (!journey.members.some((id) => id.toString() === userId)) {
        journey.members.push(new mongoose.Types.ObjectId(userId));
      }

      await journey.save();
      await notifyJourneyUpdate(journeyId);
      return await journey.populate(["members", "pendingMembers"]);
    },
    rejectJoinRequest: async (
      _: unknown,
      { journeyId, userId }: { journeyId: string; userId: string }
    ) => {
      await dbConnect();
      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      journey.pendingMembers = journey.pendingMembers.filter(
        (id) => id.toString() !== userId
      );

      // Add to rejected list
      if (!journey.rejectedMembers) journey.rejectedMembers = [];
      if (!journey.rejectedMembers.some((id) => id.toString() === userId)) {
        journey.rejectedMembers.push(new mongoose.Types.ObjectId(userId));
      }

      await journey.save();
      await notifyJourneyUpdate(journeyId);
      return await journey.populate("pendingMembers");
    },
    approveAllJoinRequests: async (
      _: unknown,
      { journeyId }: { journeyId: string }
    ) => {
      await dbConnect();
      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      const pendingIds = journey.pendingMembers;

      // Move all pending to members
      pendingIds.forEach((id) => {
        if (!journey.members.some((m) => m.toString() === id.toString())) {
          journey.members.push(id);
        }
      });

      journey.pendingMembers = [];

      await journey.save();
      await notifyJourneyUpdate(journeyId);
      return await journey.populate(["members", "pendingMembers"]);
    },
    rejectAllJoinRequests: async (
      _: unknown,
      { journeyId }: { journeyId: string }
    ) => {
      await dbConnect();
      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      const pendingIds = journey.pendingMembers;

      // Move all pending to rejected
      if (!journey.rejectedMembers) journey.rejectedMembers = [];
      pendingIds.forEach((id) => {
        if (
          !journey.rejectedMembers.some((r) => r.toString() === id.toString())
        ) {
          journey.rejectedMembers.push(id);
        }
      });

      journey.pendingMembers = [];

      await journey.save();
      await notifyJourneyUpdate(journeyId);
      return await journey.populate("pendingMembers");
    },

    removeMember: async (
      _: unknown,
      { journeyId, memberId }: { journeyId: string; memberId: string },
      context: { user?: { userId?: string } }
    ) => {
      await dbConnect();
      const currentUserId = context?.user?.userId;
      if (!currentUserId) throw new Error("Unauthorized");

      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      if (journey.leaderId.toString() !== currentUserId) {
        throw new Error("Only the leader can remove members");
      }

      if (journey.leaderId.toString() === memberId) {
        throw new Error("Leader cannot be removed");
      }

      journey.members = journey.members.filter(
        (id) => id.toString() !== memberId
      );

      // Also add to rejected list so they can't immediately rejoin if that's desired behavior?
      // The prompt says "remove the guest account out of the room".
      // Usually "remove" implies kicking them out.
      // If we don't add to rejected, they can rejoin if they have the link/token.
      // But maybe that's fine. Let's just remove for now.
      // Actually, if we want to ban them, we should add to rejectedMembers.
      // But "remove" might just mean "kick".
      // Let's stick to just removing from members list for now.

      await journey.save();
      await notifyJourneyUpdate(journeyId);

      return await journey.populate(["members", "pendingMembers"]);
    },
  },
  Journey: {
    expenses: async (parent: IJourney) => {
      await dbConnect();
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

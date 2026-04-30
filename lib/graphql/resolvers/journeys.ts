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
import ActionLog from "../../models/ActionLog";
import { rlCreateJourney } from "../../rateLimiter";
import { getRateLimiterKey } from "../../utils/limiterKey";
import { logJourneyAction } from "../../utils/actionLog";

type GraphQLContext = {
  user?: { userId?: string };
  req?: any;
  limiters?: {
    rlCreateJourney?: { consume: (key: string) => Promise<any> };
  };
};
import {
  refreshJourneyExpiration,
  calculateJwtExpiration,
} from "../../utils/expiration";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const normalizeDateInput = (
  value?: string,
  mode: "start" | "end" = "start",
): Date | undefined => {
  if (!value) return undefined;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;

  if (!DATE_ONLY_REGEX.test(value)) {
    return parsed;
  }

  const normalized = new Date(parsed);
  if (mode === "end") {
    normalized.setUTCHours(23, 59, 59, 999);
  } else {
    normalized.setUTCHours(0, 0, 0, 0);
  }
  return normalized;
};

const getJourneyWithLeaderCheck = async (
  journeyId: string,
  context: GraphQLContext,
  leaderError = "Only the leader can perform this action",
) => {
  const userId = context?.user?.userId;
  if (!userId) throw new Error("Unauthorized");

  const journey = await Journey.findById(journeyId);
  if (!journey) throw new Error("Journey not found");

  if (journey.leaderId.toString() !== userId) {
    throw new Error(leaderError);
  }

  return { journey, userId };
};

const fetchJourneyExpenses = async (
  journeyId: mongoose.Types.ObjectId,
  offset = 0,
  limit = 0,
) => {
  const pipeline: any[] = [
    { $match: { journeyId } },
    { $sort: { createdAt: -1 } },
  ];

  if (offset > 0) pipeline.push({ $skip: offset });
  if (limit > 0) pipeline.push({ $limit: limit });

  pipeline.push(
    {
      $addFields: {
        hasImage: {
          $cond: [{ $ifNull: ["$imageBinary", false] }, true, false],
        },
        id: "$_id",
      },
    },
    { $project: { imageBinary: 0 } },
  );

  const expenses = await Expense.aggregate(pipeline);
  await Expense.populate(expenses, { path: "payerId" });
  await Expense.populate(expenses, { path: "splits.userId" });

  return expenses;
};

const journeyResolvers = {
  Query: {
    getJourneyDetails: async (
      _: unknown,
      { slug }: { slug: string },
      context: GraphQLContext,
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
        (m: any) => m._id.toString() === userId.toString(),
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
    getJourneyExpenses: async (
      _: unknown,
      { slug }: { slug: string },
      context: GraphQLContext,
    ) => {
      await dbConnect();
      const userId = context?.user?.userId;

      const journey = await Journey.findOne({ slug })
        .populate("leaderId")
        .populate("members");
      if (!journey) throw new Error("Journey not found");

      if (!userId) {
        throw new Error("Unauthorized");
      }

      const isLeader =
        (journey.leaderId as any)._id.toString() === userId.toString();
      const isMember = journey.members.some(
        (m: any) => m._id.toString() === userId.toString(),
      );

      if (!isLeader && !isMember) {
        throw new Error("Unauthorized");
      }

      return await fetchJourneyExpenses(journey._id);
    },
    getUserJourneys: async (
      _: unknown,
      __: unknown,
      context: GraphQLContext,
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
    getJourneyActions: async (
      _: unknown,
      { journeyId, limit = 50 }: { journeyId: string; limit?: number },
      context: GraphQLContext,
    ) => {
      await dbConnect();
      const userId = context?.user?.userId;
      if (!userId) throw new Error("Unauthorized");

      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      const isLeader = journey.leaderId.toString() === userId;
      const isMember = journey.members.some((id) => id.toString() === userId);
      if (!isLeader && !isMember) throw new Error("Unauthorized");

      const safeLimit = Math.max(1, Math.min(limit, 200));
      return await ActionLog.find({ journeyId })
        .sort({ createdAt: -1 })
        .limit(safeLimit);
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
      },
      context: GraphQLContext,
    ) => {
      await dbConnect();

      // Rate limit: per-user (if authenticated) or per-IP fallback for journey creation
      try {
        const limiter = context?.limiters?.rlCreateJourney ?? rlCreateJourney;
        const key = getRateLimiterKey(context);
        await limiter.consume(key);
      } catch {
        const err = new Error("Too many requests");
        (err as any).extensions = { code: "TOO_MANY_REQUESTS" };
        throw err;
      }

      const slug = `${slugify(name, { lower: true, strict: true })}-${nanoid(
        6,
      )}`;
      const normalizedStartDate = normalizeDateInput(startDate, "start");
      const normalizedEndDate = normalizeDateInput(endDate, "end");
      const baseDate = normalizedEndDate ?? new Date();
      const expireAt = new Date(baseDate.getTime() + 5 * 24 * 60 * 60 * 1000);

      const newJourney = new Journey({
        leaderId,
        name,
        slug,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        members: [leaderId],
        status: "active",
        expireAt,
      });

      await newJourney.save();

      await logJourneyAction({
        journeyId: newJourney._id,
        action: "JOURNEY_CREATED",
        actorId: leaderId,
        targetType: "journey",
        targetId: newJourney._id.toString(),
        details: "Journey created",
        expireAt,
      });

      return await newJourney.populate(["leaderId", "members"]);
    },
    updateJourney: async (
      _: unknown,
      {
        journeyId,
        name,
        startDate,
        endDate,
      }: {
        journeyId: string;
        name?: string;
        startDate?: string;
        endDate?: string;
      },
      context: GraphQLContext,
    ) => {
      await dbConnect();
      const { journey, userId } = await getJourneyWithLeaderCheck(
        journeyId,
        context,
        "Only the leader can update this journey",
      );

      const before = {
        name: journey.name,
        startDate: journey.startDate,
        endDate: journey.endDate,
      };

      if (typeof name === "string" && name.trim()) {
        journey.name = name.trim();
      }

      if (typeof startDate === "string") {
        const normalized = normalizeDateInput(startDate, "start");
        if (normalized) {
          journey.startDate = normalized;
        }
      }

      if (typeof endDate === "string") {
        const normalized = normalizeDateInput(endDate, "end");
        if (normalized) {
          journey.endDate = normalized;
          journey.expireAt = new Date(
            normalized.getTime() + 5 * 24 * 60 * 60 * 1000,
          );
        }
      }

      await journey.save();

      await logJourneyAction({
        journeyId: journey._id,
        action: "JOURNEY_UPDATED",
        actorId: userId,
        targetType: "journey",
        targetId: journey._id.toString(),
        details: "Journey settings updated",
        metadata: {
          before,
          after: {
            name: journey.name,
            startDate: journey.startDate,
            endDate: journey.endDate,
          },
        },
        expireAt: journey.expireAt,
      });

      return await journey.populate(["leaderId", "members", "pendingMembers"]);
    },
    joinJourney: async (
      _: unknown,
      { journeyId, userId }: { journeyId: string; userId: string },
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
        (memberId) => memberId.toString() === userId,
      );

      if (!isMember) {
        journey.members.push(new mongoose.Types.ObjectId(userId));
        await journey.save();
        await refreshJourneyExpiration(journeyId);
      }
      return await journey.populate(["leaderId", "members"]);
    },
    leaveJourney: async (
      _: unknown,
      {
        journeyId,
        leaderTimezoneOffsetMinutes,
      }: { journeyId: string; leaderTimezoneOffsetMinutes?: number },
      context: GraphQLContext,
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
              minOffsetMinutes,
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
          { $set: { expireAt: deletionTime } },
        );

        const guestMembers = await User.find({
          _id: { $in: journey.members },
          isGuest: true,
        });

        const guestIds = guestMembers.map((u) => u._id);
        if (guestIds.length > 0) {
          await User.updateMany(
            { _id: { $in: guestIds } },
            { $set: { expireAt: deletionTime } },
          );
        }

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
        // Prevent non-leader members from leaving early. Members may only leave
        // if the journey has ended (`endDate` passed or `status==='complete'`) or
        // if the leader has left (indicated by `expireAt` being set).
        const now = new Date();
        const journeyEnded =
          journey.status === "complete" ||
          (journey.endDate && now >= new Date(journey.endDate)) ||
          Boolean(journey.expireAt);

        if (!journeyEnded) {
          throw new Error(
            "Members cannot leave until the journey ends or the leader has left",
          );
        }

        journey.members = journey.members.filter(
          (id) => id.toString() !== userId,
        );
        await journey.save();

        // If the leaving user is a guest, attempt to delete their account only
        // if they are not referenced in any expenses for this journey.
        const user = await User.findById(userId);
        if (user && user.isGuest) {
          const involved = await Expense.exists({
            journeyId: journey._id,
            $or: [{ payerId: userId }, { "splits.userId": userId }],
          });

          if (!involved) {
            await User.findByIdAndDelete(userId);
          }
        }

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
      { journeyId }: { journeyId: string },
      context: GraphQLContext,
    ) => {
      await dbConnect();
      const { journey, userId } = await getJourneyWithLeaderCheck(
        journeyId,
        context,
        "Only the leader can generate join links",
      );

      const jti = nanoid();
      const expiresIn = 5 * 60 * 1000; // 5 minutes
      const expiresAt = new Date(Date.now() + expiresIn);

      journey.joinTokenJti = jti;
      journey.joinTokenExpiresAt = expiresAt;
      journey.joinTokenUsed = false; // Reset used status, though we don't enforce single-use anymore
      await journey.save();

      await logJourneyAction({
        journeyId,
        action: "JOIN_TOKEN_GENERATED",
        actorId: userId,
        targetType: "journey",
        targetId: journeyId,
        details: "Generated new join token",
        metadata: { expiresAt },
        expireAt: journey.expireAt,
      });

      const token = jwt.sign(
        { journeyId, type: "join_token", jti },
        process.env.NEXTAUTH_SECRET!,
        { expiresIn: "5m" },
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
      context: GraphQLContext,
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
          (u) => u.name.toLowerCase() === name.trim().toLowerCase(),
        );

        if (nameExists) {
          throw new Error("NAME_TAKEN");
        }

        // Rate limit guest creation per-ip when joining via token
        try {
          const limiter = context?.limiters?.rlCreateJourney ?? rlCreateJourney;
          const key = getRateLimiterKey(context);
          await limiter.consume(key);
        } catch {
          const err = new Error("Too many requests");
          (err as any).extensions = { code: "TOO_MANY_REQUESTS" };
          throw err;
        }

        user = new User({ name, isGuest: true });
        await user.save();
        userId = user._id.toString();
      }

      // Check if already a member
      const isMember = journey.members.some(
        (memberId: mongoose.Types.ObjectId) => memberId.toString() === userId,
      );

      if (isMember) {
        // Already a member, just return auth
        const expiresIn = calculateJwtExpiration(journey);
        const authToken = jwt.sign(
          { userId: user._id, email: user.email },
          process.env.JWT_SECRET || "fallback_secret",
          { expiresIn },
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
          (id: mongoose.Types.ObjectId) => id.toString() === userId,
        );
        if (!isPending) {
          journey.pendingMembers.push(new mongoose.Types.ObjectId(userId!));
          await journey.save();
        }

        // Generate token for pending user so they have an identity
        if (!process.env.JWT_SECRET) {
          throw new Error("JWT_SECRET is not defined");
        }
        const expiresIn = calculateJwtExpiration(journey);
        const authToken = jwt.sign(
          { userId: user._id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn },
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

      if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not defined");
      }
      const expiresIn = calculateJwtExpiration(journey);
      const authToken = jwt.sign(
        { userId: user._id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn },
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
      { journeyId, password }: { journeyId: string; password?: string },
      context: GraphQLContext,
    ) => {
      await dbConnect();
      const { journey, userId } = await getJourneyWithLeaderCheck(
        journeyId,
        context,
        "Only the leader can update journey password",
      );

      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        journey.password = hashedPassword;
      } else {
        journey.password = undefined;
      }
      await journey.save();

      await logJourneyAction({
        journeyId,
        action: "JOURNEY_PASSWORD_UPDATED",
        actorId: userId,
        targetType: "journey",
        targetId: journeyId,
        details: password ? "Journey password set" : "Journey password removed",
        expireAt: journey.expireAt,
      });

      return true;
    },
    toggleApprovalRequirement: async (
      _: unknown,
      {
        journeyId,
        requireApproval,
      }: { journeyId: string; requireApproval: boolean },
      context: GraphQLContext,
    ) => {
      await dbConnect();
      const { journey, userId } = await getJourneyWithLeaderCheck(
        journeyId,
        context,
        "Only the leader can change approval requirement",
      );

      journey.requireApproval = requireApproval;
      await journey.save();

      await logJourneyAction({
        journeyId,
        action: "APPROVAL_REQUIREMENT_TOGGLED",
        actorId: userId,
        targetType: "journey",
        targetId: journeyId,
        details: requireApproval
          ? "Join approval enabled"
          : "Join approval disabled",
        metadata: { requireApproval },
        expireAt: journey.expireAt,
      });

      return journey;
    },
    toggleJourneyLock: async (
      _: unknown,
      { journeyId, isLocked }: { journeyId: string; isLocked: boolean },
      context: GraphQLContext,
    ) => {
      await dbConnect();
      const userId = context?.user?.userId;
      if (!userId) throw new Error("Unauthorized");

      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      if (journey.leaderId.toString() !== userId) {
        throw new Error("Only the leader can lock/unlock the journey");
      }

      journey.isLocked = isLocked;
      await journey.save();

      await logJourneyAction({
        journeyId,
        action: "JOURNEY_LOCK_TOGGLED",
        actorId: userId,
        targetType: "journey",
        targetId: journeyId,
        details: isLocked ? "Journey locked" : "Journey unlocked",
        metadata: { isLocked },
        expireAt: journey.expireAt,
      });

      return journey;
    },
    toggleJourneyInputLock: async (
      _: unknown,
      {
        journeyId,
        isInputLocked,
      }: { journeyId: string; isInputLocked: boolean },
      context: GraphQLContext,
    ) => {
      await dbConnect();
      const userId = context?.user?.userId;
      if (!userId) throw new Error("Unauthorized");

      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      if (journey.leaderId.toString() !== userId) {
        throw new Error("Only the leader can lock/unlock the journey input");
      }

      journey.isInputLocked = isInputLocked;
      await journey.save();

      await logJourneyAction({
        journeyId,
        action: "JOURNEY_INPUT_LOCK_TOGGLED",
        actorId: userId,
        targetType: "journey",
        targetId: journeyId,
        details: isInputLocked
          ? "Journey input locked"
          : "Journey input unlocked",
        metadata: { isInputLocked },
        expireAt: journey.expireAt,
      });

      return journey;
    },
    approveJoinRequest: async (
      _: unknown,
      { journeyId, userId }: { journeyId: string; userId: string },
      context: GraphQLContext,
    ) => {
      await dbConnect();
      const { journey, userId: actorId } = await getJourneyWithLeaderCheck(
        journeyId,
        context,
        "Only the leader can approve join requests",
      );

      // Remove from pending
      journey.pendingMembers = journey.pendingMembers.filter(
        (id) => id.toString() !== userId,
      );

      // Remove from rejected if present (allowing re-approval if manually done?)
      // Actually, if they are in rejected, they can't join. But if the host manually approves them via some other means?
      // For now, let's just ensure they are not in rejected list if we approve them.
      if (journey.rejectedMembers) {
        journey.rejectedMembers = journey.rejectedMembers.filter(
          (id) => id.toString() !== userId,
        );
      }

      // Add to members if not already
      if (!journey.members.some((id) => id.toString() === userId)) {
        journey.members.push(new mongoose.Types.ObjectId(userId));
      }

      await journey.save();

      await logJourneyAction({
        journeyId,
        action: "JOIN_REQUEST_APPROVED",
        actorId,
        targetType: "user",
        targetId: userId,
        details: "Approved a pending join request",
        expireAt: journey.expireAt,
      });

      return await journey.populate(["members", "pendingMembers"]);
    },
    rejectJoinRequest: async (
      _: unknown,
      { journeyId, userId }: { journeyId: string; userId: string },
      context: GraphQLContext,
    ) => {
      await dbConnect();
      const { journey, userId: actorId } = await getJourneyWithLeaderCheck(
        journeyId,
        context,
        "Only the leader can reject join requests",
      );

      journey.pendingMembers = journey.pendingMembers.filter(
        (id) => id.toString() !== userId,
      );

      // Add to rejected list
      if (!journey.rejectedMembers) journey.rejectedMembers = [];
      if (!journey.rejectedMembers.some((id) => id.toString() === userId)) {
        journey.rejectedMembers.push(new mongoose.Types.ObjectId(userId));
      }

      await journey.save();

      await logJourneyAction({
        journeyId,
        action: "JOIN_REQUEST_REJECTED",
        actorId,
        targetType: "user",
        targetId: userId,
        details: "Rejected a pending join request",
        expireAt: journey.expireAt,
      });

      return await journey.populate("pendingMembers");
    },
    approveAllJoinRequests: async (
      _: unknown,
      { journeyId }: { journeyId: string },
      context: GraphQLContext,
    ) => {
      await dbConnect();
      const { journey, userId } = await getJourneyWithLeaderCheck(
        journeyId,
        context,
        "Only the leader can approve join requests",
      );

      const pendingIds = journey.pendingMembers;

      // Move all pending to members
      pendingIds.forEach((id) => {
        if (!journey.members.some((m) => m.toString() === id.toString())) {
          journey.members.push(id);
        }
      });

      journey.pendingMembers = [];

      await journey.save();

      await logJourneyAction({
        journeyId,
        action: "ALL_JOIN_REQUESTS_APPROVED",
        actorId: userId,
        targetType: "journey",
        targetId: journeyId,
        details: "Approved all pending join requests",
        metadata: { approvedCount: pendingIds.length },
        expireAt: journey.expireAt,
      });

      return await journey.populate(["members", "pendingMembers"]);
    },
    rejectAllJoinRequests: async (
      _: unknown,
      { journeyId }: { journeyId: string },
      context: GraphQLContext,
    ) => {
      await dbConnect();
      const { journey, userId } = await getJourneyWithLeaderCheck(
        journeyId,
        context,
        "Only the leader can reject join requests",
      );

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

      await logJourneyAction({
        journeyId,
        action: "ALL_JOIN_REQUESTS_REJECTED",
        actorId: userId,
        targetType: "journey",
        targetId: journeyId,
        details: "Rejected all pending join requests",
        metadata: { rejectedCount: pendingIds.length },
        expireAt: journey.expireAt,
      });

      return await journey.populate("pendingMembers");
    },

    removeMember: async (
      _: unknown,
      { journeyId, memberId }: { journeyId: string; memberId: string },
      context: GraphQLContext,
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
        (id) => id.toString() !== memberId,
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

      await logJourneyAction({
        journeyId,
        action: "MEMBER_REMOVED",
        actorId: currentUserId,
        targetType: "user",
        targetId: memberId,
        details: "Removed member from journey",
        expireAt: journey.expireAt,
      });

      return await journey.populate(["members", "pendingMembers"]);
    },
  },
  Journey: {
    expenses: async (
      parent: IJourney,
      { offset = 0, limit = 0 }: { offset?: number; limit?: number },
    ) => {
      await dbConnect();
      return await fetchJourneyExpenses(parent._id, offset, limit);
    },
    actionLogs: async (parent: IJourney) => {
      await dbConnect();
      return await ActionLog.find({ journeyId: parent._id })
        .sort({ createdAt: -1 })
        .limit(100);
    },
    leader: (parent: IJourney) => parent.leaderId,
  },
  ActionLog: {
    id: (parent: { _id: mongoose.Types.ObjectId; id?: string }) =>
      parent.id || parent._id.toString(),
    journeyId: (parent: { journeyId: mongoose.Types.ObjectId | string }) =>
      parent.journeyId.toString(),
    actor: async (parent: { actorId?: mongoose.Types.ObjectId | string }) => {
      if (!parent.actorId) return null;
      return await User.findById(parent.actorId);
    },
    actorName: async (parent: { actorName?: string; actorId?: mongoose.Types.ObjectId | string }) => {
      if (parent.actorName) return parent.actorName;
      if (!parent.actorId) return "System";
      const user = await User.findById(parent.actorId);
      return user ? user.name : "System";
    },
    metadata: (parent: { metadata?: any }) => {
      if (!parent.metadata) return null;
      return JSON.stringify(parent.metadata);
    }
  },
};

export default journeyResolvers;

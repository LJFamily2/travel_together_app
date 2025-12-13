/* eslint-disable @typescript-eslint/no-explicit-any */
import dbConnect from "../../mongodb";
import User from "../../models/User";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Journey from "../../models/Journey";
import bcrypt from "bcryptjs";

const userResolvers = {
  Query: {
    getUsers: async () => {
      await dbConnect();
      return await User.find({});
    },
    me: async (
      _: unknown,
      __: unknown,
      context: { user: { userId: string } }
    ) => {
      if (!context.user) return null;
      await dbConnect();
      return await User.findById(context.user.userId);
    },
  },
  Mutation: {
    createUser: async (
      _: unknown,
      { name, email }: { name: string; email?: string }
    ) => {
      await dbConnect();
      const userData: any = { name, isGuest: false };
      if (email) userData.email = email;

      const newUser = new User(userData);
      await newUser.save();
      return newUser;
    },
    joinAsGuest: async (
      _: unknown,
      { name, journeyId }: { name: string; journeyId: string }
    ) => {
      await dbConnect();

      // Check if journey exists
      const journey = await Journey.findById(journeyId).populate("members");
      if (!journey) {
        throw new Error("Journey not found");
      }

      // Check if name is taken in this journey
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isNameTaken = (journey.members as any[]).some(
        (member: { name: string }) =>
          member.name.toLowerCase() === name.toLowerCase()
      );

      if (isNameTaken) {
        throw new Error(`The name '${name}' is already taken in this journey.`);
      }

      // 1. Create Guest User
      const newUser = new User({ name, isGuest: true });
      await newUser.save();

      // 2. Add to Journey
      // Use update to avoid issues with populated array
      await Journey.findByIdAndUpdate(journeyId, {
        $push: { members: newUser._id },
      });

      // 3. Generate Token
      if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not defined");
      }
      const token = jwt.sign(
        { userId: newUser._id, isGuest: true, journeyId },
        process.env.JWT_SECRET,
        { expiresIn: "30d" }
      );

      return {
        token,
        user: newUser,
      };
    },
    createGuestUser: async (
      _: unknown,
      { journeyId, name }: { journeyId: string; name: string },
      context: { user?: { userId: string } }
    ) => {
      await dbConnect();
      if (!context.user?.userId) throw new Error("Unauthorized");

      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      // Check if leader
      if (journey.leaderId.toString() !== context.user.userId) {
        throw new Error("Only the leader can create guest users");
      }

      // Check if name taken
      await journey.populate({ path: "members", select: "name" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isNameTaken = (journey.members as any[]).some(
        (member: { name: string }) =>
          member.name.toLowerCase() === name.toLowerCase()
      );
      if (isNameTaken) {
        throw new Error(`The name '${name}' is already taken in this journey.`);
      }

      // Create Guest
      const newUser = new User({ name, isGuest: true });
      await newUser.save();

      // Add to Journey
      await Journey.findByIdAndUpdate(journeyId, {
        $push: { members: newUser._id },
      });

      // Generate Token
      if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing");

      const token = jwt.sign(
        { userId: newUser._id, isGuest: true, journeyId, type: "guest_invite" },
        process.env.JWT_SECRET,
        { expiresIn: "365d" }
      );

      // We return a relative path, client can prepend origin
      const inviteLink = `/join/guest?token=${token}`;

      return {
        user: newUser,
        inviteLink,
        token,
      };
    },
    regenerateGuestInvite: async (
      _: unknown,
      { journeyId, userId }: { journeyId: string; userId: string },
      context: { user?: { userId: string } }
    ) => {
      await dbConnect();
      if (!context.user?.userId) throw new Error("Unauthorized");

      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      // Check if leader
      if (journey.leaderId.toString() !== context.user.userId) {
        throw new Error("Only the leader can manage guest users");
      }

      const user = await User.findById(userId);
      if (!user) throw new Error("User not found");
      if (!user.isGuest) throw new Error("User is not a guest");

      // Verify user is in journey
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!journey.members.some((m: any) => m.toString() === userId)) {
        throw new Error("User is not in this journey");
      }

      // Generate Token
      if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing");

      const token = jwt.sign(
        { userId: user._id, isGuest: true, journeyId, type: "guest_invite" },
        process.env.JWT_SECRET,
        { expiresIn: "365d" }
      );

      const inviteLink = `/join/guest?token=${token}`;

      return {
        user,
        inviteLink,
        token,
      };
    },
    claimGuestUser: async (
      _: unknown,
      { token, password }: { token: string; password?: string }
    ) => {
      await dbConnect();
      if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET missing");

      let decoded: any;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        decoded = jwt.verify(token, process.env.JWT_SECRET) as any;
      } catch (error) {
        throw new Error("Invalid or expired token");
      }

      if (!decoded.userId || !decoded.journeyId)
        throw new Error("Invalid token");

      const user = await User.findById(decoded.userId);
      if (!user) throw new Error("User not found");

      const journey = await Journey.findById(decoded.journeyId);
      if (!journey) throw new Error("Journey not found");

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

      return {
        token,
        user,
        journeySlug: journey.slug,
        journeyId: journey._id.toString(),
        isPending: false,
      };
    },
    login: async (
      _: unknown,
      { userId, journeyId }: { userId: string; journeyId: string }
    ) => {
      await dbConnect();
      const user = await User.findById(userId);
      if (!user) throw new Error("User not found");

      if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not defined");
      }
      const token = jwt.sign(
        { userId: user._id, isGuest: user.isGuest, journeyId },
        process.env.JWT_SECRET,
        { expiresIn: "30d" }
      );

      return {
        token,
        user,
      };
    },
    updateBankInfo: async (
      _: unknown,
      {
        bankName,
        accountNumber,
        accountName,
      }: { bankName?: string; accountNumber?: string; accountName?: string },
      context: { user: { userId: string } }
    ) => {
      if (!context.user) throw new Error("Unauthorized");
      await dbConnect();

      const updateData: any = {};
      if (bankName) updateData["bankInfo.bankInformation.name"] = bankName;
      if (accountNumber)
        updateData["bankInfo.bankInformation.number"] = accountNumber;
      if (accountName)
        updateData["bankInfo.bankInformation.userName"] = accountName;

      const updatedUser = await User.findByIdAndUpdate(
        context.user.userId,
        { $set: updateData },
        { new: true }
      );

      return updatedUser;
    },
  },
  BankInfo: {
    qrcode: (parent: { qrcode?: Buffer }) => {
      if (parent.qrcode && Buffer.isBuffer(parent.qrcode)) {
        return parent.qrcode.toString("base64");
      }
      return parent.qrcode;
    },
  },
  User: {
    id: (parent: { _id: mongoose.Types.ObjectId; id?: string }) => {
      return parent.id || parent._id.toString();
    },
  },
};

export default userResolvers;

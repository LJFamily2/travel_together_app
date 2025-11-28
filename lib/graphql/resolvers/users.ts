import dbConnect from "../../mongodb";
import User from "../../models/User";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Journey from "../../models/Journey";

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
      const newUser = new User({ name, email, isGuest: false });
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
      const token = jwt.sign(
        { userId: newUser._id, isGuest: true, journeyId },
        process.env.JWT_SECRET || "fallback_secret",
        { expiresIn: "30d" }
      );

      return {
        token,
        user: newUser,
      };
    },
    login: async (
      _: unknown,
      { userId, journeyId }: { userId: string; journeyId: string }
    ) => {
      await dbConnect();
      const user = await User.findById(userId);
      if (!user) throw new Error("User not found");

      const token = jwt.sign(
        { userId: user._id, isGuest: user.isGuest, journeyId },
        process.env.JWT_SECRET || "fallback_secret",
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

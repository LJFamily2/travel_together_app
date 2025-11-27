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

      // 1. Create Guest User
      const newUser = new User({ name, isGuest: true });
      await newUser.save();

      // 2. Add to Journey
      const journey = await Journey.findById(journeyId);
      if (!journey) {
        throw new Error("Journey not found");
      }
      journey.members.push(newUser._id as unknown as mongoose.Types.ObjectId);
      await journey.save();

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
  },
  BankInfo: {
    qrcode: (parent: { qrcode?: Buffer }) => {
      if (parent.qrcode && Buffer.isBuffer(parent.qrcode)) {
        return parent.qrcode.toString("base64");
      }
      return parent.qrcode;
    },
  },
};

export default userResolvers;

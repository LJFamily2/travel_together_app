import dbConnect from "../../mongodb";
import User from "../../models/User";

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

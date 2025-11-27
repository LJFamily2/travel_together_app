import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUser extends Document {
  name: string;
  email?: string;
  avatar?: string;
  bankInfo?: {
    qrcode?: Buffer;
    bankInformation?: {
      name?: string;
      number?: string;
      userName?: string;
    };
  };
  isGuest: boolean;
  createdAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, unique: true, sparse: true }, // sparse allows null/undefined for guests
    bankInfo: {
      qrcode: { type: Buffer },
      bankInformation: {
        name: String,
        number: String,
        userName: String,
      },
    },
    isGuest: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Check if the model is already defined to prevent overwriting during hot reloads
const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;

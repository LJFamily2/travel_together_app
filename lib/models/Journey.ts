import mongoose, { Schema, Document, Model } from "mongoose";

export interface IJourney extends Document {
  name: string;
  startDate?: Date;
  endDate?: Date;
  leaderId: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
  status: "active" | "complete";
  createdAt: Date;
}

const JourneySchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    startDate: { type: Date },
    endDate: { type: Date },
    leaderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],
    status: { type: String, enum: ["active", "complete"], default: "active" },
  },
  { timestamps: true }
);

const Journey: Model<IJourney> =
  mongoose.models.Journey || mongoose.model<IJourney>("Journey", JourneySchema);

export default Journey;

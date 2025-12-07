import mongoose, { Schema, Document, Model } from "mongoose";

export interface IJourney extends Document {
  name: string;
  slug: string;
  startDate?: Date;
  endDate?: Date;
  leaderId: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
  status: "active" | "complete";
  createdAt: Date;
  expireAt?: Date;
  // Single active join token metadata
  joinTokenJti?: string;
  joinTokenExpiresAt?: Date;
  joinTokenUsed?: boolean;
}

const JourneySchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    startDate: { type: Date },
    endDate: { type: Date },
    leaderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],
    status: { type: String, enum: ["active", "complete"], default: "active" },
    expireAt: { type: Date },
    // Token metadata - used for single-active token or revocation
    joinTokenJti: { type: String },
    joinTokenExpiresAt: { type: Date },
    joinTokenUsed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// TTL Index: Documents will be automatically deleted when the current time matches 'expireAt'
JourneySchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

// Delete the model from cache if it exists (for dev hot-reload)
if (process.env.NODE_ENV !== "production" && mongoose.models.Journey) {
  delete mongoose.models.Journey;
}

const Journey: Model<IJourney> =
  mongoose.models.Journey || mongoose.model<IJourney>("Journey", JourneySchema);

export default Journey;

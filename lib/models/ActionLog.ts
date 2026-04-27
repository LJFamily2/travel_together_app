import mongoose, { Schema, Document, Model } from "mongoose";

export interface IActionLog extends Document {
  journeyId: mongoose.Types.ObjectId;
  actorId?: mongoose.Types.ObjectId;
  actorName?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: string;
  metadata?: Record<string, unknown>;
  expireAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ActionLogSchema: Schema = new Schema(
  {
    journeyId: { type: Schema.Types.ObjectId, ref: "Journey", required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    actorName: { type: String },
    action: { type: String, required: true },
    targetType: { type: String },
    targetId: { type: String },
    details: { type: String },
    metadata: { type: Schema.Types.Mixed },
    expireAt: { type: Date },
  },
  { timestamps: true },
);

ActionLogSchema.index({ journeyId: 1, createdAt: -1 });
ActionLogSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

const ActionLog: Model<IActionLog> =
  mongoose.models.ActionLog ||
  mongoose.model<IActionLog>("ActionLog", ActionLogSchema);

export default ActionLog;

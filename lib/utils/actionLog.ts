import mongoose from "mongoose";
import ActionLog from "../models/ActionLog";

interface LogJourneyActionInput {
  journeyId: string | mongoose.Types.ObjectId;
  action: string;
  actorId?: string | mongoose.Types.ObjectId;
  actorName?: string;
  targetType?: string;
  targetId?: string;
  details?: string;
  metadata?: Record<string, unknown>;
  expireAt?: Date | null;
}

export const logJourneyAction = async ({
  journeyId,
  action,
  actorId,
  actorName,
  targetType,
  targetId,
  details,
  metadata,
  expireAt,
}: LogJourneyActionInput) => {
  const payload: Record<string, unknown> = {
    journeyId: new mongoose.Types.ObjectId(journeyId),
    action,
  };

  if (actorId) payload.actorId = new mongoose.Types.ObjectId(actorId);
  if (actorName) payload.actorName = actorName;
  if (targetType) payload.targetType = targetType;
  if (targetId) payload.targetId = targetId;
  if (details) payload.details = details;
  if (metadata) payload.metadata = metadata;
  if (expireAt) payload.expireAt = expireAt;

  await ActionLog.create(payload);
};

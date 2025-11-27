import mongoose from "mongoose";
import dbConnect from "../../mongodb";
import Journey, { IJourney } from "../../models/Journey";
import Expense from "../../models/Expense";

const journeyResolvers = {
  Query: {
    getJourneyDetails: async (
      _: unknown,
      { journeyId }: { journeyId: string }
    ) => {
      await dbConnect();
      // TODO: Implement privacy logic here (filter out Total Spend for others)
      // For now, just returning the journey with populated fields
      const journey = await Journey.findById(journeyId)
        .populate("leaderId")
        .populate("members");
      if (!journey) throw new Error("Journey not found");

      // Fetch expenses for this journey
      const expenses = await Expense.find({ journeyId })
        .populate("payerId")
        .populate("splits.userId");

      return { ...journey.toObject(), id: journey._id, expenses };
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
      }
    ) => {
      await dbConnect();
      const newJourney = new Journey({
        leaderId,
        name,
        startDate,
        endDate,
        members: [leaderId], // Leader is automatically a member
        status: "active",
      });
      await newJourney.save();
      return await newJourney.populate(["leaderId", "members"]);
    },
    joinJourney: async (
      _: unknown,
      { journeyId, userId }: { journeyId: string; userId: string }
    ) => {
      await dbConnect();
      const journey = await Journey.findById(journeyId);
      if (!journey) throw new Error("Journey not found");

      const isMember = journey.members.some(
        (memberId) => memberId.toString() === userId
      );

      if (!isMember) {
        journey.members.push(new mongoose.Types.ObjectId(userId));
        await journey.save();
      }
      return await journey.populate(["leaderId", "members"]);
    },
  },
  Journey: {
    expenses: async (parent: IJourney) => {
      await dbConnect();
      return await Expense.find({ journeyId: parent._id })
        .populate("payerId")
        .populate("splits.userId");
    },
    leader: (parent: IJourney) => parent.leaderId,
  },
};

export default journeyResolvers;

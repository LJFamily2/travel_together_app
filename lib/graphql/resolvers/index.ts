import userResolvers from "./users";
import journeyResolvers from "./journeys";
import expenseResolvers from "./expenses";

const mergedResolvers = {
  Query: {
    ...userResolvers.Query,
    ...journeyResolvers.Query,
  },
  Mutation: {
    ...userResolvers.Mutation,
    ...journeyResolvers.Mutation,
    ...expenseResolvers.Mutation,
  },
  Journey: journeyResolvers.Journey,
  Expense: expenseResolvers.Expense,
  Split: expenseResolvers.Split,
  BankInfo: userResolvers.BankInfo,
  User: userResolvers.User,
};

export default mergedResolvers;

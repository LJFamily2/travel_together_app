import { gql } from "graphql-tag";

const typeDefs = gql`
  type BankDetails {
    name: String
    number: String
    userName: String
  }

  type BankInfo {
    qrcode: String
    bankInformation: BankDetails
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type User {
    id: ID!
    name: String!
    email: String
    avatar: String
    bankInfo: BankInfo
    isGuest: Boolean
  }

  type Journey {
    id: ID!
    name: String!
    startDate: String
    endDate: String
    leader: User!
    members: [User]!
    status: String!
    createdAt: String!
    expenses: [Expense]
  }

  type Split {
    user: User!
    baseAmount: Float!
    deduction: Float
    reason: String
  }

  type Expense {
    id: ID!
    journey: Journey!
    payer: User!
    totalAmount: Float!
    description: String!
    splits: [Split]!
    createdAt: String!
    hasImage: Boolean
  }

  type Query {
    getJourneyDetails(journeyId: ID!): Journey
    getUsers: [User]
    me: User
  }

  type Mutation {
    createUser(name: String!, email: String): User
    createJourney(
      leaderId: ID!
      name: String!
      startDate: String
      endDate: String
    ): Journey
    joinJourney(journeyId: ID!, userId: ID!): Journey
    addExpense(
      journeyId: ID!
      payerId: ID!
      totalAmount: Float!
      description: String!
      splits: [SplitInput]!
      imageBase64: String
    ): Expense
    updateExpense(
      expenseId: ID!
      payerId: ID
      totalAmount: Float
      description: String
      splits: [SplitInput]
      imageBase64: String
    ): Expense
    deleteExpense(expenseId: ID!): Boolean
    joinAsGuest(name: String!, journeyId: ID!): AuthPayload
    login(userId: ID!, journeyId: ID!): AuthPayload
    updateBankInfo(
      bankName: String
      accountNumber: String
      accountName: String
    ): User
  }

  input SplitInput {
    userId: ID!
    baseAmount: Float!
    deduction: Float
    reason: String
  }
`;

export default typeDefs;

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
    token: String
    user: User
    journeySlug: String
    journeyId: String
    isPending: Boolean
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
    slug: String!
    name: String!
    startDate: String
    endDate: String
    leader: User!
    members: [User]!
    pendingMembers: [User]
    status: String!
    createdAt: String!
    expireAt: String
    expenses: [Expense]
    hasPassword: Boolean
    requireApproval: Boolean
    isLocked: Boolean
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

  type GuestUserResponse {
    user: User
    inviteLink: String
    token: String
  }

  type Query {
    getJourneyDetails(slug: String!): Journey
    getUserJourneys: [Journey]
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
    createGuestUser(journeyId: ID!, name: String!): GuestUserResponse
    regenerateGuestInvite(journeyId: ID!, userId: ID!): GuestUserResponse
    claimGuestUser(token: String!, password: String): AuthPayload
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
    leaveJourney(journeyId: ID!, leaderTimezoneOffsetMinutes: Int): Journey
    generateJoinToken(journeyId: ID!): String
    joinJourneyViaToken(
      token: String!
      name: String
      password: String
    ): AuthPayload
    setJourneyPassword(journeyId: ID!, password: String): Boolean
    toggleApprovalRequirement(
      journeyId: ID!
      requireApproval: Boolean!
    ): Journey
    toggleJourneyLock(journeyId: ID!, isLocked: Boolean!): Journey
    approveJoinRequest(journeyId: ID!, userId: ID!): Journey
    rejectJoinRequest(journeyId: ID!, userId: ID!): Journey
    approveAllJoinRequests(journeyId: ID!): Journey
    rejectAllJoinRequests(journeyId: ID!): Journey
    removeMember(journeyId: ID!, memberId: ID!): Journey
  }

  input SplitInput {
    userId: ID!
    baseAmount: Float!
    deduction: Float
    reason: String
  }
`;

export default typeDefs;

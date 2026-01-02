/* eslint-disable @typescript-eslint/no-explicit-any */
import { gql } from "@apollo/client";
import type { ApolloCache } from "@apollo/client";

export function addExpenseToJourneyCache(
  cache: ApolloCache,
  journeyId: string,
  expense: any
) {
  try {
    const journeyCacheId = cache.identify({
      __typename: "Journey",
      id: journeyId,
    });
    if (!journeyCacheId) return;

    const fragment = gql`
      fragment NewExpense on Expense {
        id
        description
        totalAmount
        hasImage
        payer {
          id
          name
        }
        splits {
          baseAmount
          deduction
          reason
          user {
            id
            name
          }
        }
        createdAt
      }
    `;

    const newRef = cache.writeFragment({ fragment, data: expense });
    cache.modify({
      id: journeyCacheId,
      fields: {
        expenses(existing = []) {
          return [newRef, ...existing];
        },
      },
    });
  } catch (e) {
    try {
      (cache as any).refetchQueries({ include: "active" });
    } catch (_) {}
  }
}

export function removeExpenseFromJourneyCache(
  cache: ApolloCache,
  journeyId: string | undefined,
  expenseId: string
) {
  try {
    if (journeyId) {
      const journeyCacheId = cache.identify({
        __typename: "Journey",
        id: journeyId,
      });
      if (journeyCacheId) {
        cache.modify({
          id: journeyCacheId,
          fields: {
            expenses(existingRefs = [], { readField }) {
              return existingRefs.filter(
                (ref: any) => readField("id", ref) !== expenseId
              );
            },
          },
        });
        return;
      }
    }
    const expId = cache.identify({ __typename: "Expense", id: expenseId });
    if (expId) cache.evict({ id: expId });
    cache.gc();
  } catch (e) {
    try {
      (cache as any).refetchQueries({ include: "active" });
    } catch (_) {}
  }
}

export function addMemberToJourneyCache(
  cache: ApolloCache,
  journeyId: string,
  user: any
) {
  try {
    const journeyCacheId = cache.identify({
      __typename: "Journey",
      id: journeyId,
    });
    if (!journeyCacheId) return;
    const fragment = gql`
      fragment NewUser on User {
        id
        name
      }
    `;
    const newRef = cache.writeFragment({ fragment, data: user });
    cache.modify({
      id: journeyCacheId,
      fields: {
        members(existing = []) {
          return [...existing, newRef];
        },
      },
    });
  } catch (e) {
    try {
      (cache as any).refetchQueries({ include: "active" });
    } catch (_) {}
  }
}

export function updateJourneyMembers(
  cache: ApolloCache,
  journeyId: string,
  members: any[],
  pendingMembers?: any[]
) {
  try {
    const journeyCacheId = cache.identify({
      __typename: "Journey",
      id: journeyId,
    });
    if (!journeyCacheId) return;
    const userFrag = gql`
      fragment U on User {
        id
        name
      }
    `;
    const memberRefs = members.map((m) =>
      cache.writeFragment({ fragment: userFrag, data: m })
    );
    const pendingRefs = (pendingMembers || []).map((p) =>
      cache.writeFragment({ fragment: userFrag, data: p })
    );
    cache.modify({
      id: journeyCacheId,
      fields: {
        members() {
          return memberRefs;
        },
        pendingMembers() {
          return pendingRefs;
        },
      },
    });
  } catch (e) {
    try {
      (cache as any).refetchQueries({ include: "active" });
    } catch (_) {}
  }
}

export default {
  addExpenseToJourneyCache,
  removeExpenseFromJourneyCache,
  addMemberToJourneyCache,
  updateJourneyMembers,
};

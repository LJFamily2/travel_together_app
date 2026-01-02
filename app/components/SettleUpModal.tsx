/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { useCurrency } from "../context/CurrencyContext";
import { gql } from "@apollo/client";
import { useApolloClient } from "@apollo/client/react";
import { useMutation } from "@apollo/client/react";
import toast from "react-hot-toast";

const ADD_EXPENSE = gql`
  mutation AddExpense(
    $journeyId: ID!
    $payerId: ID!
    $totalAmount: Float!
    $description: String!
    $splits: [SplitInput]!
  ) {
    addExpense(
      journeyId: $journeyId
      payerId: $payerId
      totalAmount: $totalAmount
      description: $description
      splits: $splits
    ) {
      id
    }
  }
`;

const UPDATE_EXPENSE = gql`
  mutation UpdateExpense(
    $expenseId: ID!
    $splits: [SplitInput]!
    $totalAmount: Float!
  ) {
    updateExpense(
      expenseId: $expenseId
      splits: $splits
      totalAmount: $totalAmount
    ) {
      id
    }
  }
`;

const DELETE_EXPENSE = gql`
  mutation DeleteExpense($expenseId: ID!) {
    deleteExpense(expenseId: $expenseId)
  }
`;

interface Member {
  id: string;
  name: string;
}

interface Split {
  user: {
    id: string;
  };
  baseAmount: number;
  deduction: number;
  reason?: string;
}

interface Expense {
  id: string;
  totalAmount: number;
  payer: {
    id: string;
  };
  splits: Split[];
  createdAt?: string;
}

interface SettleUpModalProps {
  journeyId: string;
  currentUser: Member;
  members: Member[];
  expenses: Expense[];
  isOpen: boolean;
  onClose: () => void;
}

export default function SettleUpModal({
  journeyId,
  currentUser,
  members,
  expenses,
  isOpen,
  onClose,
}: SettleUpModalProps) {
  const { formatCurrency } = useCurrency();
  const [recipientId, setRecipientId] = useState("");
  const [deduction, setDeduction] = useState("");
  const [reason, setReason] = useState("");
  const client = useApolloClient();
  const [addExpense, { loading }] = useMutation(ADD_EXPENSE, {
    update(cache, { data }: any, { variables }) {
      const added = data?.addExpense;
      if (!added) return;
      try {
        const journeyCacheId = cache.identify({
          __typename: "Journey",
          id: journeyId,
        });
        if (!journeyCacheId) return;

        const fragment = gql`
          fragment NewExpense on Expense {
            id
            totalAmount
            description
            hasImage
            payer {
              id
            }
            splits {
              baseAmount
              deduction
              reason
              user {
                id
              }
            }
            createdAt
          }
        `;

        const newRef = cache.writeFragment({ fragment, data: added });
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
          client.refetchQueries({ include: "active" });
        } catch (_) {}
      }
    },
    optimisticResponse: (vars: any) => ({
      addExpense: {
        __typename: "Expense",
        id: `temp-${Date.now()}`,
        totalAmount: vars.totalAmount,
        description: vars.description,
        hasImage: false,
        payer: { __typename: "User", id: vars.payerId },
        splits: vars.splits.map((s: any) => ({
          __typename: "Split",
          baseAmount: s.baseAmount,
          deduction: s.deduction || 0,
          reason: s.reason || "",
          user: { __typename: "User", id: s.userId },
        })),
        createdAt: Date.now().toString(),
      },
    }),
  });

  // Mutations for editing/removing deductions
  const [updateExpense] = useMutation(UPDATE_EXPENSE);
  const [deleteExpense] = useMutation(DELETE_EXPENSE);
  const [editing, setEditing] = useState<{
    expenseId: string;
    amount: number;
    reason: string;
    splitUserId: string;
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState<Record<string, boolean>>({});

  const toggleMenu = (expenseId: string) => {
    setMenuOpen((prev) => ({ ...prev, [expenseId]: !prev[expenseId] }));
  };
  const closeAllMenus = () => setMenuOpen({});

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Calculate balances
  const balances: Record<string, number> = {};
  // Store deduction history for each user, include metadata for edit/delete
  const deductionHistory: Record<
    string,
    {
      amount: number;
      reason: string;
      date: string;
      expenseId: string;
      payerId: string;
      splitUserId: string;
    }[]
  > = {};

  expenses.forEach((expense) => {
    const payerId = expense.payer.id;
    const expenseId = expense.id;

    // Check if this is a deduction transaction created by me for someone else
    // Or created by someone else for me
    // A deduction transaction has totalAmount > 0, and splits with baseAmount 0 and deduction > 0

    const isDeduction = expense.splits.some(
      (s) => s.baseAmount === 0 && s.deduction > 0
    );

    if (isDeduction) {
      // If I created it (payerId === currentUser.id), and it's for someone else
      if (payerId === currentUser.id) {
        expense.splits.forEach((split) => {
          if (split.user.id !== currentUser.id && split.deduction > 0) {
            if (!deductionHistory[split.user.id])
              deductionHistory[split.user.id] = [];
            deductionHistory[split.user.id].push({
              amount: split.deduction,
              reason: split.reason || "Deduction",
              date: expense.createdAt || "", // Assuming createdAt exists on expense type, if not need to add
              expenseId,
              payerId,
              splitUserId: split.user.id,
            });
          }
        });
      }
      // If someone else created it for me (payerId === otherUser), and split is for me
      // But wait, if they created it, they are the payer.
      // If Tuan owes Quang. Quang creates deduction. Payer = Quang. Split for Tuan: deduction > 0.
      // If Tuan views Settle Up. He sees he owes Quang.
      // Does he see the deduction history?
      // The requirement says "both involving user can see the deduction detail".
      // So if I am Tuan, I should see deductions Quang made for me.
      // Payer = Quang (other). Split for Me (Tuan).
      if (payerId !== currentUser.id) {
        const mySplit = expense.splits.find(
          (s) => s.user.id === currentUser.id
        );
        if (mySplit && mySplit.deduction > 0) {
          if (!deductionHistory[payerId]) deductionHistory[payerId] = [];
          deductionHistory[payerId].push({
            amount: mySplit.deduction,
            reason: mySplit.reason || "Deduction",
            date: expense.createdAt || "",
            expenseId,
            payerId,
            splitUserId: mySplit.user.id,
          });
        }
      }
    }

    if (payerId === currentUser.id) {
      // I paid, others owe me
      expense.splits.forEach((split) => {
        if (split.user.id !== currentUser.id) {
          const amount = split.baseAmount - (split.deduction || 0);
          balances[split.user.id] = (balances[split.user.id] || 0) + amount;
        }
      });
    } else {
      // Someone else paid
      const mySplit = expense.splits.find((s) => s.user.id === currentUser.id);
      if (mySplit) {
        // I owe the payer
        const amount = mySplit.baseAmount - (mySplit.deduction || 0);
        balances[payerId] = (balances[payerId] || 0) - amount;
      }
    }
  });

  const handleSettle = async () => {
    if (!recipientId || !deduction) return;

    const recipient = members.find((m) => m.id === recipientId);
    if (!recipient) return;

    const deductionAmount = parseFloat(deduction);
    if (isNaN(deductionAmount) || deductionAmount <= 0) {
      toast.error("Please enter a valid deduction amount.");
      return;rId: currentUser.id, // I am the creator/payer
          totalAmount: deductionAmount,
          description: finalReason,
          splits: [
            {
              userId: recipientId,
              baseAmount: 0,
              deduction: deductionAmount,
              reason: reason || "Deduction",
            },
            {
              userId: currentUser.id, // Add myself so I can see it in feed
              baseAmount: 0,
              deduction: 0,
              reason: "Creator of deduction",
            },
          ],
        },
      });
      toast.success("Deduction recorded!");
      onClose();
      // Reset form
      setRecipientId("");
      setDeduction("");
      setReason("");
    } catch (err) {
      console.error("Error recording deduction:", err);
      toast.error("Failed to record deduction.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white p-6 sm:p-8 rounded-[28px] shadow-xl w-full max-w-lg mx-4 sm:mx-0 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Settle Up</h3>
        </div>

        <div className="mb-6">
          <h4 className="font-semibold mb-2 text-sm text-gray-600">Balances</h4>
          <div className="space-y-2">
            {members
              .filter((m) => m.id !== currentUser.id)
              .map((member) => {
                const balance = balances[member.id] || 0;
                if (Math.abs(balance) < 0.01) return null;

                const isOwed = balance > 0;
                const deductions = deductionHistory[member.id] || [];
                const isExpanded = expandedUserId === member.id;

                return (
                  <div
                    key={member.id}
                    className="bg-gray-50 rounded-xl overflow-visible"
                  >
                    <div
                      className="flex justify-between items-center text-sm p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() =>
                        setExpandedUserId(isExpanded ? null : member.id)
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span>{isExpanded ? "▼" : "▶"}</span>
                        <span>{member.name}</span>
                      </div>
                      <span
                        className={
                          isOwed
                            ? "text-green-600 font-medium"
                            : "text-red-600 font-medium"
                        }
                      >
                        {isOwed ? "owes you" : "you owe"} $
                        {formatCurrency(Math.abs(balance))}
                      </span>
                    </div>

                    {isExpanded && deductions.length > 0 && (
                      <div className="p-3 sm:p-4 bg-gray-100 text-sm sm:text-xs border-t border-gray-200 rounded-b-lg">
                        <p className="font-semibold mb-1 text-gray-500">
                          Deduction History:
                        </p>

                        {editing &&
                          editing.expenseId &&
                          deductions.some(
                            (d) => d.expenseId === editing.expenseId
                          ) && (
                            <div className="mb-2 p-2 bg-white rounded-lg border border-gray-200">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-stretch mb-2">
                                <label className="flex flex-col text-xs">
                                  <span className="text-gray-500 mb-1">
                                    Amount
                                  </span>
                                  <input
                                    type="number"
                                    value={editing.amount}
                                    onChange={(e) =>
                                      setEditing(
                                        (prev) =>
                                          prev && {
                                            ...prev,
                                            amount: parseFloat(e.target.value),
                                          }
                                      )
                                    }
                                    className="w-full sm:w-48 p-1 border border-gray-200 rounded-lg text-sm text-right"
                                  />
                                </label>

                                <label className="flex flex-col text-xs">
                                  <span className="text-gray-500 mb-1">
                                    Reason
                                  </span>
                                  <input
                                    type="text"
                                    value={editing.reason}
                                    onChange={(e) =>
                                      setEditing(
                                        (prev) =>
                                          prev && {
                                            ...prev,
                                            reason: e.target.value,
                                          }
                                      )
                                    }
                                    className="p-1 border border-gray-200 rounded-lg text-sm flex-1 min-w-0"
                                  />
                                </label>
                              </div>
                              <div className="flex flex-col sm:flex-row gap-2 justify-end w-full">
                                <button
                                  onClick={() => setEditing(null)}
                                  className="px-2 py-1 bg-gray-200 rounded text-xs cursor-pointer w-full sm:w-auto text-center"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={async () => {
                                    if (!editing) return;
                                    try {
                                      const expense = expenses.find(
                                        (e) => e.id === editing.expenseId
                                      );
                                      if (!expense)
                                        throw new Error("Expense not found");

                                      const splitsInput = expense.splits.map(
                                        (s) => ({
                                          userId: s.user.id,
                                          baseAmount: s.baseAmount,
                                          deduction:
                                            s.user.id === editing.splitUserId
                                              ? editing.amount || 0
                                              : s.deduction || 0,
                                          reason:
                                            s.user.id === editing.splitUserId
                                              ? editing.reason || s.reason
                                              : s.reason,
                                        })
                                      );

                                      // compute new total
                                      const sumBase = splitsInput.reduce(
                                        (acc, s) => acc + (s.baseAmount || 0),
                                        0
                                      );
                                      const sumDeductions = splitsInput.reduce(
                                        (acc, s) => acc + (s.deduction || 0),
                                        0
                                      );
                                      const totalFromSplits =
                                        sumBase + sumDeductions;

                                      await updateExpense({
                                        variables: {
                                          expenseId: editing.expenseId,
                                          splits: splitsInput,
                                          totalAmount: totalFromSplits,
                                        },
                                      });

                                      toast.success("Deduction updated");
                                      setEditing(null);
                                      onClose();
                                    } catch (err) {
                                      console.error(
                                        "Failed to update deduction:",
                                        err
                                      );
                                      toast.error("Failed to update deduction");
                                    }
                                  }}
                                  className="px-2 py-1 bg-blue-600 text-white rounded text-xs cursor-pointer w-full sm:w-auto text-center"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          )}

                        {deductions.map((d, idx) => (
                          <div
                            key={idx}
                            className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-2 border-b border-gray-200 last:border-0"
                          >
                            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-1 min-w-0">
                              <span className="truncate text-sm">
                                {d.reason}
                              </span>
                              <span className="text-xs text-gray-400 flex-none mt-1 sm:mt-0 ml-0 sm:ml-2">
                                {d.date}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 flex-none mt-2 sm:mt-0">
                              <span className="font-mono whitespace-nowrap">
                                -${formatCurrency(d.amount)}
                              </span>

                              {d.payerId === currentUser.id && (
                                <div className="relative">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleMenu(d.expenseId);
                                    }}
                                    aria-label="Open actions"
                                    className="p-1 rounded hover:bg-gray-200 text-gray-600 cursor-pointer"
                                  >
                                    ⋯
                                  </button>

                                  {menuOpen[d.expenseId] && (
                                    <div className="absolute right-2 mt-2 min-w-[120px] max-w-xs bg-white border rounded shadow-sm z-50">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditing({
                                            expenseId: d.expenseId,
                                            amount: d.amount,
                                            reason: d.reason || "",
                                            splitUserId: d.splitUserId,
                                          });
                                          closeAllMenus();
                                        }}
                                        className="w-full text-left rounded px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          try {
                                            await deleteExpense({
                                              variables: {
                                                expenseId: d.expenseId,
                                              },
                                            });
                                            toast.success("Deduction removed");
                                            closeAllMenus();
                                            onClose();
                                          } catch (err) {
                                            console.error(
                                              "Failed to delete deduction:",
                                              err
                                            );
                                            toast.error(
                                              "Failed to remove deduction"
                                            );
                                          }
                                        }}
                                        className="w-full text-left px-3 py-2 rounded text-sm text-red-600 hover:bg-gray-50 cursor-pointer"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {isExpanded && deductions.length === 0 && (
                      <div className="p-3 bg-gray-100 text-xs text-gray-500 italic">
                        No deductions recorded.
                      </div>
                    )}
                  </div>
                );
              })}
            {Object.keys(balances).every(
              (k) => Math.abs(balances[k]) < 0.01
            ) && (
              <p className="text-sm text-gray-500 italic">
                No outstanding balances.
              </p>
            )}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1 text-gray-700">
            Member (who owes you)
          </label>
          <select
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            className="w-full p-2 border border-gray-200 rounded-lg bg-white cursor-pointer"
          >
            <option className="cursor-pointer" value="">
              Select a member
            </option>
            {members
              .filter((m) => m.id !== currentUser.id)
              // Filter: Only show members who owe ME money
              .filter((m) => (balances[m.id] || 0) > 0)
              // Filter out duplicates by name just in case
              .filter(
                (m, index, self) =>
                  index === self.findIndex((t) => t.name === m.name)
              )
              .map((m) => (
                <option key={m.id} value={m.id} className="cursor-pointer">
                  {m.name} (Owes: ${formatCurrency(balances[m.id] || 0)})
                </option>
              ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1 text-gray-700">
            Amount to Deduct
          </label>
          <input
            type="number"
            value={deduction}
            onChange={(e) => setDeduction(e.target.value)}
            className="w-full p-2 border border-gray-200 rounded-lg"
            placeholder="0.00"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1 text-gray-700">
            Reason for Deduction
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full p-2 border border-gray-200 rounded-lg"
            placeholder="e.g. Lunch yesterday"
          />
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSettle}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors cursor-pointer"
          >
            {loading ? "Processing..." : "Record Deduction"}
          </button>
        </div>
      </div>
    </div>
  );
}

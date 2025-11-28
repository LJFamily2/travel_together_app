"use client";

import { useState } from "react";
import { gql } from "@apollo/client";
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

const UPDATE_BANK_INFO = gql`
  mutation UpdateBankInfo(
    $bankName: String
    $accountNumber: String
    $accountName: String
  ) {
    updateBankInfo(
      bankName: $bankName
      accountNumber: $accountNumber
      accountName: $accountName
    ) {
      id
      bankInfo {
        bankInformation {
          name
          number
          userName
        }
      }
    }
  }
`;

interface Member {
  id: string;
  name: string;
  bankInfo?: {
    bankInformation?: {
      name: string;
      number: string;
      userName?: string;
    };
  };
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
  const [recipientId, setRecipientId] = useState("");
  const [deduction, setDeduction] = useState("");
  const [reason, setReason] = useState("");
  const [addExpense, { loading }] = useMutation(ADD_EXPENSE);

  // Bank Info State
  const [showBankInfo, setShowBankInfo] = useState(false);
  const [bankName, setBankName] = useState(
    currentUser.bankInfo?.bankInformation?.name || ""
  );
  const [accountNumber, setAccountNumber] = useState(
    currentUser.bankInfo?.bankInformation?.number || ""
  );
  const [accountName, setAccountName] = useState(
    currentUser.bankInfo?.bankInformation?.userName || ""
  );
  const [updateBankInfo, { loading: updatingBank }] =
    useMutation(UPDATE_BANK_INFO);

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Calculate balances
  const balances: Record<string, number> = {};
  // Store deduction history for each user
  const deductionHistory: Record<
    string,
    { amount: number; reason: string; date: string }[]
  > = {};

  expenses.forEach((expense) => {
    const payerId = expense.payer.id;

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

  const handleUpdateBankInfo = async () => {
    try {
      await updateBankInfo({
        variables: {
          bankName,
          accountNumber,
          accountName,
        },
      });
      toast.success("Bank info updated!");
      setShowBankInfo(false);
    } catch (err) {
      console.error("Error updating bank info:", err);
      toast.error("Failed to update bank info");
    }
  };

  const handleSettle = async () => {
    if (!recipientId || !deduction) return;

    const recipient = members.find((m) => m.id === recipientId);
    if (!recipient) return;

    const deductionAmount = parseFloat(deduction);
    if (isNaN(deductionAmount) || deductionAmount <= 0) {
      toast.error("Please enter a valid deduction amount.");
      return;
    }

    // Logic:
    // We are reducing the debt of someone who owes US.
    // This is equivalent to them paying us.
    // So we create an expense where THEY are the payer, and WE are the beneficiary.
    // Payer: recipientId (The person who owes me)
    // Split User: currentUser.id (Me)
    // Amount: deductionAmount

    const finalReason = reason ? `Deduction: ${reason}` : `Deduction`;

    try {
      await addExpense({
        variables: {
          journeyId,
          payerId: currentUser.id, // I am the creator/payer
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
      <div className="bg-white p-8 rounded-[34px] shadow-xl w-96 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Settle Up</h3>
          <button
            onClick={() => setShowBankInfo(!showBankInfo)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showBankInfo ? "Hide My Bank Info" : "Edit My Bank Info"}
          </button>
        </div>

        {showBankInfo && (
          <div className="mb-6 p-4 bg-blue-50 rounded-2xl border border-blue-100">
            <h4 className="font-semibold mb-2 text-sm">My Bank Details</h4>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Bank Name"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full p-2 text-sm border border-gray-200 rounded-lg"
              />
              <input
                type="text"
                placeholder="Account Number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="w-full p-2 text-sm border border-gray-200 rounded-lg"
              />
              <input
                type="text"
                placeholder="Account Name"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="w-full p-2 text-sm border border-gray-200 rounded-lg"
              />
              <button
                onClick={handleUpdateBankInfo}
                disabled={updatingBank}
                className="w-full py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                {updatingBank ? "Saving..." : "Save Bank Info"}
              </button>
            </div>
          </div>
        )}

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
                    className="bg-gray-50 rounded-xl overflow-hidden"
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
                        {Math.abs(balance).toFixed(2)}
                      </span>
                    </div>

                    {isExpanded && deductions.length > 0 && (
                      <div className="p-3 bg-gray-100 text-xs border-t border-gray-200">
                        <p className="font-semibold mb-1 text-gray-500">
                          Deduction History:
                        </p>
                        {deductions.map((d, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between py-1 border-b border-gray-200 last:border-0"
                          >
                            <span>{d.reason}</span>
                            <span className="font-mono">
                              -${d.amount.toFixed(2)}
                            </span>
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
            className="w-full p-2 border border-gray-200 rounded-lg bg-white"
          >
            <option value="">Select a member</option>
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
                <option key={m.id} value={m.id}>
                  {m.name} (Owes: ${(balances[m.id] || 0).toFixed(2)})
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

        {recipientId && (
          <div className="mb-4 p-3 bg-gray-50 rounded-xl text-sm border border-gray-100">
            <p className="font-semibold mb-1">Bank Details:</p>
            {members.find((m) => m.id === recipientId)?.bankInfo
              ?.bankInformation ? (
              <>
                <p>
                  <span className="text-gray-500">Bank:</span>{" "}
                  {
                    members.find((m) => m.id === recipientId)?.bankInfo
                      ?.bankInformation?.name
                  }
                </p>
                <p>
                  <span className="text-gray-500">Account:</span>{" "}
                  {
                    members.find((m) => m.id === recipientId)?.bankInfo
                      ?.bankInformation?.number
                  }
                </p>
              </>
            ) : (
              <p className="text-gray-500">No bank info available.</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSettle}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors"
          >
            {loading ? "Processing..." : "Record Deduction"}
          </button>
        </div>
      </div>
    </div>
  );
}

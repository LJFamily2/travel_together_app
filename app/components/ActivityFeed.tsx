"use client";

import Image from "next/image";
import { useState, ChangeEvent } from "react";
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import toast from "react-hot-toast";

interface Member {
  id: string;
  name: string;
}

interface Expense {
  id: string;
  description: string;
  totalAmount: number;
  payer: {
    id?: string;
    name: string;
  };
  splits: {
    user: {
      id: string;
      name: string;
    };
    baseAmount: number;
    deduction: number;
    reason?: string;
  }[];
  hasImage: boolean;
  createdAt: string;
}

interface ActivityFeedProps {
  expenses: Expense[];
  currentUserId: string;
  members: Member[];
}

const UPDATE_EXPENSE = gql`
  mutation UpdateExpense(
    $expenseId: ID!
    $payerId: ID
    $totalAmount: Float
    $description: String
    $splits: [SplitInput]
    $imageBase64: String
  ) {
    updateExpense(
      expenseId: $expenseId
      payerId: $payerId
      totalAmount: $totalAmount
      description: $description
      splits: $splits
      imageBase64: $imageBase64
    ) {
      id
      totalAmount
      description
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
    }
  }
`;

const DELETE_EXPENSE = gql`
  mutation DeleteExpense($expenseId: ID!) {
    deleteExpense(expenseId: $expenseId)
  }
`;

export default function ActivityFeed({
  expenses,
  currentUserId,
  members,
}: ActivityFeedProps) {
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Edit Form State
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [payerId, setPayerId] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isAllSelected, setIsAllSelected] = useState(true);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [updateExpense, { loading: updating }] = useMutation(UPDATE_EXPENSE);
  const [deleteExpense, { loading: deleting }] = useMutation(DELETE_EXPENSE);

  const filteredExpenses = expenses.filter((expense) => {
    const involvesUser = expense.splits.some(
      (s) => s.user.id === currentUserId
    );
    const isDeduction =
      expense.splits.some((s) => s.baseAmount === 0 && s.deduction > 0) ||
      expense.description.toLowerCase().startsWith("deduction") ||
      expense.description.toLowerCase().startsWith("settlement");

    return involvesUser && !isDeduction;
  });

  const totalInvolvedAmount = filteredExpenses.reduce(
    (sum, expense) => sum + expense.totalAmount,
    0
  );

  // Unique members for selection
  const uniqueMembers = members.filter(
    (m, index, self) => index === self.findIndex((t) => t.name === m.name)
  );

  const startEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setAmount(expense.totalAmount.toString());
    setDescription(expense.description);
    setPayerId(expense.payer.id || currentUserId);
    setImageBase64(null); // Reset image, only send if changed

    // Determine split state
    const splitUserIds = expense.splits.map((s) => s.user.id);
    const allMembersInvolved = uniqueMembers.every((m) =>
      splitUserIds.includes(m.id)
    );

    setIsAllSelected(allMembersInvolved);
    setSelectedMemberIds(splitUserIds);
  };

  const closeEdit = () => {
    setEditingExpense(null);
    setAmount("");
    setDescription("");
    setPayerId("");
    setImageBase64(null);
    setIsAllSelected(true);
    setSelectedMemberIds([]);
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMemberIds((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      } else {
        return [...prev, memberId];
      }
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      toast.error("Enter a valid non-negative number");
      return;
    }

    let splitMembers = uniqueMembers;
    if (!isAllSelected) {
      splitMembers = uniqueMembers.filter((m) =>
        selectedMemberIds.includes(m.id)
      );
    }

    if (splitMembers.length === 0) {
      toast.error(
        "Please select at least one person to split the expense with."
      );
      return;
    }

    const splitAmount = parsedAmount / splitMembers.length;
    const splits = splitMembers.map((m) => ({
      userId: m.id,
      baseAmount: parseFloat(splitAmount.toFixed(2)),
      deduction: 0, // Reset deduction on full edit for simplicity, or we could try to preserve it but it's complex
    }));

    try {
      await updateExpense({
        variables: {
          expenseId: editingExpense.id,
          payerId,
          totalAmount: parsedAmount,
          description,
          splits,
          imageBase64, // Only sends if changed (not null)
        },
      });
      closeEdit();
      toast.success("Expense updated successfully");
    } catch (err) {
      console.error("Failed to update expense:", err);
      toast.error("Failed to update expense: " + (err as Error).message);
    }
  };

  const handleDelete = (expenseId: string) => {
    toast((t) => (
      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm">Delete this expense?</span>
        <div className="flex gap-2">
          <button
            className="bg-red-500 text-white px-3 py-1 rounded-lg text-xs cursor-pointer"
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                await deleteExpense({ variables: { expenseId } });
                toast.success("Expense deleted successfully");
              } catch (err) {
                console.error("Failed to delete expense:", err);
                toast.error(
                  "Failed to delete expense: " + (err as Error).message
                );
              }
            }}
          >
            Yes
          </button>
          <button
            className="bg-gray-200 px-3 py-1 rounded-lg text-xs cursor-pointer"
            onClick={() => toast.dismiss(t.id)}
          >
            No
          </button>
        </div>
      </div>
    ));
  };

  return (
    <div className="mt-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold">Activity Feed</h3>
        <span className="font-semibold text-gray-700">
          Total: ${totalInvolvedAmount.toFixed(2)}
        </span>
      </div>
      <div className="space-y-4">
        {filteredExpenses.map((expense) => {
          const mySplit = expense.splits.find(
            (s) => s.user.id === currentUserId
          );
          const myShare = mySplit
            ? mySplit.baseAmount - (mySplit.deduction || 0)
            : 0;

          const isPayer =
            expense.payer.id && expense.payer.id === currentUserId;

          return (
            <div
              key={expense.id}
              className="p-6 border border-gray-100 rounded-3xl shadow-sm bg-white"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-lg">{expense.description}</p>
                  <p className="text-sm text-gray-500">
                    Paid by {expense.payer.name} • $
                    {expense.totalAmount.toFixed(2)}
                  </p>
                  <p className="text-sm font-medium text-black mt-1">
                    Your share: ${myShare.toFixed(2)}
                    {mySplit && mySplit.deduction > 0 && (
                      <span className="text-xs text-gray-500 block">
                        (Deduction: ${mySplit.deduction.toFixed(2)} -{" "}
                        {mySplit.reason || "No reason provided"})
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    <span className="font-medium">Split with: </span>
                    {expense.splits.map((s) => s.user.name).join(", ")}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(parseInt(expense.createdAt)).toLocaleString()}
                  </p>
                </div>
                {expense.hasImage && (
                  <div className="relative h-16 w-16">
                    <Image
                      src={`/api/image/${expense.id}`}
                      alt="Receipt"
                      fill
                      className="object-cover rounded-xl"
                    />
                  </div>
                )}

                {isPayer && (
                  <div className="flex flex-col gap-2 ml-2">
                    <button
                      onClick={() => startEdit(expense)}
                      className="px-3 py-1 bg-gray-100 rounded-full hover:bg-gray-200 text-sm transition-colors cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(expense.id)}
                      className="px-3 py-1 bg-red-50 text-red-600 rounded-full hover:bg-red-100 text-sm transition-colors cursor-pointer"
                      disabled={deleting}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {expenses.length === 0 && (
          <p className="text-gray-500">No expenses yet.</p>
        )}
      </div>

      {/* Edit Modal */}
      {editingExpense && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-[34px] shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Edit Expense</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Description
                </label>
                <input
                  className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white transition-colors"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white transition-colors"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Paid By
                </label>
                <select
                  className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white transition-colors"
                  value={payerId}
                  onChange={(e) => setPayerId(e.target.value)}
                >
                  {uniqueMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Split Logic */}
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">
                  Split With
                </label>
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      checked={isAllSelected}
                      onChange={() => setIsAllSelected(true)}
                      className="mr-2"
                    />
                    Everyone
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      checked={!isAllSelected}
                      onChange={() => setIsAllSelected(false)}
                      className="mr-2"
                    />
                    Select Members
                  </label>
                </div>

                {!isAllSelected && (
                  <div className="border border-gray-200 p-2 rounded-xl max-h-40 overflow-y-auto">
                    <input
                      type="text"
                      placeholder="Search members..."
                      className="w-full p-2 mb-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {uniqueMembers
                      .filter((m) =>
                        m.name.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map((member) => (
                        <div key={member.id} className="flex items-center mb-1">
                          <input
                            type="checkbox"
                            checked={selectedMemberIds.includes(member.id)}
                            onChange={() => toggleMemberSelection(member.id)}
                            className="mr-2"
                          />
                          <span>{member.name}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Receipt Image (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="w-full text-sm"
                />
                {imageBase64 && (
                  <div className="mt-2 relative h-20 w-20">
                    <Image
                      src={imageBase64}
                      alt="Preview"
                      fill
                      className="object-cover rounded-xl"
                    />
                  </div>
                )}
                {!imageBase64 && editingExpense.hasImage && (
                  <p className="text-xs text-gray-500 mt-1">
                    Current image will be kept if no new image is selected.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="px-4 py-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="px-4 py-2 bg-black text-white rounded-full hover:opacity-80 transition-opacity cursor-pointer"
                >
                  {updating ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

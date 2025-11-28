"use client";

import { useState, ChangeEvent } from "react";
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import Image from "next/image";
import toast from "react-hot-toast";

const ADD_EXPENSE = gql`
  mutation AddExpense(
    $journeyId: ID!
    $payerId: ID!
    $totalAmount: Float!
    $description: String!
    $splits: [SplitInput]!
    $imageBase64: String
  ) {
    addExpense(
      journeyId: $journeyId
      payerId: $payerId
      totalAmount: $totalAmount
      description: $description
      splits: $splits
      imageBase64: $imageBase64
    ) {
      id
      description
      totalAmount
      hasImage
    }
  }
`;

interface Member {
  id: string;
  name: string;
}

interface AddExpenseFormProps {
  journeyId: string;
  currentUser: Member;
  members: Member[];
}

export default function AddExpenseForm({
  journeyId,
  currentUser,
  members,
}: AddExpenseFormProps) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [payerId, setPayerId] = useState(currentUser.id);

  // Split logic state
  const [isAllSelected, setIsAllSelected] = useState(true);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [addExpense, { loading, error }] = useMutation(ADD_EXPENSE);

  // Filter unique members for display and logic
  const uniqueMembers = members.filter(
    (m, index, self) => index === self.findIndex((t) => t.name === m.name)
  );

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;

    // Determine who is involved in the split
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

    // Simple equal split logic for now
    const splitAmount = parseFloat(amount) / splitMembers.length;
    const splits = splitMembers.map((m) => ({
      userId: m.id,
      baseAmount: splitAmount,
      deduction: 0,
      reason: "",
    }));

    try {
      await addExpense({
        variables: {
          journeyId,
          payerId: payerId, // Use selected payer
          totalAmount: parseFloat(amount),
          description,
          splits,
          imageBase64,
        },
      });
      // Reset form
      setAmount("");
      setDescription("");
      setImageBase64(null);
      setIsAllSelected(true);
      setSelectedMemberIds([]);
      setPayerId(currentUser.id);
      toast.success("Expense added!");
    } catch (err) {
      console.error("Error adding expense:", err);
      toast.error("Failed to add expense.");
    }
  };

  const filteredMembers = uniqueMembers.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="p-6 border border-gray-100 rounded-[34px] shadow-sm bg-white"
    >
      <h3 className="text-lg font-bold mb-4">Add New Expense</h3>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1 text-gray-700">
          Description
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white transition-colors"
          placeholder="Dinner, Taxi, etc."
          required
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1 text-gray-700">
          Amount
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white transition-colors"
          placeholder="0.00"
          step="0.01"
          required
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1 text-gray-700">
          Paid By
        </label>
        <select
          value={payerId}
          onChange={(e) => setPayerId(e.target.value)}
          className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white transition-colors"
        >
          {uniqueMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} {m.id === currentUser.id ? "(You)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-gray-700">
          Split With
        </label>

        {isAllSelected ? (
          <button
            type="button"
            onClick={() => {
              setIsAllSelected(false);
              // Initialize with all selected so user can deselect
              setSelectedMemberIds(uniqueMembers.map((m) => m.id));
            }}
            className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-80 transition-opacity"
          >
            All
            <span className="text-gray-300 font-bold">✕</span>
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setIsAllSelected(true);
                  setSelectedMemberIds([]);
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                Reset to All
              </button>
              <span className="text-xs text-gray-500">
                {selectedMemberIds.length} selected
              </span>
            </div>

            {uniqueMembers.length > 10 && (
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full p-2 text-sm border border-gray-200 rounded-xl bg-gray-50 mb-2"
              />
            )}

            <div className="flex flex-wrap gap-2">
              {filteredMembers.map((member) => {
                const isSelected = selectedMemberIds.includes(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggleMemberSelection(member.id)}
                    className={`
                      flex items-center justify-center px-3 py-1 rounded-full text-sm border transition-all
                      ${
                        isSelected
                          ? "bg-black text-white border-black shadow-sm"
                          : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                      }
                    `}
                  >
                    {member.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1 text-gray-700">
          Receipt Image
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageChange}
          className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-black file:text-white hover:file:opacity-80"
        />
        {imageBase64 && (
          <Image
            src={imageBase64}
            alt="Preview"
            width={200}
            height={200}
            className="mt-2 h-20 w-auto object-cover rounded-xl"
          />
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-black text-white py-3 px-4 rounded-full font-medium hover:opacity-80 disabled:opacity-50 transition-opacity"
      >
        {loading ? "Adding..." : "Add Expense"}
      </button>
      {error && <p className="text-red-500 mt-2">{error.message}</p>}
    </form>
  );
}

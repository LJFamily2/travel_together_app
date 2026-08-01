"use client";

import { useState } from "react";
import VoiceExpenseModal from "./VoiceExpenseModal";

interface Member {
  id: string;
  name: string;
}

interface VoiceExpenseButtonProps {
  journeyId: string;
  currentUser: Member;
  members: Member[];
  isLocked?: boolean;
  onExpensesAdded?: () => void;
  className?: string;
}

/**
 * Entry point for voice expense entry. Renders a mic button; tapping it
 * opens VoiceExpenseModal, which owns the actual record -> transcribe ->
 * parse -> confirm flow. Kept as a separate component so it can be dropped
 * next to the existing "Add Expense" button/form without restructuring
 * either.
 */
export default function VoiceExpenseButton({
  journeyId,
  currentUser,
  members,
  isLocked = false,
  onExpensesAdded,
  className = "",
}: VoiceExpenseButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (isLocked) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Add expense by voice"
        className={`cursor-pointer inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-800 py-2.5 px-4 rounded-full font-medium hover:bg-gray-50 active:scale-95 transition-all shadow-sm ${className}`}
      >
        <svg
          className="w-5 h-5 text-black"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
          />
        </svg>
        Voice
      </button>

      {isOpen && (
        <VoiceExpenseModal
          journeyId={journeyId}
          currentUser={currentUser}
          members={members}
          onClose={() => setIsOpen(false)}
          onExpensesAdded={() => {
            onExpensesAdded?.();
          }}
        />
      )}
    </>
  );
}

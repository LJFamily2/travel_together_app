"use client";

import { useState } from "react";
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import toast from "react-hot-toast";

const SET_JOURNEY_PASSWORD = gql`
  mutation SetJourneyPassword($journeyId: ID!, $password: String) {
    setJourneyPassword(journeyId: $journeyId, password: $password)
  }
`;

const TOGGLE_APPROVAL_REQUIREMENT = gql`
  mutation ToggleApprovalRequirement(
    $journeyId: ID!
    $requireApproval: Boolean!
  ) {
    toggleApprovalRequirement(
      journeyId: $journeyId
      requireApproval: $requireApproval
    ) {
      id
      requireApproval
    }
  }
`;

const TOGGLE_JOURNEY_LOCK = gql`
  mutation ToggleJourneyLock($journeyId: ID!, $isLocked: Boolean!) {
    toggleJourneyLock(journeyId: $journeyId, isLocked: $isLocked) {
      id
      isLocked
    }
  }
`;

const TOGGLE_JOURNEY_INPUT_LOCK = gql`
  mutation ToggleJourneyInputLock($journeyId: ID!, $isInputLocked: Boolean!) {
    toggleJourneyInputLock(
      journeyId: $journeyId
      isInputLocked: $isInputLocked
    ) {
      id
      isInputLocked
    }
  }
`;

interface JourneySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  journeyId: string;
  currentRequireApproval: boolean;
  currentIsLocked: boolean;
  currentIsInputLocked: boolean;
  hasPassword: boolean;
}

export default function JourneySettingsModal({
  isOpen,
  onClose,
  journeyId,
  currentRequireApproval,
  currentIsLocked,
  currentIsInputLocked,
  hasPassword,
}: JourneySettingsModalProps) {
  const [password, setPassword] = useState("");
  const [requireApproval, setRequireApproval] = useState(
    currentRequireApproval ?? false
  );
  const [isLocked, setIsLocked] = useState(currentIsLocked ?? false);
  const [isInputLocked, setIsInputLocked] = useState(
    currentIsInputLocked ?? false
  );

  const [setJourneyPassword] = useMutation(SET_JOURNEY_PASSWORD);
  const [toggleApproval] = useMutation(TOGGLE_APPROVAL_REQUIREMENT);
  const [toggleLock] = useMutation(TOGGLE_JOURNEY_LOCK);
  const [toggleInputLock] = useMutation(TOGGLE_JOURNEY_INPUT_LOCK);

  const handleSavePassword = async () => {
    try {
      await setJourneyPassword({
        variables: {
          journeyId,
          password: password || null, // Send null to remove password if empty
        },
      });
      toast.success(
        password ? "Password set successfully" : "Password removed"
      );
      setPassword("");
    } catch (error) {
      toast.error("Failed to update password");
      console.error(error);
    }
  };

  const handleToggleApproval = async (checked: boolean) => {
    try {
      await toggleApproval({
        variables: {
          journeyId,
          requireApproval: checked,
        },
      });
      setRequireApproval(checked);
      toast.success("Approval setting updated");
    } catch (error) {
      toast.error("Failed to update approval setting");
      console.error(error);
    }
  };

  const handleToggleLock = async (checked: boolean) => {
    try {
      await toggleLock({
        variables: {
          journeyId,
          isLocked: checked,
        },
      });
      setIsLocked(checked);
      toast.success(checked ? "Journey locked" : "Journey unlocked");
    } catch (error) {
      toast.error("Failed to update lock setting");
      console.error(error);
    }
  };

  const handleToggleInputLock = async (checked: boolean) => {
    try {
      await toggleInputLock({
        variables: {
          journeyId,
          isInputLocked: checked,
        },
      });
      setIsInputLocked(checked);
      toast.success(checked ? "Inputs locked" : "Inputs unlocked");
    } catch (error) {
      toast.error("Failed to update input lock setting");
      console.error(error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-md shadow-xl relative animate-in fade-in zoom-in duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <h2 className="text-2xl font-bold mb-6 text-gray-900">
          Journey Settings
        </h2>

        <div className="space-y-6">
          {/* Lock Journey Invitation Toggle */}
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
                Lock Invitations
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Prevent new members from joining
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={isLocked}
                onChange={(e) => handleToggleLock(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
            </label>
          </div>

          {/* Lock Journey Input Toggle */}
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                Lock Inputs
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Prevent adding or editing expenses
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={isInputLocked}
                onChange={(e) => handleToggleInputLock(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
            </label>
          </div>

          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
            <h3 className="font-semibold mb-3 text-gray-900 flex items-center gap-2">
              <svg
                className="w-5 h-5 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              Password Protection
            </h3>
            <p className="text-sm text-gray-500 mb-3">
              {hasPassword
                ? "This journey is currently password protected."
                : "Set a password to restrict access."}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={
                  hasPassword ? "Change password" : "Enter new password"
                }
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-black/5 outline-none transition-all text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                onClick={handleSavePassword}
                className="bg-black text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
            <h3 className="font-semibold mb-3 text-gray-900 flex items-center gap-2">
              <svg
                className="w-5 h-5 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Host Approval
            </h3>
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex items-center mt-1">
                <input
                  type="checkbox"
                  checked={requireApproval}
                  onChange={(e) => handleToggleApproval(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
              </div>
              <div className="flex-1">
                <span className="block font-medium text-gray-900 text-sm">
                  Require approval for new guests
                </span>
                <span className="block text-xs text-gray-500 mt-1">
                  New guests will be placed in a waiting room until you approve
                  them.
                </span>
              </div>
            </label>
          </div>
        </div>

        <div className="flex justify-end mt-8">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-gray-600 hover:bg-gray-100 rounded-full font-medium transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import toast from "react-hot-toast";

const APPROVE_JOIN_REQUEST = gql`
  mutation ApproveJoinRequest($journeyId: ID!, $userId: ID!) {
    approveJoinRequest(journeyId: $journeyId, userId: $userId) {
      id
      members {
        id
        name
      }
      pendingMembers {
        id
        name
      }
    }
  }
`;

const REJECT_JOIN_REQUEST = gql`
  mutation RejectJoinRequest($journeyId: ID!, $userId: ID!) {
    rejectJoinRequest(journeyId: $journeyId, userId: $userId) {
      id
      pendingMembers {
        id
        name
      }
    }
  }
`;

const APPROVE_ALL_JOIN_REQUESTS = gql`
  mutation ApproveAllJoinRequests($journeyId: ID!) {
    approveAllJoinRequests(journeyId: $journeyId) {
      id
      members {
        id
        name
      }
      pendingMembers {
        id
        name
      }
    }
  }
`;

const REJECT_ALL_JOIN_REQUESTS = gql`
  mutation RejectAllJoinRequests($journeyId: ID!) {
    rejectAllJoinRequests(journeyId: $journeyId) {
      id
      pendingMembers {
        id
        name
      }
    }
  }
`;

interface User {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
}

interface PendingRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  journeyId: string;
  pendingMembers: User[];
}

export default function PendingRequestsModal({
  isOpen,
  onClose,
  journeyId,
  pendingMembers,
}: PendingRequestsModalProps) {
  const [approveRequest] = useMutation(APPROVE_JOIN_REQUEST);
  const [rejectRequest] = useMutation(REJECT_JOIN_REQUEST);

  const handleApprove = async (userId: string) => {
    try {
      await approveRequest({
        variables: { journeyId, userId },
      });
      toast.success("User approved");
    } catch (error) {
      toast.error("Failed to approve user");
      console.error(error);
    }
  };

  const handleReject = async (userId: string) => {
    try {
      await rejectRequest({
        variables: { journeyId, userId },
      });
      toast.success("User rejected");
    } catch (error) {
      toast.error("Failed to reject user");
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

        <h2 className="text-2xl font-bold mb-6 text-gray-900 flex items-center gap-2">
          Pending Requests
          <span className="bg-yellow-100 text-yellow-700 text-sm px-2.5 py-0.5 rounded-full font-medium">
            {pendingMembers.length}
          </span>
        </h2>

        {pendingMembers.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-100 border-dashed">
            <p className="text-gray-500">No pending requests.</p>
          </div>
        ) : (
          <ul className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {pendingMembers.map((user) => (
              <li
                key={user.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-700 font-bold shadow-sm">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{user.name}</p>
                    {user.email && (
                      <p className="text-xs text-gray-500">{user.email}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReject(user.id)}
                    className="text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprove(user.id)}
                    className="bg-black text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm cursor-pointer"
                  >
                    Approve
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end mt-8">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-gray-600 hover:bg-gray-100 rounded-full font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

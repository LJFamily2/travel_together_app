"use client";

import { useState } from "react";

interface Member {
  id: string;
  name: string;
  email?: string;
}

interface MembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  isLeader?: boolean;
  currentUserId?: string;
  onRemoveMember?: (memberId: string) => void;
}

export default function MembersModal({
  isOpen,
  onClose,
  members,
  isLeader,
  currentUserId,
  onRemoveMember,
}: MembersModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  if (!isOpen) return null;

  const filteredMembers = members.filter((member) =>
    member.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          Journey Members
          <span className="bg-blue-100 text-blue-700 text-sm px-2.5 py-0.5 rounded-full font-medium">
            {members.length}
          </span>
        </h2>

        <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-full border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
            />
            <svg
              className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>

        <ul className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
          {filteredMembers.length === 0 ? (
            <li className="text-center py-8 text-gray-500">No members found</li>
          ) : (
            filteredMembers.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-700 font-bold shadow-sm shrink-0">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      {member.name}
                      {member.id === currentUserId && " (You)"}
                    </p>
                    {member.email && (
                      <p className="text-xs text-gray-500 truncate">
                        {member.email}
                      </p>
                    )}
                  </div>
                </div>
                {isLeader && member.id !== currentUserId && onRemoveMember && (
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Are you sure you want to remove ${member.name} from the journey?`
                        )
                      ) {
                        onRemoveMember(member.id);
                      }
                    }}
                    className="text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors"
                    title="Remove member"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </li>
            ))
          )}
        </ul>

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

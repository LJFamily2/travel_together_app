/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, Fragment } from "react";
import { useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { useApolloClient } from "@apollo/client/react";
import { addMemberToJourneyCache } from "../../lib/apolloCache";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";

const REGENERATE_GUEST_INVITE = gql`
  mutation RegenerateGuestInvite($journeyId: ID!, $userId: ID!) {
    regenerateGuestInvite(journeyId: $journeyId, userId: $userId) {
      user {
        id
        name
      }
      inviteLink
    }
  }
`;

const CREATE_GUEST_USER = gql`
  mutation CreateGuestUser($journeyId: ID!, $name: String!) {
    createGuestUser(journeyId: $journeyId, name: $name) {
      user {
        id
        name
      }
      inviteLink
      token
    }
  }
`;

interface Member {
  id: string;
  name: string;
  email?: string;
  isGuest?: boolean;
}

interface MembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  isLeader?: boolean;
  currentUserId?: string;
  onRemoveMember?: (memberId: string) => void;
  journeyId?: string;
  onRefresh?: () => void;
}

export default function MembersModal({
  isOpen,
  onClose,
  members,
  isLeader,
  currentUserId,
  onRemoveMember,
  journeyId,
  onRefresh,
}: MembersModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [isAddingGuest, setIsAddingGuest] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [createdGuestLink, setCreatedGuestLink] = useState<string | null>(null);
  // Per-guest regenerate QR state: memberId -> link
  const [guestQrMemberId, setGuestQrMemberId] = useState<string | null>(null);
  const [guestQrLink, setGuestQrLink] = useState<string | null>(null);

  const [regenerateGuestInvite, { loading: regenerating }] = useMutation(
    REGENERATE_GUEST_INVITE,
    {
      onError: (error) => {
        toast.error(error.message);
      },
    },
  );

  const handleRegenerateGuestQr = async (member: Member) => {
    if (!journeyId) return;
    try {
      const result = await regenerateGuestInvite({
        variables: { journeyId, userId: member.id },
      });
      const data = result.data as any;
      if (data && data.regenerateGuestInvite) {
        const link = `${window.location.origin}${data.regenerateGuestInvite.inviteLink}`;
        setGuestQrMemberId(member.id);
        setGuestQrLink(link);
      }
    } catch {
      // error handled by onError
    }
  };

  const client = useApolloClient();
  const [createGuestUser, { loading: creatingGuest }] = useMutation(
    CREATE_GUEST_USER,
    {
      onCompleted: (data: any) => {
        toast.success("Guest created successfully!");
        const newUser = data.createGuestUser.user;
        const link = `${window.location.origin}${data.createGuestUser.inviteLink}`;
        setCreatedGuestLink(link);
        // Update Journey.members in cache so UI updates immediately
        try {
          if (journeyId && newUser) {
            const journeyCacheId = client.cache.identify({
              __typename: "Journey",
              id: journeyId,
            });
            if (journeyCacheId) {
              const fragment = gql`
                fragment NewUser on User {
                  id
                  name
                }
              `;
              const newRef = client.cache.writeFragment({
                fragment,
                data: newUser,
              });
              client.cache.modify({
                id: journeyCacheId,
                fields: {
                  members(existing = []) {
                    return [...existing, newRef];
                  },
                },
              });
            }
          }
        } catch {
          if (onRefresh) onRefresh();
        }
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }
  );

  if (!isOpen) return null;

  const handleCreateGuest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim() || !journeyId) return;
    createGuestUser({ variables: { journeyId, name: guestName } });
  };

  const resetGuestFlow = () => {
    setIsAddingGuest(false);
    setCreatedGuestLink(null);
    setGuestName("");
  };

  const filteredMembers = members.filter((member) =>
    member.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-xl relative animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        {guestQrMemberId && guestQrLink ? (
          <div className="p-6 md:p-8 flex flex-col items-center justify-center animate-in slide-in-from-right-8 fade-in duration-300 h-full min-h-[400px]">
            <div className="w-full flex justify-between items-center mb-8">
              <button
                onClick={() => {
                  setGuestQrMemberId(null);
                  setGuestQrLink(null);
                }}
                className="flex items-center gap-2 text-gray-500 hover:text-black transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <h3 className="font-bold text-gray-900">Guest Rejoin QR</h3>
              <div className="w-16"></div> {/* Spacer to center title */}
            </div>
            
            <div className="text-center space-y-4 w-full">
              <p className="text-sm font-semibold text-gray-800">
                {members.find((m) => m.id === guestQrMemberId)?.name}
              </p>
              <div className="mx-auto w-fit bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <QRCodeSVG value={guestQrLink} size={200} />
              </div>
              <div className="flex justify-center mt-6">
                <button
                  onClick={() =>
                    navigator.clipboard
                      .writeText(guestQrLink)
                      .then(() => toast.success("Link copied"))
                      .catch(() => toast.error("Failed to copy link"))
                  }
                  className="px-6 py-2 bg-black text-white rounded-full shadow-sm text-sm font-medium hover:bg-gray-800 transition-colors cursor-pointer"
                >
                  Copy link
                </button>
              </div>
              <p className="text-xs text-gray-500">Scan to log in as this guest</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full animate-in slide-in-from-left-8 fade-in duration-300 overflow-hidden">
            <button
              onClick={() => {
                resetGuestFlow();
                onClose();
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer z-10"
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

            <div className="p-6 md:p-8 pb-0 shrink-0">
              <h2 className="text-2xl font-bold mb-6 text-gray-900 flex items-center gap-2">
                Journey Members
                <span className="bg-blue-100 text-blue-700 text-sm px-2.5 py-0.5 rounded-full font-medium">
                  {members.length}
                </span>
              </h2>
            </div>

            <div className="px-6 md:px-8 overflow-y-auto custom-scrollbar flex-1 min-h-0">
              {/* Add Guest Flow */}
              {isLeader && journeyId && (
                <div className="mb-6 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  {!isAddingGuest ? (
                    <button
                      onClick={() => setIsAddingGuest(true)}
                      className="w-full py-2 flex items-center justify-center gap-2 text-blue-600 font-semibold hover:bg-blue-100 rounded-xl transition-colors cursor-pointer"
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
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      Add Guest User
                    </button>
                  ) : createdGuestLink ? (
                    <div className="text-center space-y-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Guest QR Code
                      </h3>
                      {guestName && (
                        <p className="text-sm text-blue-600">{guestName}</p>
                      )}

                      <div className="mx-auto w-fit bg-white p-4 rounded-xl shadow-sm">
                        <QRCodeSVG value={createdGuestLink} size={200} />
                      </div>

                      <div className="flex justify-center mt-2">
                        <button
                          onClick={() => {
                            if (!createdGuestLink) return;
                            navigator.clipboard
                              .writeText(createdGuestLink)
                              .then(() => toast.success("Link copied"))
                              .catch(() => toast.error("Failed to copy link"));
                          }}
                          className="px-6 py-2 bg-white border border-gray-200 rounded-full shadow-sm text-sm font-medium hover:bg-gray-50 cursor-pointer"
                        >
                          Copy link
                        </button>
                      </div>

                      <p className="text-xs text-gray-500">
                        Scan to log in as guest
                      </p>
                      <button
                        onClick={resetGuestFlow}
                        className="text-sm text-blue-600 hover:underline cursor-pointer"
                      >
                        Done / Add Another
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleCreateGuest} className="space-y-3">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-bold text-gray-900">Create Guest</h3>
                        <button
                          type="button"
                          onClick={() => setIsAddingGuest(false)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="Guest Name"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={creatingGuest || !guestName.trim()}
                        className="w-full py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {creatingGuest ? "Creating..." : "Generate QR Code"}
                      </button>
                    </form>
                  )}
                </div>
              )}

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

              <ul className="space-y-3 pr-2">
                {filteredMembers.length === 0 ? (
                  <li className="text-center py-8 text-gray-500">
                    No members found
                  </li>
                ) : (
                  filteredMembers.map((member) => (
                    <Fragment key={member.id}>
                      <li className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
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
                        <div className="flex items-center gap-1">
                          {/* Per-guest QR regenerate button — leaders or the guest themselves */}
                          {(isLeader || currentUserId === member.id) && member.isGuest && (
                            <button
                              onClick={() => handleRegenerateGuestQr(member)}
                              disabled={regenerating}
                              className="text-blue-500 hover:bg-blue-50 p-2 rounded-full transition-colors cursor-pointer disabled:opacity-50"
                              title="Get guest rejoin QR"
                              aria-label={`Regenerate QR for ${member.name}`}
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
                                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                                />
                              </svg>
                            </button>
                          )}
                          {/* Remove controls only for leaders, and not for themselves */}
                          {isLeader &&
                            onRemoveMember &&
                            member.id !== currentUserId &&
                            (confirmRemoveId === member.id ? (
                              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-200">
                                <button
                                  onClick={() => {
                                    onRemoveMember(member.id);
                                    setConfirmRemoveId(null);
                                  }}
                                  className="bg-red-500 text-white px-3 py-1.5 rounded-full text-xs font-bold hover:bg-red-600 transition-colors cursor-pointer"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setConfirmRemoveId(null)}
                                  className="bg-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-xs font-bold hover:bg-gray-300 transition-colors cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmRemoveId(member.id)}
                                className="text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors cursor-pointer"
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
                            ))}
                        </div>
                      </li>
                    </Fragment>
                  ))
                )}
              </ul>
            </div>

            <div className="p-6 md:p-8 pt-4 shrink-0 flex justify-end">
              <button
                onClick={() => {
                  resetGuestFlow();
                  onClose();
                }}
                className="px-6 py-2.5 text-gray-600 hover:bg-gray-100 rounded-full font-medium transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

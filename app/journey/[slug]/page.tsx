"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useApolloClient } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import Image from "next/image";
import StyledQRCode from "../../components/StyledQRCode";
import AddExpenseForm from "../../components/AddExpenseForm";
import ActivityFeed from "../../components/ActivityFeed";
import MyTotalSpend from "../../components/MyTotalSpend";
import SettleUpModal from "../../components/SettleUpModal";
import JourneySettingsModal from "../../components/JourneySettingsModal";
import PendingRequestsModal from "../../components/PendingRequestsModal";
import MembersModal from "../../components/MembersModal";
import UserSettingsModal from "../../components/UserSettingsModal";
import { CurrencyProvider } from "../../context/CurrencyContext";
import { useSocket } from "../../../lib/hooks/useSocket";
import Cookies from "js-cookie";

const GENERATE_JOIN_TOKEN = gql`
  mutation GenerateJoinToken($journeyId: ID!) {
    generateJoinToken(journeyId: $journeyId)
  }
`;

const GET_DASHBOARD_DATA = gql`
  query GetDashboardData($slug: String!) {
    getJourneyDetails(slug: $slug) {
      id
      slug
      name
      expireAt
      leader {
        id
        name
      }
      hasPassword
      requireApproval
      isLocked
      pendingMembers {
        id
        name
        email
      }
      members {
        id
        name
        isGuest
        bankInfo {
          bankInformation {
            name
            number
          }
        }
      }
      expenses {
        id
        description
        totalAmount
        payer {
          id
          name
        }
        splits {
          user {
            id
            name
          }
          baseAmount
          deduction
          reason
        }
        hasImage
        createdAt
      }
    }
    me {
      id
      name
      bankInfo {
        bankInformation {
          name
          number
        }
      }
    }
  }
`;

interface Expense {
  id: string;
  description: string;
  totalAmount: number;
  payer: {
    id: string;
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

interface DashboardData {
  getJourneyDetails: {
    id: string;
    slug: string;
    name: string;
    expireAt: string | null;
    leader: {
      id: string;
      name: string;
    };
    hasPassword: boolean;
    requireApproval: boolean;
    isLocked: boolean;
    pendingMembers: {
      id: string;
      name: string;
      email?: string;
    }[];
    members: {
      id: string;
      name: string;
      bankInfo?: {
        bankInformation?: {
          name: string;
          number: string;
        };
      };
    }[];
    expenses: Expense[];
  };
  me: {
    id: string;
    name: string;
    bankInfo?: {
      bankInformation?: {
        name: string;
        number: string;
      };
    };
  };
}

interface LeaveJourneyResponse {
  leaveJourney: {
    id: string;
    name: string;
    expireAt?: string | null;
    leader: { id: string; name: string };
    members: {
      id: string;
      name: string;
      bankInfo?: {
        bankInformation?: {
          name: string;
          number: string;
        };
      };
    }[];
  };
}

const LEAVE_JOURNEY = gql`
  mutation LeaveJourney($journeyId: ID!, $leaderTimezoneOffsetMinutes: Int) {
    leaveJourney(
      journeyId: $journeyId
      leaderTimezoneOffsetMinutes: $leaderTimezoneOffsetMinutes
    ) {
      id
      name
      expireAt
      leader {
        id
        name
      }
      members {
        id
        name
        bankInfo {
          bankInformation {
            name
            number
          }
        }
      }
    }
  }
`;

const REMOVE_MEMBER = gql`
  mutation RemoveMember($journeyId: ID!, $memberId: ID!) {
    removeMember(journeyId: $journeyId, memberId: $memberId) {
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

export default function JourneyDashboard() {
  const client = useApolloClient();
  const params = useParams();
  const router = useRouter();
  const { status } = useSession();
  const slug = params.slug as string;

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPendingRequestsOpen, setIsPendingRequestsOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [isEndingSoon, setIsEndingSoon] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [joinToken, setJoinToken] = useState("");

  const { data, loading, error, refetch } = useQuery<DashboardData>(
    GET_DASHBOARD_DATA,
    {
      variables: { slug },
      fetchPolicy: "network-only",
    }
  );

  const [generateToken] = useMutation<{ generateJoinToken: string }>(
    GENERATE_JOIN_TOKEN
  );

  const [leaveJourney] = useMutation<
    LeaveJourneyResponse,
    { journeyId: string; leaderTimezoneOffsetMinutes?: number }
  >(LEAVE_JOURNEY);

  const [removeMember] = useMutation(REMOVE_MEMBER);

  const journey = data?.getJourneyDetails;
  const journeyId = journey?.id;

  useSocket(journeyId, () => {
    refetch();
  });
  const currentUser = data?.me;
  const isLeader = journey?.leader?.id === currentUser?.id;

  useEffect(() => {
    if (journey?.expireAt) {
      // Use setTimeout to avoid synchronous state update warning
      const timer = setTimeout(() => {
        const timeLeft = new Date(journey.expireAt!).getTime() - Date.now();
        const isSoon = timeLeft < 24 * 60 * 60 * 1000;
        setIsEndingSoon(isSoon);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [journey?.expireAt]);

  useEffect(() => {
    // If no token and no active session, redirect to home
    if (typeof window !== "undefined") {
      const token = Cookies.get("guestToken");
      if (!token && status !== "authenticated" && status !== "loading") {
        router.push("/");
      }
    }
  }, [router, status]);

  useEffect(() => {
    // If data finished loading but no journey found, navigate to 404
    if (!loading && !error && data && !journey) {
      router.replace("/404");
    }
  }, [loading, error, data, journey, router]);

  useEffect(() => {
    // If the server returned a "Journey not found" error, go to 404
    if (error && (error as Error).message) {
      const msg = (error as Error).message;
      if (msg.includes("Journey not found") || msg.includes("Not Found")) {
        router.replace("/404");
      }
    }
  }, [error, router]);

  if (loading && !data) return <div className="p-8">Loading dashboard...</div>;

  if (error) {
    // If backend explicitly says journey not found, we'll redirect to the 404 page
    if (
      (error as Error).message &&
      (error as Error).message.includes("Journey not found")
    ) {
      return null;
    }
    return (
      <div className="p-8 text-red-500">Error: {(error as Error).message}</div>
    );
  }

  if (!journey) return null;
  if (!currentUser)
    return <div className="p-8">Please join the journey first.</div>;

  const isMember = journey.members.some((m) => m.id === currentUser.id);
  const isPending = journey.pendingMembers?.some(
    (m) => m.id === currentUser.id
  );

  if (isPending) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl text-center max-w-md w-full">
          <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Request Pending
          </h2>
          <p className="text-gray-500 mb-8">
            Your request to join this journey is awaiting approval from the
            leader.
          </p>
          <button
            onClick={() => router.push("/")}
            className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold hover:bg-gray-800 transition-colors cursor-pointer"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (!isMember) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl text-center max-w-md w-full">
          <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Access Denied
          </h2>
          <p className="text-gray-500 mb-8">
            You are not a member of this journey.
          </p>
          <button
            onClick={() => router.push("/")}
            className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold hover:bg-gray-800 transition-colors cursor-pointer"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const handleShowQr = async () => {
    if (!journeyId) return;
    try {
      const { data } = await generateToken({ variables: { journeyId } });
      const jwtToken = data?.generateJoinToken || "";
      // try to extract jti from token (JWT) to keep QR small
      let jti = "";
      try {
        const payload = jwtToken.split(".")[1];
        if (payload) {
          const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
          const decoded = JSON.parse(atob(b64));
          jti = decoded?.jti || "";
        }
      } catch {
        // ignore decode errors and fallback to full token
      }
      setJoinToken(jti || jwtToken);
      setShowQr(true);
    } catch {
      toast.error("Failed to generate QR code");
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!journeyId) return;
    try {
      await removeMember({
        variables: { journeyId, memberId },
      });
      toast.success("Member removed successfully");
      refetch();
    } catch {
      toast.error("Failed to remove member");
    }
  };

  const handleLeave = async () => {
    if (isLeaving || !journeyId) return;
    setIsLeaving(true);
    try {
      const timezoneOffset = -new Date().getTimezoneOffset();
      const result = (await leaveJourney({
        variables: {
          journeyId,
          leaderTimezoneOffsetMinutes: timezoneOffset,
        },
      })) as {
        data?: LeaveJourneyResponse;
      };
      const updatedJourney = result?.data?.leaveJourney;
      if (updatedJourney) {
        try {
          const existing = client.readQuery<DashboardData>({
            query: GET_DASHBOARD_DATA,
            variables: { slug },
          });

          if (existing && existing.getJourneyDetails) {
            const merged = {
              ...existing,
              getJourneyDetails: {
                ...existing.getJourneyDetails,
                ...updatedJourney,
                expenses: existing.getJourneyDetails.expenses,
                members:
                  updatedJourney.members || existing.getJourneyDetails.members,
              },
            } as DashboardData;

            client.writeQuery({
              query: GET_DASHBOARD_DATA,
              variables: { slug },
              data: merged,
            });
          } else {
            try {
              await refetch();
            } catch (err) {
              console.warn("Could not refetch data after leaveJourney:", err);
            }
          }
        } catch (cacheError) {
          console.warn("Could not write updated journey to cache:", cacheError);
        }
      }
      Cookies.remove("guestToken");
      await client.clearStore();
      router.push("/");
    } catch (e) {
      toast.error("Failed to leave journey: " + (e as Error).message);
      setIsLeaving(false);
    }
  };

  return (
    <CurrencyProvider>
      <div className="min-h-screen bg-(--color-background) text-(--color-foreground) font-sans flex flex-col">
        <main className="grow w-full max-w-[1440px] mx-auto p-4 md:p-8">
          <div className="bg-white rounded-[34px] p-6 md:p-10 shadow-sm min-h-[80vh]">
            <header className="mb-8 flex justify-between items-center flex-wrap gap-4 border-b border-gray-100 pb-6">
              <div>
                <h1 className="text-4xl font-bold mb-2 text-gray-900">
                  {journey.name}
                </h1>
                <div className="flex items-center gap-2 text-gray-500">
                  <span className="bg-gray-100 px-3 py-1 rounded-full text-sm">
                    Leader: {journey.leader.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={
                        journey.isLocked
                          ? (e) => {
                              e.preventDefault();
                              toast.error(
                                "Journey is locked. Unlock to invite new members."
                              );
                            }
                          : handleShowQr
                      }
                      className={`${
                        journey.isLocked
                          ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                          : "bg-blue-100 text-blue-600 hover:bg-blue-200"
                      } px-3 py-1 rounded-full text-sm transition-colors flex items-center gap-1 cursor-pointer`}
                      title={
                        journey.isLocked
                          ? "Journey is locked. No new members can join."
                          : "Generate a single-use join token valid for 5 minutes"
                      }
                      aria-label={
                        journey.isLocked
                          ? "Journey is locked"
                          : "Generate a single-use join token"
                      }
                    >
                      Share QR
                      {journey.isLocked && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-4 h-4"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </button>
                    <span
                      className="text-gray-400"
                      title="Tokens are single-use; generating a new QR invalidates previous tokens. Token expires in 5 minutes."
                      aria-hidden
                    >
                      <svg
                        className="w-4 h-4"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </span>
                  </div>
                </div>

                {/* Member List */}
                <div
                  className="flex items-center mt-3 -space-x-2 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setIsMembersModalOpen(true)}
                  title="View all members"
                >
                  {journey.members.slice(0, 10).map((member) => (
                    <div
                      key={member.id}
                      className="h-8 w-8 rounded-full ring-2 ring-white bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600"
                      title={member.name}
                    >
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                  ))}
                  {journey.members.length > 10 && (
                    <div className="h-8 w-8 rounded-full ring-2 ring-white bg-gray-800 flex items-center justify-center text-xs font-medium text-white z-10">
                      10+
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                {isLeader && (
                  <>
                    <button
                      onClick={() => setIsSettingsOpen(true)}
                      className="bg-gray-100 text-gray-700 px-4 py-2.5 rounded-full font-medium hover:bg-gray-200 transition-colors shadow-sm cursor-pointer"
                    >
                      Settings
                    </button>
                    {journey.pendingMembers &&
                      journey.pendingMembers.length > 0 && (
                        <button
                          onClick={() => setIsPendingRequestsOpen(true)}
                          className="bg-yellow-100 text-yellow-700 px-4 py-2.5 rounded-full font-medium hover:bg-yellow-200 transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
                        >
                          Requests
                          <span className="bg-yellow-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                            {journey.pendingMembers.length}
                          </span>
                        </button>
                      )}
                  </>
                )}
                <button
                  onClick={() => setIsUserSettingsOpen(true)}
                  className="bg-gray-100 text-gray-700 px-3 py-2.5 rounded-full font-medium hover:bg-gray-200 transition-colors shadow-sm cursor-pointer"
                  title="Display Preferences"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-5 h-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => setIsSettleModalOpen(true)}
                  className="bg-green-600 text-white px-6 py-2.5 rounded-full font-medium hover:bg-green-700 transition-colors shadow-sm cursor-pointer"
                >
                  Settle Up
                </button>
                <button
                  disabled={isLeaving}
                  onClick={() => {
                    if (isLeaving) return;
                    toast((t) => (
                      <div className="flex flex-col gap-2">
                        <span className="font-medium text-sm">
                          Leave this journey?
                        </span>
                        <div className="flex gap-2">
                          <button
                            className="bg-red-500 text-white px-3 py-1 rounded-lg text-xs cursor-pointer"
                            onClick={() => {
                              toast.dismiss(t.id);
                              handleLeave();
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
                  }}
                  className="bg-red-50 text-red-600 px-6 py-2.5 rounded-full font-medium hover:bg-red-100 transition-colors border border-red-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isLeaving ? "Leaving..." : "Leave Journey"}
                </button>
              </div>
            </header>

            {journey.expireAt && isEndingSoon && (
              <div className="bg-red-50 border border-red-100 text-red-700 p-4 mb-8 rounded-2xl flex items-start gap-4">
                <div className="p-2 bg-red-100 rounded-full">
                  <svg
                    className="fill-current h-5 w-5 text-red-500"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                  >
                    <path d="M2.93 17.07A10 10 0 1 1 17.07 2.93 10 10 0 0 1 2.93 17.07zm12.73-1.41A8 8 0 1 0 4.34 4.34a8 8 0 0 0 11.32 11.32zM9 11V9h2v6H9v-4zm0-6h2v2H9V5z" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-lg">Journey Ending Soon</p>
                  <p className="text-sm opacity-90 mt-1">
                    The leader has left or the journey is expiring. This room
                    will be deleted on{" "}
                    {new Date(journey.expireAt).toLocaleString()} (your local
                    time).
                    <br />
                    Please save your data immediately.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Stats & Actions */}
              <div className="lg:col-span-1 space-y-6">
                <MyTotalSpend
                  expenses={journey.expenses}
                  currentUserId={currentUser.id}
                />

                <AddExpenseForm
                  journeyId={journey.id}
                  currentUser={currentUser}
                  members={journey.members}
                />
              </div>

              {/* Right Column: Feed */}
              <div className="lg:col-span-2">
                <ActivityFeed
                  expenses={journey.expenses}
                  currentUserId={currentUser.id}
                  members={journey.members}
                />
              </div>
            </div>
          </div>
        </main>

        <SettleUpModal
          journeyId={journey.id}
          currentUser={currentUser}
          members={journey.members}
          expenses={journey.expenses}
          isOpen={isSettleModalOpen}
          onClose={() => setIsSettleModalOpen(false)}
        />

        <JourneySettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          journeyId={journey.id}
          currentRequireApproval={journey.requireApproval}
          currentIsLocked={journey.isLocked}
          hasPassword={journey.hasPassword}
        />

        <PendingRequestsModal
          isOpen={isPendingRequestsOpen}
          onClose={() => setIsPendingRequestsOpen(false)}
          journeyId={journey.id}
          pendingMembers={journey.pendingMembers || []}
        />

        <MembersModal
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          members={journey.members}
          isLeader={isLeader}
          currentUserId={currentUser.id}
          onRemoveMember={handleRemoveMember}
          journeyId={journey.id}
          onRefresh={() => refetch()}
        />

        {showQr && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center relative">
              <button
                onClick={() => setShowQr(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 cursor-pointer"
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
              <Image
                src="/icons/plane.svg"
                alt=""
                aria-hidden
                className="absolute top-4 left-4 opacity-90 pointer-events-none"
                width={32}
                height={32}
              />
              <h3 className="text-xl font-bold mb-4">Join Journey</h3>
              <div className="flex justify-center mb-4 relative">
                <Image
                  src="/images/map-bg.svg"
                  alt=""
                  aria-hidden
                  className="absolute inset-0 object-cover opacity-10 pointer-events-none"
                  fill
                />
                <StyledQRCode
                  value={`${
                    typeof window !== "undefined" ? window.location.origin : ""
                  }/join?token=${joinToken}`}
                  size={220}
                  className="rounded-lg bg-white p-3 shadow-sm"
                />
              </div>
              <p className="text-sm text-gray-500 mb-4 inline-flex items-center gap-2">
                Scan this QR code to join. Valid for 5 minutes.
                <span
                  className="text-gray-400"
                  title="These tokens are single-use. Generating a new QR invalidates previous tokens."
                  aria-hidden
                >
                  <svg
                    className="w-4 h-4"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </span>
              </p>
            </div>
          </div>
        )}
        <UserSettingsModal
          isOpen={isUserSettingsOpen}
          onClose={() => setIsUserSettingsOpen(false)}
        />
      </div>
    </CurrencyProvider>
  );
}

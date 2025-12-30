"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import Cookies from "js-cookie";

const JOIN_JOURNEY_VIA_TOKEN = gql`
  mutation JoinJourneyViaToken(
    $token: String!
    $name: String
    $password: String
  ) {
    joinJourneyViaToken(token: $token, name: $name, password: $password) {
      token
      user {
        id
        name
      }
      journeySlug
      journeyId
      isPending
    }
  }
`;

function JoinPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { data: session } = useSession();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [pendingJourneyId, setPendingJourneyId] = useState<string | null>(null);

  type JoinJourneyResponse = {
    joinJourneyViaToken: {
      token?: string | null;
      user?: { id: string; name?: string | null } | null;
      journeySlug?: string | null;
      journeyId?: string | null;
      isPending?: boolean | null;
    };
  };

  const [joinJourney] = useMutation<JoinJourneyResponse>(
    JOIN_JOURNEY_VIA_TOKEN
  );

  useEffect(() => {
    if (!token) {
      toast.error("Invalid join link");
      router.push("/");
    }
  }, [token, router]);

  const handleJoin = useCallback(async () => {
    if (!token) return;
    if (!session && !name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (passwordRequired && !password) {
      toast.error("Please enter the password");
      return;
    }

    setIsJoining(true);
    try {
      const { data } = await joinJourney({
        variables: {
          token,
          name: session?.user?.name || name,
          password: password || null,
        },
      });

      const resp = data?.joinJourneyViaToken;
      if (!resp) {
        throw new Error("Invalid response from server");
      }
      const {
        token: authToken,
        journeySlug,
        journeyId,
        isPending: pendingStatus,
      } = resp;

      if (authToken) {
        Cookies.set("guestToken", authToken, { expires: 30 });
      }

      if (pendingStatus) {
        setIsPending(true);
        if (journeyId) setPendingJourneyId(journeyId);
        setIsJoining(false);
        return;
      }

      toast.success("Joined successfully!");
      router.push(`/journey/${journeySlug}`);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("PASSWORD_REQUIRED")) {
        setPasswordRequired(true);
        toast.error("This journey requires a password");
      } else if (msg.includes("INVALID_PASSWORD")) {
        toast.error("Invalid password");
      } else if (msg.includes("JOURNEY_LOCKED")) {
        toast.error("This journey is locked and not accepting new members.");
      } else if (msg.includes("NAME_TAKEN")) {
        toast.error(
          "This name is already taken in the journey. Please choose another."
        );
      } else if (msg.includes("REJECTED")) {
        toast.error("Your request to join has been rejected by the host.");
        setIsPending(false); // Stop showing pending screen
      } else {
        toast.error("Failed to join: " + msg);
      }
      setIsJoining(false);
    }
  }, [token, session, name, password, passwordRequired, joinJourney, router]);

  // (Sockets removed) Pending state remains; consider polling or manual retry

  // Auto-join if logged in (only if password not required)
  useEffect(() => {
    if (session && token && !isJoining && !passwordRequired && !isPending) {
      // Avoid calling setState synchronously within an effect which can cause cascading renders
      const id = setTimeout(() => {
        void handleJoin();
      }, 0);
      return () => clearTimeout(id);
    }
  }, [session, token, isJoining, handleJoin, passwordRequired, isPending]);

  if (!token) return null;

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-lg text-center">
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
          <h2 className="text-2xl font-bold mb-2">Waiting for Approval</h2>
          <p className="text-gray-600">
            Your request to join has been sent to the host. Please wait for them
            to approve you.
          </p>
        </div>
      </div>
    );
  }

  if (session && !passwordRequired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Joining Journey...</h2>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-lg">
        <h1 className="text-2xl font-bold mb-6 text-center">Join Journey</h1>
        <div className="space-y-4">
          {!session && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="Enter your name"
              />
            </div>
          )}

          {passwordRequired && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Journey Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="Enter password"
              />
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={isJoining}
            className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isJoining ? "Joining..." : "Join Journey"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <JoinPageContent />
    </Suspense>
  );
}

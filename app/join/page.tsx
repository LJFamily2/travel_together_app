"use client";

import { useState, useEffect, useCallback } from "react";
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";

const JOIN_JOURNEY_VIA_TOKEN = gql`
  mutation JoinJourneyViaToken($token: String!, $name: String) {
    joinJourneyViaToken(token: $token, name: $name) {
      token
      user {
        id
        name
      }
      journeySlug
    }
  }
`;

export default function JoinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { data: session } = useSession();
  const [name, setName] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  type JoinJourneyResponse = {
    joinJourneyViaToken: {
      token?: string | null;
      user?: { id: string; name?: string | null } | null;
      journeySlug?: string | null;
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

    setIsJoining(true);
    try {
      const { data } = await joinJourney({
        variables: {
          token,
          name: session?.user?.name || name,
        },
      });

      const resp = data?.joinJourneyViaToken;
      if (!resp) {
        throw new Error("Invalid response from server");
      }
      const { token: authToken, journeySlug } = resp;

      if (authToken) {
        localStorage.setItem("guestToken", authToken);
      }

      toast.success("Joined successfully!");
      router.push(`/journey/${journeySlug}`);
    } catch (e) {
      toast.error("Failed to join: " + (e as Error).message);
      setIsJoining(false);
    }
  }, [token, session, name, joinJourney, router]);

  // Auto-join if logged in
  useEffect(() => {
    if (session && token && !isJoining) {
      // Avoid calling setState synchronously within an effect which can cause cascading renders
      const id = setTimeout(() => {
        void handleJoin();
      }, 0);
      return () => clearTimeout(id);
    }
  }, [session, token, isJoining, handleJoin]);

  if (!token) return null;

  if (session) {
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
          <button
            onClick={handleJoin}
            disabled={isJoining}
            className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isJoining ? "Joining..." : "Join Journey"}
          </button>
        </div>
      </div>
    </div>
  );
}

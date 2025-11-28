"use client";

import React, { useState } from "react";
import { gql } from "@apollo/client";
import { useQuery, useMutation } from "@apollo/client/react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

const GET_USER_JOURNEYS = gql`
  query GetUserJourneys {
    getUserJourneys {
      id
      name
      leader {
        id
        name
      }
      members {
        id
        name
      }
    }
  }
`;

interface JourneyShort {
  id: string;
  name: string;
  leader: { id: string; name: string };
  members: { id: string; name: string }[];
}

interface JoinJourneyData {
  joinJourney: { id: string };
}

interface JoinJourneyVars {
  journeyId: string;
  userId: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [joinJourneyId, setJoinJourneyId] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const { data, loading, error } = useQuery<{
    getUserJourneys: JourneyShort[];
  }>(GET_USER_JOURNEYS, { skip: !hasToken });

  const JOIN_JOURNEY = gql`
    mutation JoinJourney($journeyId: ID!, $userId: ID!) {
      joinJourney(journeyId: $journeyId, userId: $userId) {
        id
      }
    }
  `;

  const [joinJourney, { loading: joining }] = useMutation<
    JoinJourneyData,
    JoinJourneyVars
  >(JOIN_JOURNEY);

  React.useEffect(() => {
    // Check both localStorage token and session returned appJwt
    try {
      const localToken = localStorage.getItem("guestToken");
      if (localToken) {
        setHasToken(true);
        return;
      }
    } catch {
      /* ignore */
    }
    if (
      session?.user &&
      (session.user as unknown as Record<string, string>).appJwt
    ) {
      try {
        localStorage.setItem(
          "guestToken",
          (session.user as unknown as Record<string, string>).appJwt
        );
      } catch {
        /* ignore */
      }
      setHasToken(true);
    }
  }, [session]);

  // Only show the loading state if the query is running;
  // if we haven't yet determined if token is present, show loading as well
  if (!hasToken) return <div className="p-8">Loading...</div>;
  if (loading) return <div className="p-8">Loading...</div>;
  if (error)
    return <div className="p-8 text-red-500">Error: {error.message}</div>;

  const journeys: JourneyShort[] = data?.getUserJourneys ?? [];
  return (
    <div className="p-8 min-h-screen bg-gray-50 dark:bg-black">
      <h1 className="text-2xl font-bold mb-4">Your Dashboard</h1>
      <div className="max-w-2xl bg-white dark:bg-gray-800 p-6 rounded shadow">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <input
              value={joinJourneyId}
              onChange={(e) => setJoinJourneyId(e.target.value)}
              placeholder="Journey ID"
              className="p-2 border rounded dark:bg-gray-700 mr-2"
            />
            <button
              onClick={async () => {
                try {
                  if (!joinJourneyId) return alert("Please enter a Journey ID");
                  const userId = (session?.user as unknown as { id?: string })?.id;
                  if (!userId) return alert("Please sign in first");
                  const res = await joinJourney({
                    variables: {
                      journeyId: joinJourneyId,
                      userId,
                    },
                  });
                  const jid = res?.data?.joinJourney?.id ?? joinJourneyId;
                  // Ensure we set the app token if available
                  if (
                    session?.user &&
                    (session.user as unknown as Record<string, string>).appJwt
                  ) {
                    localStorage.setItem(
                      "guestToken",
                      (session.user as unknown as Record<string, string>).appJwt
                    );
                  }
                  router.push(`/journey/${jid}`);
                } catch (e) {
                  alert("Failed to join journey: " + (e as Error).message);
                }
              }}
              className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700"
            >
              {joining ? "Joining..." : "Join room"}
            </button>
          </div>
          <div>
            <button
              onClick={() => {
                try {
                  localStorage.removeItem("guestToken");
                } catch {
                  /* ignore */
                }
                signOut({ callbackUrl: "/" });
              }}
              className="bg-red-500 text-white px-3 py-2 rounded hover:bg-red-600"
            >
              Logout
            </button>
          </div>
        </div>
        <h2 className="text-lg font-semibold mb-4">Your Journeys</h2>
        {journeys.length === 0 ? (
          <div>No journeys yet — create or join one!</div>
        ) : (
          <ul className="space-y-2">
            {journeys.map((j: JourneyShort) => (
              <li key={j.id}>
                <button
                  onClick={() => router.push(`/journey/${j.id}`)}
                  className="text-left text-blue-500 underline"
                >
                  {j.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

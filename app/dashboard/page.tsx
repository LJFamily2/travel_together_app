"use client";

import React, { useState } from "react";
import { gql } from "@apollo/client";
import { useQuery, useMutation } from "@apollo/client/react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import toast from "react-hot-toast";

const GET_USER_JOURNEYS = gql`
  query GetUserJourneys {
    getUserJourneys {
      id
      slug
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
  slug: string;
  name: string;
  leader: { id: string; name: string };
  members: { id: string; name: string }[];
}

interface JoinJourneyData {
  joinJourney: { id: string; slug: string };
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
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [navigatingJourneyId, setNavigatingJourneyId] = useState<string | null>(
    null
  );
  const { data, loading, error } = useQuery<{
    getUserJourneys: JourneyShort[];
  }>(GET_USER_JOURNEYS, { skip: !hasToken });

  const JOIN_JOURNEY = gql`
    mutation JoinJourney($journeyId: ID!, $userId: ID!) {
      joinJourney(journeyId: $journeyId, userId: $userId) {
        id
        slug
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
    <div className="min-h-screen bg-(--color-background) text-(--color-foreground) font-sans flex flex-col">

      <main className="grow w-full max-w-[1440px] mx-auto p-4 md:p-8 flex justify-center items-start mt-8">
        <div className="w-full max-w-3xl bg-white rounded-[34px] p-8 md:p-12 shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold">Your Dashboard</h1>
            <button
              disabled={isSigningOut}
              onClick={() => {
                if (isSigningOut) return;
                setIsSigningOut(true);
                try {
                  localStorage.removeItem("guestToken");
                } catch {
                  /* ignore */
                }
                signOut({ callbackUrl: "/" });
              }}
              className="text-red-500 hover:text-red-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSigningOut ? "Signing Out..." : "Sign Out"}
            </button>
          </div>

          <div className="mb-10">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">
              Join a Journey
            </h2>
            <div className="flex gap-3">
              <input
                value={joinJourneyId}
                onChange={(e) => setJoinJourneyId(e.target.value)}
                placeholder="Enter Journey ID"
                className="flex-1 p-3 border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              <button
                onClick={async () => {
                  try {
                    if (!joinJourneyId)
                      return toast.error("Please enter a Journey ID");
                    const userId = (session?.user as unknown as { id?: string })
                      ?.id;
                    if (!userId) return toast.error("Please sign in first");
                    const res = await joinJourney({
                      variables: {
                        journeyId: joinJourneyId,
                        userId,
                      },
                    });
                    const slug = res?.data?.joinJourney?.slug;
                    if (
                      session?.user &&
                      (session.user as unknown as Record<string, string>).appJwt
                    ) {
                      localStorage.setItem(
                        "guestToken",
                        (session.user as unknown as Record<string, string>)
                          .appJwt
                      );
                    }
                    if (slug) {
                      router.push(`/journey/${slug}`);
                    } else {
                      toast.error("Failed to join journey");
                    }
                  } catch (e) {
                    toast.error(
                      "Failed to join journey: " + (e as Error).message
                    );
                  }
                }}
                disabled={joining}
                className="bg-black text-white px-6 py-3 rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {joining ? "Joining..." : "Join"}
              </button>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-700">
              Your Journeys
            </h2>
            {journeys.length === 0 ? (
              <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-500">
                No journeys yet — create or join one!
              </div>
            ) : (
              <ul className="space-y-3">
                {journeys.map((j: JourneyShort) => (
                  <li key={j.id}>
                    <button
                      disabled={navigatingJourneyId === j.id}
                      onClick={() => {
                        setNavigatingJourneyId(j.id);
                        router.push(`/journey/${j.slug}`);
                      }}
                      className="w-full text-left p-4 rounded-2xl bg-gray-50 hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-lg group-hover:text-blue-700 transition-colors">
                          {j.name}{" "}
                          {navigatingJourneyId === j.id && "(Loading...)"}
                        </span>
                        <span className="text-gray-400 text-sm group-hover:text-blue-400">
                          View &rarr;
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        Leader: {j.leader.name} • {j.members.length} members
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>

    </div>
  );
}

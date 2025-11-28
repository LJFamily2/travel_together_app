"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery as useApolloQuery } from "@apollo/client/react";
import { useSession, signIn, signOut } from "next-auth/react";
import { gql } from "@apollo/client";
import { useRouter } from "next/navigation";

const CREATE_JOURNEY = gql`
  mutation CreateJourney(
    $leaderId: ID!
    $name: String!
    $startDate: String
    $endDate: String
  ) {
    createJourney(
      leaderId: $leaderId
      name: $name
      startDate: $startDate
      endDate: $endDate
    ) {
      id
    }
  }
`;

const JOIN_AS_GUEST = gql`
  mutation JoinAsGuest($name: String!, $journeyId: ID!) {
    joinAsGuest(name: $name, journeyId: $journeyId) {
      token
      user {
        id
      }
    }
  }
`;

const CREATE_USER = gql`
  mutation CreateUser($name: String!, $email: String) {
    createUser(name: $name, email: $email) {
      id
    }
  }
`;

const LOGIN = gql`
  mutation Login($userId: ID!, $journeyId: ID!) {
    login(userId: $userId, journeyId: $journeyId) {
      token
    }
  }
`;

interface JoinAsGuestData {
  joinAsGuest: {
    token: string;
    user: {
      id: string;
    };
  };
}

interface CreateUserData {
  createUser: {
    id: string;
  };
}

interface CreateJourneyData {
  createJourney: {
    id: string;
  };
}

interface LoginData {
  login: {
    token: string;
  };
}

interface JourneyShort {
  id: string;
  name: string;
  leader: { id: string; name: string };
  members: { id: string; name: string }[];
}

interface GetUserJourneysData {
  getUserJourneys: JourneyShort[];
}

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"join" | "create">("join");
  const [name, setName] = useState("");
  const [journeyId, setJourneyId] = useState("");
  const [journeyName, setJourneyName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [joinAsGuest] = useMutation<JoinAsGuestData>(JOIN_AS_GUEST);
  const [createUser] = useMutation<CreateUserData>(CREATE_USER);
  const [createJourney] = useMutation<CreateJourneyData>(CREATE_JOURNEY);
  const [login] = useMutation<LoginData>(LOGIN);
  const { data: session, status } = useSession();

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

  const { data: userJourneysData, loading: loadingUserJourneys } =
    useApolloQuery<GetUserJourneysData>(GET_USER_JOURNEYS, {
      skip: status !== "authenticated",
    });

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await joinAsGuest({ variables: { name, journeyId } });
      if (data) {
        localStorage.setItem("guestToken", data.joinAsGuest.token);
        router.push(`/journey/${journeyId}`);
      }
    } catch (err) {
      alert("Error joining journey: " + (err as Error).message);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const userRes = await createUser({
        variables: { name, email: `${name}@example.com` },
      });
      const leaderId = userRes.data?.createUser.id;
      if (!leaderId) throw new Error("Failed to create user");

      const journeyRes = await createJourney({
        variables: { leaderId, name: journeyName, startDate, endDate },
      });
      const newJId = journeyRes.data?.createJourney.id;
      if (!newJId) throw new Error("Failed to create journey");

      // Auto-login the creator
      const loginRes = await login({
        variables: { userId: leaderId, journeyId: newJId },
      });

      if (loginRes.data) {
        localStorage.setItem("guestToken", loginRes.data.login.token);
        alert(`Journey Created! ID: ${newJId}. Redirecting...`);
        router.push(`/journey/${newJId}`);
      }
    } catch (err) {
      alert("Error creating journey: " + (err as Error).message);
    }
  };

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      const appJwt = (session.user as unknown as Record<string, string>).appJwt;
      if (appJwt) localStorage.setItem("guestToken", appJwt);
    }
  }, [status, session]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 p-8 rounded shadow-md w-96">
        <h1 className="text-2xl font-bold mb-6 text-center">Travel Together</h1>

        {/* OAuth Sign-in */}
        <div className="mb-4 flex justify-center">
          {status === "authenticated" ? (
            <div className="flex gap-2 items-center">
              <span className="text-sm text-gray-600">
                Signed in as {session?.user?.name}
              </span>
              <button
                onClick={() => {
                  // Clear app token and sign out, then redirect to home
                  try {
                    localStorage.removeItem("guestToken");
                  } catch {
                    /* ignore */
                  }
                  signOut({ callbackUrl: "/" });
                }}
                className="ml-2 bg-red-500 text-white px-3 py-1 rounded"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              className="w-full bg-slate-700 text-white py-2 rounded hover:bg-slate-800 mb-2"
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            >
              Sign in with Google
            </button>
          )}
        </div>

        {status === "authenticated" && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Your Journeys</h2>
            {loadingUserJourneys ? (
              <div>Loading...</div>
            ) : (
              <ul className="space-y-2">
                {userJourneysData?.getUserJourneys?.map((j: JourneyShort) => (
                  <li key={j.id}>
                    <button
                      onClick={() => router.push(`/journey/${j.id}`)}
                      className="text-left w-full underline text-blue-500"
                    >
                      {j.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex gap-4 mb-6 justify-center">
          <button
            className={`pb-2 ${
              mode === "join"
                ? "border-b-2 border-blue-500 font-bold"
                : "text-gray-500"
            }`}
            onClick={() => setMode("join")}
          >
            Join Journey
          </button>
          <button
            className={`pb-2 ${
              mode === "create"
                ? "border-b-2 border-blue-500 font-bold"
                : "text-gray-500"
            }`}
            onClick={() => setMode("create")}
          >
            Create Journey
          </button>
        </div>

        {mode === "join" ? (
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Your Name
              </label>
              <input
                className="w-full p-2 border rounded dark:bg-gray-700"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Journey ID
              </label>
              <input
                className="w-full p-2 border rounded dark:bg-gray-700"
                value={journeyId}
                onChange={(e) => setJourneyId(e.target.value)}
                required
              />
            </div>
            <button className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
              Join
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Your Name (Leader)
              </label>
              <input
                className="w-full p-2 border rounded dark:bg-gray-700"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Journey Name
              </label>
              <input
                className="w-full p-2 border rounded dark:bg-gray-700"
                value={journeyName}
                onChange={(e) => setJourneyName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Start Date
              </label>
              <input
                type="date"
                className="w-full p-2 border rounded dark:bg-gray-700"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date</label>
              <input
                type="date"
                className="w-full p-2 border rounded dark:bg-gray-700"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <button className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">
              Create & Get ID
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

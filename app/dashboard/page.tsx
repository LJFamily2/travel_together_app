"use client";

import React, { useState, useRef } from "react";
import { gql } from "@apollo/client";
import { useQuery, useMutation } from "@apollo/client/react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import toast from "react-hot-toast";
import Cookies from "js-cookie";

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

interface CreateUserData {
  createUser: {
    id: string;
  };
}

interface CreateJourneyData {
  createJourney: {
    id: string;
    slug: string;
  };
}

interface LoginData {
  login: {
    token: string;
  };
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newJourneyName, setNewJourneyName] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");

  // QR Scanning state
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanAnimationRef = useRef<number | null>(null);
  const { data, loading, error } = useQuery<{
    getUserJourneys: JourneyShort[];
  }>(GET_USER_JOURNEYS, { skip: !hasToken });

  // join logic centralized
  const handleJoin = async (id?: string) => {
    try {
      const journeyToJoin = id ?? joinJourneyId ?? "";
      if (!journeyToJoin)
        return toast.error("Please enter or scan a Journey ID");

      let userId = (session?.user as unknown as { id?: string })?.id;
      // If not signed in, create a guest user and then join
      if (!userId) {
        const userRes = await createUser({
          variables: {
            name: `Guest ${Math.floor(Math.random() * 10000)}`,
            email: undefined,
          },
        });
        userId = userRes?.data?.createUser?.id;
      }
      if (!userId) return toast.error("Please sign in first");

      const res = await joinJourney({
        variables: {
          journeyId: journeyToJoin,
          userId,
        },
      });
      const slug = res?.data?.joinJourney?.slug;

      // Ensure guest token present if needed by logging in
      if (!session?.user && userId) {
        try {
          const loginRes = await login({
            variables: { userId, journeyId: journeyToJoin },
          });
          const token = loginRes?.data?.login?.token;
          if (token) Cookies.set("guestToken", token, { expires: 30 });
        } catch {
          // ignore
        }
      }

      if (slug) {
        router.push(`/journey/${slug}`);
      } else {
        toast.error("Failed to join journey");
      }
    } catch (e) {
      toast.error("Failed to join journey: " + (e as Error).message);
    }
  };

  const stopScan = async () => {
    setIsScanning(false);
    if (scanAnimationRef.current) {
      cancelAnimationFrame(scanAnimationRef.current);
      scanAnimationRef.current = null;
    }
    if (videoRef.current) {
      const stream = videoRef.current.srcObject as MediaStream | null;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      videoRef.current.srcObject = null;
    }
  };

  const startScan = async () => {
    setIsScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      type BarcodeDetectorConstructor = new (options?: {
        formats?: string[];
      }) => {
        detect(
          source:
            | HTMLVideoElement
            | HTMLImageElement
            | ImageBitmap
            | ImageBitmapSource
        ): Promise<Array<{ rawValue: string }>>;
      };
      const BarcodeCtor = (
        window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
      ).BarcodeDetector;
      const barcodeDetector = BarcodeCtor
        ? new BarcodeCtor({ formats: ["qr_code"] })
        : null;

      const scanLoop = async () => {
        try {
          if (!videoRef.current) return;
          if (barcodeDetector) {
            const results = await barcodeDetector.detect(videoRef.current);
            if (results.length) {
              const qrText = results[0].rawValue;
              if (qrText) {
                setJoinJourneyId(qrText);
                await stopScan();
                await handleJoin(qrText);
                return;
              }
            }
          }
        } catch (e) {
          console.error("QR scan error:", e);
        } finally {
          scanAnimationRef.current = requestAnimationFrame(scanLoop);
        }
      };
      scanLoop();
    } catch (e) {
      console.error("Camera start failed", e);
      setIsScanning(false);
    }
  };

  const JOIN_JOURNEY = gql`
    mutation JoinJourney($journeyId: ID!, $userId: ID!) {
      joinJourney(journeyId: $journeyId, userId: $userId) {
        id
        slug
      }
    }
  `;

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
        slug
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

  const [joinJourney, { loading: joining }] = useMutation<
    JoinJourneyData,
    JoinJourneyVars
  >(JOIN_JOURNEY);

  const [createJourney] = useMutation<CreateJourneyData>(CREATE_JOURNEY);
  const [createUser] = useMutation<CreateUserData>(CREATE_USER);
  const [login] = useMutation<LoginData>(LOGIN);

  React.useEffect(() => {
    // Check both localStorage token and session returned appJwt
    try {
      const localToken = Cookies.get("guestToken");
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
        Cookies.set(
          "guestToken",
          (session.user as unknown as Record<string, string>).appJwt,
          { expires: 30 }
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
      <main className="grow w-full max-w-[1440px] mx-auto px-4 sm:px-6 md:px-8 mt-8 flex justify-center items-start">
        <div className="w-full max-w-3xl bg-white rounded-3xl sm:rounded-[34px] p-6 sm:p-8 md:p-12 shadow-sm">
          <div className="flex justify-between items-center mb-8 gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold">Your Dashboard</h1>
            <button
              disabled={isSigningOut}
              onClick={() => {
                if (isSigningOut) return;
                setIsSigningOut(true);
                try {
                  Cookies.remove("guestToken");
                } catch {
                  /* ignore */
                }
                signOut({ callbackUrl: "/" });
              }}
              aria-label="Sign out"
              className="cursor-pointer text-red-500 hover:text-red-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSigningOut ? "Signing Out..." : "Sign Out"}
            </button>
          </div>

          <div className="mb-10">
            <h2 className="text-lg sm:text-xl font-semibold mb-4 text-gray-700">
              Join a Journey
            </h2>
            <div className="flex flex-col sm:flex-row gap-3 items-stretch">
              <label htmlFor="joinJourneyIdInput" className="sr-only">
                Journey ID
              </label>
              <input
                value={joinJourneyId}
                onChange={(e) => setJoinJourneyId(e.target.value)}
                placeholder="Enter Journey ID"
                id="joinJourneyIdInput"
                inputMode="text"
                autoComplete="off"
                aria-label="Journey ID"
                className="w-full sm:flex-1 p-3 border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              <div className="flex gap-2 items-stretch">
                <button
                  onClick={() => startScan()}
                  type="button"
                  className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-3 rounded-xl shadow-sm cursor-pointer"
                >
                  Scan QR
                </button>
                <button
                  onClick={() => setShowCreateModal(true)}
                  type="button"
                  className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-3 rounded-xl shadow-sm cursor-pointer"
                >
                  Create
                </button>
              </div>
              <button
                onClick={() => handleJoin()}
                disabled={joining}
                type="button"
                className="cursor-pointer bg-black text-white px-6 py-3 rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
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
              <div className="text-center py-6 sm:py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-500">
                No journeys yet — create or join one!
              </div>
            ) : (
              <ul role="list" className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {journeys.map((j: JourneyShort) => (
                  <li key={j.id}>
                    <button
                      role="listitem"
                      disabled={navigatingJourneyId === j.id}
                      onClick={() => {
                        setNavigatingJourneyId(j.id);
                        router.push(`/journey/${j.slug}`);
                      }}
                      className="cursor-pointer w-full text-left p-4 rounded-2xl bg-gray-50 hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-base md:text-lg group-hover:text-blue-700 transition-colors truncate block">
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

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-md shadow-lg z-50">
            <h3 className="text-lg font-semibold mb-3">Create a Journey</h3>
            <div className="space-y-3">
              <input
                value={newJourneyName}
                onChange={(e) => setNewJourneyName(e.target.value)}
                placeholder="Maldives Trip"
                className="w-full p-3 border border-gray-200 rounded-lg"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  className="flex-1 p-3 border border-gray-200 rounded-lg"
                />
                <input
                  type="date"
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  className="flex-1 p-3 border border-gray-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      let leaderId = (
                        session?.user as unknown as {
                          id?: string;
                        }
                      )?.id;
                      if (!leaderId) {
                        const userRes = await createUser({
                          variables: {
                            name: `Guest ${Math.floor(Math.random() * 10000)}`,
                            email: undefined,
                          },
                        });
                        leaderId = userRes?.data?.createUser?.id;
                      }
                      const journeyRes = await createJourney({
                        variables: {
                          leaderId,
                          name: newJourneyName,
                          startDate: newStartDate || null,
                          endDate: newEndDate || null,
                        },
                      });
                      const slug = journeyRes?.data?.createJourney?.slug;
                      if (slug) {
                        setShowCreateModal(false);
                        router.push(`/journey/${slug}`);
                      }
                    } catch (e) {
                      toast.error(
                        "Failed to create journey: " + (e as Error).message
                      );
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-black text-white cursor-pointer"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR scanning modal */}
      {isScanning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => stopScan()}
          />
          <div className="relative bg-white rounded-2xl p-4 w-full max-w-xl shadow-lg z-60">
            <video ref={videoRef} className="w-full rounded-md" />
            <canvas ref={scanCanvasRef} className="hidden" />
            <div className="flex justify-between mt-3">
              <button
                className="px-4 py-2 border rounded-lg cursor-pointer"
                onClick={() => stopScan()}
              >
                Close
              </button>
              <span className="text-gray-500">Scanning for QR…</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

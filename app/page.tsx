"use client";

import { useState, useRef } from "react";
import { useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { signIn } from "next-auth/react";
import Cookies from "js-cookie";
// (Navbar/footer imports removed — not used on this page)

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

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [journeyName, setJourneyName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const endDateRef = useRef<HTMLInputElement>(null);

  const [createUser] = useMutation<CreateUserData>(CREATE_USER);
  const [createJourney] = useMutation<CreateJourneyData>(CREATE_JOURNEY);
  const [login] = useMutation<LoginData>(LOGIN);

  const today = new Date().toISOString().split("T")[0];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const userRes = await createUser({
        variables: { name },
      });
      const leaderId = userRes.data?.createUser.id;
      if (!leaderId) throw new Error("Failed to create user");

      const journeyRes = await createJourney({
        variables: { leaderId, name: journeyName, startDate, endDate },
      });
      const newJId = journeyRes.data?.createJourney.id;
      const newSlug = journeyRes.data?.createJourney.slug;
      if (!newJId) throw new Error("Failed to create journey");

      // Auto-login the creator
      const loginRes = await login({
        variables: { userId: leaderId, journeyId: newJId },
      });

      if (loginRes.data) {
        Cookies.set("guestToken", loginRes.data.login.token, { expires: 30 });
        toast.success(`Journey Created! Redirecting...`);
        router.push(`/journey/${newSlug}`);
      }
    } catch (e) {
      toast.error("Error creating journey: " + (e as Error).message);
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center font-sans">
      <section className="w-full max-w-4xl px-6 py-16">
        <div className="mx-auto bg-white/70 backdrop-blur-md rounded-3xl p-8 md:p-12 shadow-2xl border border-white/60">
          <div className="text-center mb-6">
            <h1 className="text-4xl md:text-5xl font-extrabold">
              Travel Together
            </h1>
            <p className="mt-3 text-gray-600 text-base md:text-lg max-w-2xl mx-auto">
              Plan your trips, split expenses, and enjoy the journey without the
              financial stress.
            </p>
          </div>

          <div className="mt-8 max-w-xl mx-auto">
            <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-lg">
              <h2 className="text-2xl font-bold mb-5">Create a New Journey</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Your Name (Leader)
                  </label>
                  <input
                    className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Journey Name
                  </label>
                  <input
                    className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5"
                    value={journeyName}
                    onChange={(e) => setJourneyName(e.target.value)}
                    required
                    placeholder="Summer Trip 2025"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5"
                      value={startDate}
                      min={today}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (e.target.value) {
                          if (
                            endDateRef.current &&
                            "showPicker" in endDateRef.current
                          ) {
                            try {
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              (endDateRef.current as any).showPicker();
                            } catch {
                              // ignore
                            }
                          }
                          endDateRef.current?.focus();
                        }
                      }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      End Date
                    </label>
                    <input
                      ref={endDateRef}
                      type="date"
                      className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5"
                      value={endDate}
                      min={startDate || today}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  disabled={isSubmitting}
                  className="w-full bg-black text-white py-3 rounded-full font-medium hover:opacity-90 transition-opacity mt-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSubmitting ? "Creating..." : "Create Journey"}
                </button>
              </form>
              <div className="mt-4">
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-gray-200" />
                  <div className="text-sm text-gray-400">or</div>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                <button
                  type="button"
                  onClick={() => signIn("google")}
                  className="w-full flex items-center justify-center gap-3 border border-gray-200 py-2 rounded-xl hover:shadow-sm transition-shadow cursor-pointer"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 48 48"
                    className="inline-block"
                  >
                    <path
                      fill="#fbc02d"
                      d="M43.6 20.5H42V20H24v8h11.3C34 32.6 29.7 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.2l5.7-5.7C33.6 4.9 29 3 24 3 12.9 3 4 11.9 4 23s8.9 20 20 20c10 0 18.3-7.3 19.6-17H43.6z"
                    />
                    <path
                      fill="#e53935"
                      d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.2l5.7-5.7C33.6 4.9 29 3 24 3 16.2 3 9.1 7.5 6.3 14.7z"
                    />
                    <path
                      fill="#4caf50"
                      d="M24 45c5.1 0 9.6-1.7 13.1-4.6l-6.1-5c-2 1.6-4.7 2.6-7 2.6-5.7 0-10-3.4-11.6-8.1l-6.7 5.2C9.7 40.6 16.2 45 24 45z"
                    />
                    <path
                      fill="#1976d2"
                      d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.1 5.9-5.7 7.8-1.3.9-2.8 1.6-4.3 2.1v6.9c2.8 0 5.5-.9 7.8-2.6C39.9 38.3 44 31.6 43.6 20.5z"
                    />
                  </svg>
                  <span className="text-sm">Sign in with Google</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

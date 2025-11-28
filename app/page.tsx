"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import FigmaNavbar from "./components/FigmaNavbar";
import FigmaFooter from "./components/FigmaFooter";

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

  const [createUser] = useMutation<CreateUserData>(CREATE_USER);
  const [createJourney] = useMutation<CreateJourneyData>(CREATE_JOURNEY);
  const [login] = useMutation<LoginData>(LOGIN);

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
        toast.success(`Journey Created! ID: ${newJId}. Redirecting...`);
        router.push(`/journey/${newJId}`);
      }
    } catch (err) {
      toast.error("Error creating journey: " + (err as Error).message);
    }
  };

  return (
    <main className="min-h-screen flex flex-col bg-(--color-background) text-(--color-foreground) font-sans">
      <FigmaNavbar />

      <div className="flex flex-col items-center w-full gap-8 pb-20">
        {/* Section 1: Hero / Form */}
        <section className="w-full max-w-[1440px] flex justify-center px-4 mt-8">
          <div className="w-full max-w-[1338px] bg-white rounded-[34px] p-10 shadow-sm flex flex-col md:flex-row gap-10 items-start">
            <div className="flex-1">
              <h1 className="text-5xl font-bold mb-6">Travel Together</h1>
              <p className="text-xl text-gray-600 mb-8">
                Plan your trips, split expenses, and enjoy the journey without
                the financial stress.
              </p>

              <div className="bg-gray-50 p-8 rounded-2xl border border-gray-100 max-w-md">
                <h2 className="text-2xl font-bold mb-6">
                  Create a New Journey
                </h2>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Your Name (Leader)
                    </label>
                    <input
                      className="w-full p-2 border rounded"
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
                      className="w-full p-2 border rounded"
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
                      className="w-full p-2 border rounded"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      className="w-full p-2 border rounded"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                  <button className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">
                    Create & Get ID
                  </button>
                </form>
              </div>
            </div>
            <div className="flex-1 h-[400px] bg-gray-100 rounded-2xl flex items-center justify-center">
              <span className="text-gray-400 font-medium">
                Illustration / Image
              </span>
            </div>
          </div>
        </section>
      </div>

      <FigmaFooter />
    </main>
  );
}

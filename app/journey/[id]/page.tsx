"use client";

import { useState, useEffect } from "react";
import { useQuery, useApolloClient } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { useParams, useRouter } from "next/navigation";
import AddExpenseForm from "../../components/AddExpenseForm";
import ActivityFeed from "../../components/ActivityFeed";
import MyTotalSpend from "../../components/MyTotalSpend";
import SettleUpModal from "../../components/SettleUpModal";

const GET_DASHBOARD_DATA = gql`
  query GetDashboardData($journeyId: ID!) {
    getJourneyDetails(journeyId: $journeyId) {
      id
      name
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
    name: string;
    leader: {
      id: string;
      name: string;
    };
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

export default function JourneyDashboard() {
  const client = useApolloClient();
  const params = useParams();
  const router = useRouter();
  const journeyId = params.id as string;
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);

  const { data, loading, error } = useQuery<DashboardData>(GET_DASHBOARD_DATA, {
    variables: { journeyId },
    pollInterval: 5000,
  });

  useEffect(() => {
    // If no token, redirect to home
    if (typeof window !== "undefined" && !localStorage.getItem("guestToken")) {
      router.push("/");
    }
  }, [router]);

  if (loading && !data) return <div className="p-8">Loading dashboard...</div>;
  if (error)
    return <div className="p-8 text-red-500">Error: {error.message}</div>;

  const journey = data?.getJourneyDetails;
  const currentUser = data?.me;

  if (!journey) return <div className="p-8">Journey not found</div>;
  if (!currentUser)
    return <div className="p-8">Please join the journey first.</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black p-4 md:p-8">
      <header className="mb-8 flex justify-center md:justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {journey.name}
          </h1>
          <p className="text-gray-500">Leader: {journey.leader.name}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsSettleModalOpen(true)}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Settle Up
          </button>
          <button
            onClick={async () => {
              localStorage.removeItem("guestToken");
              await client.clearStore();
              router.push("/");
            }}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Leave
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Stats & Actions */}
        <div className="lg:col-span-1 space-y-6">
          <MyTotalSpend journeyId={journeyId} currentUserId={currentUser.id} />

          <AddExpenseForm
            journeyId={journeyId}
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

      <SettleUpModal
        journeyId={journeyId}
        currentUser={currentUser}
        members={journey.members}
        expenses={journey.expenses}
        isOpen={isSettleModalOpen}
        onClose={() => setIsSettleModalOpen(false)}
      />
    </div>
  );
}

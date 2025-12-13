/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import toast from "react-hot-toast";

const CLAIM_GUEST_USER = gql`
  mutation ClaimGuestUser($token: String!) {
    claimGuestUser(token: $token) {
      token
      user {
        id
        name
      }
      journeySlug
      journeyId
    }
  }
`;

export default function GuestJoinPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"verifying" | "success" | "error">(
    "verifying"
  );

  const [claimGuestUser] = useMutation(CLAIM_GUEST_USER, {
    onCompleted: (data: any) => {
      const { token, journeySlug } = data.claimGuestUser;

      // Store the token
      localStorage.setItem("guestToken", token);

      // Force a reload of the Apollo client state or just redirect
      // Since we are setting localStorage, the ApolloWrapper should pick it up on next request
      // But we might need to ensure the auth header is set.

      toast.success("Welcome back!");
      setStatus("success");

      // Redirect to journey
      router.push(`/journey/${journeySlug}`);
    },
    onError: (error) => {
      console.error("Error claiming guest profile:", error);
      setStatus("error");
      toast.error(error.message || "Failed to verify guest link");
    },
  });

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("error");
      return;
    }

    // Attempt to claim
    claimGuestUser({ variables: { token } });
  }, [token, claimGuestUser]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center space-y-6">
        {status === "verifying" && (
          <>
            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
            <h1 className="text-2xl font-bold text-gray-900">Verifying...</h1>
            <p className="text-gray-500">Please wait while we log you in.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
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
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Success!</h1>
            <p className="text-gray-500">Redirecting you to the journey...</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Invalid Link</h1>
            <p className="text-gray-500">
              This link may be expired or invalid. Please ask the journey leader
              for a new QR code.
            </p>
            <button
              onClick={() => router.push("/")}
              className="px-6 py-2 bg-gray-900 text-white rounded-full font-medium hover:bg-gray-800 transition-colors"
            >
              Go Home
            </button>
          </>
        )}
      </div>
    </div>
  );
}

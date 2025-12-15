/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import toast from "react-hot-toast";
import Cookies from "js-cookie";

const CLAIM_GUEST_USER = gql`
  mutation ClaimGuestUser($token: String!, $password: String) {
    claimGuestUser(token: $token, password: $password) {
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

function GuestJoinContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<
    "verifying" | "success" | "error" | "password_required"
  >("verifying");
  const [password, setPassword] = useState("");

  const [claimGuestUser, { loading }] = useMutation(CLAIM_GUEST_USER, {
    onCompleted: (data: any) => {
      const { token, journeySlug } = data.claimGuestUser;

      // Store the token
      Cookies.set("guestToken", token, { expires: 30 });

      toast.success("Welcome back!");
      setStatus("success");

      // Redirect to journey
      router.push(`/journey/${journeySlug}`);
    },
    onError: (error) => {
      // Handle expected errors without logging to console.error
      if (error.message === "PASSWORD_REQUIRED") {
        setStatus("password_required");
        toast.error("This journey requires a password");
        return;
      }

      if (error.message === "INVALID_PASSWORD") {
        setStatus("password_required");
        toast.error("Incorrect password");
        return;
      }

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

    // Attempt to claim without password first
    claimGuestUser({ variables: { token } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // Only run on mount/token change

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    claimGuestUser({ variables: { token, password } });
  };

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

        {status === "password_required" && (
          <>
            <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto">
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
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              Password Required
            </h1>
            <p className="text-gray-500">
              Please enter the journey password to continue.
            </p>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Journey Password"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-2 bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? "Verifying..." : "Join Journey"}
              </button>
            </form>
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

export default function GuestJoinPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GuestJoinContent />
    </Suspense>
  );
}

"use client";

import { useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

export default function LoginBtn() {
  const { data: session } = useSession();
  const [isLoading, setIsLoading] = useState(false);

  if (session) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p>Signed in as {session.user?.email}</p>
        <button
          disabled={isLoading}
          onClick={() => {
            if (isLoading) return;
            setIsLoading(true);
            try {
              localStorage.removeItem("guestToken");
            } catch (e) {
              /* ignore */
            }
            signOut({ callbackUrl: "/" });
          }}
          className="rounded-full bg-red-500 px-4 py-2 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isLoading ? "Signing out..." : "Sign out"}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4">
      <p>Not signed in</p>
      <button
        disabled={isLoading}
        onClick={() => {
          if (isLoading) return;
          setIsLoading(true);
          signIn("google", { callbackUrl: "/dashboard" });
        }}
        className="rounded-full bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {isLoading ? "Signing in..." : "Sign in with Google"}
      </button>
    </div>
  );
}

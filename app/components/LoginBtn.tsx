"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export default function LoginBtn() {
  const { data: session } = useSession();

  if (session) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p>Signed in as {session.user?.email}</p>
        <button
          onClick={() => {
            try {
              localStorage.removeItem("guestToken");
            } catch (e) {
              /* ignore */
            }
            signOut({ callbackUrl: "/" });
          }}
          className="rounded-full bg-red-500 px-4 py-2 text-white hover:bg-red-600"
        >
          Sign out
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4">
      <p>Not signed in</p>
      <button
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        className="rounded-full bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
      >
        Sign in with Google
      </button>
    </div>
  );
}

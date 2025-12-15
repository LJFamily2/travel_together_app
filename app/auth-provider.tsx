"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";

function AuthListener({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      const appJwt = (session.user as unknown as Record<string, string>).appJwt;
      if (appJwt) Cookies.set("guestToken", appJwt, { expires: 30 });
      // If the user is on the home page after signing in, redirect to the dashboard
      try {
        if (typeof window !== "undefined" && window.location.pathname === "/") {
          router.push("/dashboard");
        }
      } catch (e) {
        // ignore — router may not be available in some render cycles
      }
    }
  }, [status, session]);

  return <>{children}</>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthListener>{children}</AuthListener>
    </SessionProvider>
  );
}

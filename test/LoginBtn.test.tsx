/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import LoginBtn from "../app/components/LoginBtn";
import { useSession, signIn, signOut } from "next-auth/react";
import "@testing-library/jest-dom";
import Cookies from "js-cookie";

// Mock next-auth/react
jest.mock("next-auth/react");
// Mock js-cookie
jest.mock("js-cookie", () => ({
  remove: jest.fn(),
}));

describe("LoginBtn Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders 'Sign in with Google' when not authenticated", () => {
    // Mock useSession to return null (not logged in)
    (useSession as jest.Mock).mockReturnValue({
      data: null,
      status: "unauthenticated",
    });

    render(<LoginBtn />);

    const signInButton = screen.getByText("Sign in with Google");
    expect(signInButton).toBeInTheDocument();
    expect(screen.getByText("Not signed in")).toBeInTheDocument();

    // Test click
    fireEvent.click(signInButton);
    expect(signIn).toHaveBeenCalledWith("google", {
      callbackUrl: "/dashboard",
    });
  });

  it("renders user email and 'Sign out' when authenticated", () => {
    // Mock useSession to return a user
    (useSession as jest.Mock).mockReturnValue({
      data: { user: { email: "test@example.com" } },
      status: "authenticated",
    });

    render(<LoginBtn />);

    const signOutButton = screen.getByText("Sign out");
    expect(signOutButton).toBeInTheDocument();
    expect(
      screen.getByText("Signed in as test@example.com")
    ).toBeInTheDocument();

    // Test click
    fireEvent.click(signOutButton);
    expect(Cookies.remove).toHaveBeenCalledWith("guestToken");
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });
});

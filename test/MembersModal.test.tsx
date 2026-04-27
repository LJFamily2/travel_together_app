/**
 * @jest-environment jsdom
 */
// MembersModal tests — Packet D: per-guest QR icon visibility and regenerate flow
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { gql } from "@apollo/client";

// ── Core mocks (hoisted before imports) ─────────────────────────────────────
jest.mock("react-hot-toast", () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

jest.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <img alt="qr" data-testid="qr-code" data-value={value} />
  ),
}));

jest.mock("../lib/apolloCache", () => ({
  addMemberToJourneyCache: jest.fn(),
}));

// Stub Apollo hooks so the component renders without a real ApolloClient.
// useMutation returns [execute, { loading: false }] by default.
// We track the most recently registered execute fn so tests can inspect calls.
const mockExecute = jest.fn();
const mockRegenerateExecute = jest.fn();

jest.mock("@apollo/client/react", () => {
  const React = require("react");

  // Track mutation calls in order so we can hand back different mocks per
  // call site (CREATE_GUEST_USER then REGENERATE_GUEST_INVITE in the component).
  let callCount = 0;
  return {
    useMutation: jest.fn(() => {
      callCount += 1;
      // 1st = REGENERATE_GUEST_INVITE, 2nd = CREATE_GUEST_USER (order in component)
      if (callCount === 1) {
        return [mockRegenerateExecute, { loading: false }];
      }
      return [jest.fn(), { loading: false }];
    }),
    useApolloClient: jest.fn(() => ({
      cache: {
        identify: jest.fn(),
        writeFragment: jest.fn(),
        modify: jest.fn(),
      },
    })),
  };
});

import MembersModal from "../app/components/MembersModal";

// Reset mock call count before each test so useMutation tracking is fresh
beforeEach(() => {
  jest.clearAllMocks();
  // Re-set the call counter inside the module mock
  const { useMutation } = require("@apollo/client/react");
  let callCount = 0;
  (useMutation as jest.Mock).mockImplementation(() => {
    callCount += 1;
    if (callCount === 1) {
      return [mockRegenerateExecute, { loading: false }];
    }
    return [jest.fn(), { loading: false }];
  });
});

// ── Fixtures ──────────────────────────────────────────────────────────────────
const guestMember = { id: "guest-1", name: "GuestUser", isGuest: true };
const regularMember = { id: "user-2", name: "RegularUser", isGuest: false };
const leaderMember = { id: "leader-1", name: "Leader", isGuest: false };

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  members: [leaderMember, guestMember, regularMember],
  isLeader: true,
  currentUserId: "leader-1",
  onRemoveMember: jest.fn(),
  journeyId: "journey-1",
  onRefresh: jest.fn(),
};

const renderModal = (props = {}) =>
  render(<MembersModal {...defaultProps} {...props} />);

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("MembersModal — QR button visibility (Packet B)", () => {
  it("shows QR button for guest members when user is leader", () => {
    renderModal();
    expect(
      screen.getByLabelText("Regenerate QR for GuestUser"),
    ).toBeInTheDocument();
  });

  it("does NOT show QR button for non-guest members", () => {
    renderModal();
    expect(
      screen.queryByLabelText("Regenerate QR for RegularUser"),
    ).not.toBeInTheDocument();
  });

  it("does NOT show QR button when current user is not leader", () => {
    renderModal({ isLeader: false });
    expect(
      screen.queryByLabelText("Regenerate QR for GuestUser"),
    ).not.toBeInTheDocument();
  });

  it("does NOT show QR button for the leader self-row", () => {
    renderModal();
    expect(
      screen.queryByLabelText("Regenerate QR for Leader"),
    ).not.toBeInTheDocument();
  });

  it("calls regenerateGuestInvite mutation and shows QR panel on success", async () => {
    // Mock the regenerate execute to resolve with a fake invite link
    mockRegenerateExecute.mockResolvedValueOnce({
      data: {
        regenerateGuestInvite: {
          user: { id: "guest-1", name: "GuestUser" },
          inviteLink: "/join/guest?token=newtoken",
        },
      },
    });

    renderModal();

    const qrBtn = screen.getByLabelText("Regenerate QR for GuestUser");
    fireEvent.click(qrBtn);

    await waitFor(() => {
      expect(mockRegenerateExecute).toHaveBeenCalledWith({
        variables: { journeyId: "journey-1", userId: "guest-1" },
      });
      expect(screen.getByText(/Rejoin QR/)).toBeInTheDocument();
      expect(screen.getByTestId("qr-code")).toBeInTheDocument();
    });
  });
});

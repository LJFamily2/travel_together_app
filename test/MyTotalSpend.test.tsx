/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import MyTotalSpend from "../app/components/MyTotalSpend";
import { CurrencyProvider } from "../app/context/CurrencyContext";
import "@testing-library/jest-dom";

describe("MyTotalSpend", () => {
  const currentUserId = "user-1";
  const otherUserId = "user-2";

  it("calculates net balance correctly for normal expenses", () => {
    const expenses = [
      {
        id: "exp-1",
        totalAmount: 100,
        payer: { id: currentUserId },
        splits: [
          { user: { id: currentUserId }, baseAmount: 50, deduction: 0 },
          { user: { id: otherUserId }, baseAmount: 50, deduction: 0 },
        ],
      },
    ];
    // I paid 100. My cost is 50. Net balance = 100 - 50 = +50.

    render(
      <CurrencyProvider>
        <MyTotalSpend expenses={expenses} currentUserId={currentUserId} />
      </CurrencyProvider>
    );

    expect(screen.getByText("+50")).toBeInTheDocument();
    expect(screen.getByText("You are owed this amount")).toBeInTheDocument();
  });

  it("calculates net balance correctly when I receive a deduction (settlement)", () => {
    // Scenario: I paid 100 initially (Net +50).
    // Then Other User pays me 10 via deduction.
    // Deduction expense: Payer = Me (record creator), Split = Other User (deduction 10).

    const expenses = [
      {
        id: "exp-1",
        totalAmount: 100,
        payer: { id: currentUserId },
        splits: [
          { user: { id: currentUserId }, baseAmount: 50, deduction: 0 },
          { user: { id: otherUserId }, baseAmount: 50, deduction: 0 },
        ],
      },
      {
        id: "exp-2",
        totalAmount: 10,
        payer: { id: currentUserId },
        splits: [{ user: { id: otherUserId }, baseAmount: 0, deduction: 10 }],
      },
    ];

    // Calculation:
    // Exp 1: Payer Me. myTotalPayments += 100. My Split: cost += 50.
    // Exp 2: Payer Me. isSettlement = true. myTotalPayments -= 10. My Split: none.

    // Total Payments: 100 - 10 = 90.
    // Total Cost: 50.
    // Net Balance: 90 - 50 = +40.

    render(
      <CurrencyProvider>
        <MyTotalSpend expenses={expenses} currentUserId={currentUserId} />
      </CurrencyProvider>
    );

    expect(screen.getByText("+40")).toBeInTheDocument();
  });

  it("calculates net balance correctly when I pay a deduction (settlement)", () => {
    // Scenario: Other User paid 100 initially (I owe 50).
    // Then I pay Other User 10 via deduction.
    // Deduction expense: Payer = Other User (record creator), Split = Me (deduction 10).

    const expenses = [
      {
        id: "exp-1",
        totalAmount: 100,
        payer: { id: otherUserId },
        splits: [
          { user: { id: otherUserId }, baseAmount: 50, deduction: 0 },
          { user: { id: currentUserId }, baseAmount: 50, deduction: 0 },
        ],
      },
      {
        id: "exp-2",
        totalAmount: 10,
        payer: { id: otherUserId },
        splits: [{ user: { id: currentUserId }, baseAmount: 0, deduction: 10 }],
      },
    ];

    // Calculation for Me:
    // Exp 1: Payer Other. myTotalPayments += 0. My Split: cost += 50.
    // Exp 2: Payer Other. isSettlement = true. myTotalPayments += 0. My Split: cost += 0 - 10 = -10.

    // Total Payments: 0.
    // Total Cost: 50 - 10 = 40.
    // Net Balance: 0 - 40 = -40.

    render(
      <CurrencyProvider>
        <MyTotalSpend expenses={expenses} currentUserId={currentUserId} />
      </CurrencyProvider>
    );

    expect(screen.getByText("-40")).toBeInTheDocument();
    expect(
      screen.getByText("You owe this amount to the group")
    ).toBeInTheDocument();
  });
});

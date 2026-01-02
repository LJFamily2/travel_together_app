"use client";

import { useCurrency } from "../context/CurrencyContext";

interface Split {
  user: {
    id: string;
  };
  baseAmount: number;
  deduction: number;
}

interface Expense {
  id: string;
  totalAmount: number;
  payer: {
    id: string;
  };
  splits: Split[];
}

interface MyTotalSpendProps {
  expenses: Expense[];
  currentUserId: string;
}

export default function MyTotalSpend({
  expenses,
  currentUserId,
}: MyTotalSpendProps) {
  const { formatCurrency } = useCurrency();
  let myTotalCost = 0;
  let myTotalPayments = 0;

  expenses.forEach((expense) => {
    const isSettlement = expense.splits.some(
      (s) => s.baseAmount === 0 && (s.deduction || 0) > 0
    );

    if (expense.payer.id === currentUserId) {
      if (isSettlement) {
        myTotalPayments -= expense.totalAmount;
      } else {
        myTotalPayments += expense.totalAmount;
      }
    }

    const mySplit = expense.splits.find((s) => s.user.id === currentUserId);
    if (mySplit) {
      myTotalCost += mySplit.baseAmount - (mySplit.deduction || 0);
    }
  });

  const netBalance = myTotalPayments - myTotalCost;

  return (
    <div className="p-6 border border-gray-100 rounded-[34px] shadow-sm bg-white mb-6">
      <h3 className="text-lg font-bold mb-4 text-gray-800">My Financials</h3>

      <div className="space-y-3">
        {/* Total Paid */}
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-2xl">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-600">
              Total Paid
            </span>
            <span className="text-xs text-gray-400">What you paid</span>
          </div>
          <span className="font-mono text-lg font-semibold text-gray-900">
            ${formatCurrency(myTotalPayments)}
          </span>
        </div>

        {/* Total Share */}
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-2xl">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-600">
              Total Share
            </span>
            <span className="text-xs text-gray-400">Your fair share</span>
          </div>
          <span className="font-mono text-lg font-semibold text-gray-900">
            ${formatCurrency(myTotalCost)}
          </span>
        </div>

        {/* Divider with calculation hint */}
        <div className="relative py-2">
          <div
            className="absolute inset-0 flex items-center"
            aria-hidden="true"
          >
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-2 text-xs text-gray-400">
              Net Balance = Paid - Share
            </span>
          </div>
        </div>

        {/* Net Balance */}
        <div
          className={`p-4 rounded-2xl border ${
            netBalance >= 0
              ? "bg-green-50 border-green-100"
              : "bg-red-50 border-red-100"
          }`}
        >
          <div className="flex justify-between items-center mb-1">
            <span
              className={`text-sm font-bold ${
                netBalance >= 0 ? "text-green-800" : "text-red-800"
              }`}
            >
              Net Balance
            </span>
            <span
              className={`font-mono text-2xl font-bold ${
                netBalance >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {netBalance >= 0 ? "+" : ""}
              {formatCurrency(netBalance)}
            </span>
          </div>
          <p
            className={`text-xs ${
              netBalance >= 0 ? "text-green-700" : "text-red-700"
            }`}
          >
            {netBalance >= 0
              ? "You are owed this amount"
              : "You owe this amount to the group"}
          </p>
        </div>
      </div>
    </div>
  );
}

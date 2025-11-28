"use client";

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
  let myTotalCost = 0;
  let myTotalPayments = 0;

  expenses.forEach((expense) => {
    if (expense.payer.id === currentUserId) {
      myTotalPayments += expense.totalAmount;
    }

    const mySplit = expense.splits.find((s) => s.user.id === currentUserId);
    if (mySplit) {
      myTotalCost += mySplit.baseAmount - (mySplit.deduction || 0);
    }
  });

  const netBalance = myTotalPayments - myTotalCost;

  return (
    <div className="p-6 border border-gray-100 rounded-[34px] shadow-sm bg-white mb-6">
      <h3 className="text-lg font-bold mb-4">My Financials</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-gray-50 rounded-2xl">
          <p className="text-sm text-gray-600">Total Share (Cost)</p>
          <p className="text-2xl font-bold mt-1">${myTotalCost.toFixed(2)}</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-2xl">
          <p className="text-sm text-gray-600">Net Balance</p>
          <p
            className={`text-2xl font-bold mt-1 ${
              netBalance >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {netBalance >= 0
              ? `+${netBalance.toFixed(2)}`
              : `${netBalance.toFixed(2)}`}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {netBalance >= 0 ? "You are owed" : "You owe"}
          </p>
        </div>
      </div>
    </div>
  );
}

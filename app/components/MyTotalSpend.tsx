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
      <h3 className="text-lg font-bold mb-4">My Financials</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 bg-gray-50 rounded-2xl">
          <p className="text-sm text-gray-600">Total Share (Cost)</p>
          <div className="mt-1">
            <div className="overflow-x-auto overflow-y-hidden">
              <span className="inline-block min-w-max font-mono text-2xl sm:text-3xl font-bold text-gray-900 text-right">
                ${myTotalCost.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
        <div className="p-4 bg-gray-50 rounded-2xl">
          <p className="text-sm text-gray-600">Net Balance</p>
          <div className="mt-1">
            <div className="overflow-x-auto overflow-y-hidden">
              <span
                className={`inline-block min-w-max font-mono text-2xl sm:text-3xl font-bold ${
                  netBalance >= 0 ? "text-green-600" : "text-red-600"
                } text-right`}
              >
                {netBalance >= 0
                  ? `+${netBalance.toFixed(2)}`
                  : `${netBalance.toFixed(2)}`}
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {netBalance >= 0 ? "You are owed" : "You owe"}
          </p>
        </div>
      </div>
    </div>
  );
}

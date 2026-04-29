/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Image from "next/image";
import { useState, useRef, ChangeEvent, useEffect } from "react";
import { useCurrency } from "../context/CurrencyContext";
import { gql } from "@apollo/client";
import { useApolloClient } from "@apollo/client/react";
import { removeExpenseFromJourneyCache } from "../../lib/apolloCache";
import { useMutation } from "@apollo/client/react";
import toast from "react-hot-toast";
import TailwindDatePicker from "./TailwindDatePicker";
import { motion } from "framer-motion";
import RollerUnstackReveal from "./RollerUnstackReveal";

interface Member {
  id: string;
  name: string;
}

export interface ActionLog {
  id: string;
  action: string;
  actorName?: string;
  details?: string;
  metadata?: string;
  createdAt: string;
}

interface Expense {
  id: string;
  description: string;
  totalAmount: number;
  payer: {
    id?: string;
    name: string;
  };
  splits: {
    user: {
      id: string;
      name: string;
    };
    baseAmount: number;
    deduction: number;
    reason?: string;
  }[];
  hasImage: boolean;
  createdAt: string;
}

interface ActivityFeedProps {
  expenses: Expense[];
  actionLogs?: ActionLog[];
  currentUserId: string;
  members: Member[];
  journeyId?: string;
  journeyName?: string;
  isLeader?: boolean;
  onRefetch?: () => void;
  onLoadMoreExpenses?: () => void;
  hasMoreExpenses?: boolean;
  loadingMoreExpenses?: boolean;
}

const UPDATE_EXPENSE = gql`
  mutation UpdateExpense(
    $expenseId: ID!
    $payerId: ID
    $totalAmount: Float
    $description: String
    $splits: [SplitInput]
    $imageBase64: String
  ) {
    updateExpense(
      expenseId: $expenseId
      payerId: $payerId
      totalAmount: $totalAmount
      description: $description
      splits: $splits
      imageBase64: $imageBase64
    ) {
      id
      totalAmount
      description
      id
      hasImage
      payer {
        id
        name
      }
      splits {
        baseAmount
        deduction
        reason
        user {
          id
          name
        }
      }
    }
  }
`;

const DELETE_EXPENSE = gql`
  mutation DeleteExpense($expenseId: ID!) {
    deleteExpense(expenseId: $expenseId)
  }
`;

/** Format a JS timestamp (ms as string or number) to a locale date key like "Mon, Apr 28 2026" */
function toDateKey(ts: string | number): string {
  const d = new Date(typeof ts === "string" ? parseInt(ts) : ts);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ActivityFeed({
  expenses,
  actionLogs = [],
  currentUserId,
  members,
  journeyId,
  journeyName,
  isLeader = false,
  onRefetch,
  onLoadMoreExpenses,
  hasMoreExpenses = false,
  loadingMoreExpenses = false,
}: ActivityFeedProps) {
  const { formatCurrency } = useCurrency();
  const client = useApolloClient();
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Edit Form State
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [payerId, setPayerId] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  // Image preview state for full-screen clickable preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Split logic state
  const [splitType, setSplitType] = useState<"equal" | "separate">("equal");
  const [individualAmounts, setIndividualAmounts] = useState<
    Record<string, string>
  >({});

  const [isAllSelected, setIsAllSelected] = useState(true);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  // Search for members inside edit UI
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  // Activity feed search (search by payer)
  const [activitySearch, setActivitySearch] = useState("");
  const [debouncedActivitySearch, setDebouncedActivitySearch] = useState("");
  const [payerFilter, setPayerFilter] = useState("");
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [filterSearchQuery, setFilterSearchQuery] = useState("");
  const [isEditPayerDropdownOpen, setIsEditPayerDropdownOpen] = useState(false);
  const [editPayerSearchQuery, setEditPayerSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const [viewMode, setViewMode] = useState<"expenses" | "actions">("expenses");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Normalize strings for search: remove diacritics, collapse whitespace, lower-case
  const normalizeString = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const [updateExpense, { loading: updating }] = useMutation(UPDATE_EXPENSE);
  const [deleteExpense, { loading: deleting }] = useMutation(DELETE_EXPENSE, {
    // Remove the expense reference from the Journey.expenses list on success
    update(cache, { data }: any, { variables }) {
      const deleted = data?.deleteExpense;
      if (!deleted) return;
      const expenseId = variables?.expenseId;
      if (!expenseId) return;
      try {
        // Identify the Journey and remove the expense ref from its expenses field
        const journeyCacheId = cache.identify({
          __typename: "Journey",
          id: journeyId,
        });
        // If journeyId was passed, update that Journey's expenses
        if (journeyCacheId) {
          cache.modify({
            id: journeyCacheId,
            fields: {
              expenses(existingRefs = [], { readField }) {
                return existingRefs.filter(
                  (ref: any) => readField("id", ref) !== expenseId,
                );
              },
            },
          });
        } else {
          // Fallback: evict the expense entity and run garbage collection
          const expId = cache.identify({
            __typename: "Expense",
            id: expenseId,
          });
          if (expId) cache.evict({ id: expId });
          cache.gc();
        }
      } catch (e) {
        try {
          client.refetchQueries({ include: "active" });
        } catch (_) {}
      }
    },
    optimisticResponse: { deleteExpense: true },
  });

  const filteredExpenses = expenses.filter((expense) => {
    const involvesUser =
      expense.splits.some((s) => s.user.id === currentUserId) ||
      (expense.payer.id && expense.payer.id === currentUserId);
    const isDeduction =
      expense.splits.some((s) => s.baseAmount === 0 && s.deduction > 0) ||
      expense.description.toLowerCase().startsWith("deduction") ||
      expense.description.toLowerCase().startsWith("settlement");

    return involvesUser && !isDeduction;
  });

  // Debounce activity search input
  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedActivitySearch(normalizeString(activitySearch || "")),
      300,
    );
    return () => clearTimeout(t);
  }, [activitySearch]);

  // Build unique payer list from filteredExpenses (only payers who paid for the current user)
  const uniquePayers = filteredExpenses
    .map((e) => e.payer)
    .filter(
      (p, idx, arr) =>
        arr.findIndex((x) => (x.id || x.name) === (p.id || p.name)) === idx,
    );

  // Apply description search and payer filter to the already filtered expenses
  const visibleExpenses = filteredExpenses.filter((expense) => {
    if (
      debouncedActivitySearch &&
      !normalizeString(expense.description || "").includes(
        debouncedActivitySearch,
      )
    )
      return false;
    if (payerFilter) {
      const matchesId = expense.payer.id && expense.payer.id === payerFilter;
      const matchesName = expense.payer.name === payerFilter;
      if (!matchesId && !matchesName) return false;
    }
    if (dateFilter) {
      const d = new Date(parseInt(expense.createdAt));
      const expDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (expDateStr !== dateFilter) return false;
    }
    return true;
  });

  const totalInvolvedAmount = filteredExpenses.reduce(
    (sum, expense) => sum + expense.totalAmount,
    0,
  );

  const exportToExcel = async () => {
    try {
      const XLSX = await import("xlsx");

      const wb = XLSX.utils.book_new();

      // All expenses sheet (no ID column). Include a UserAmount column for the exporting user.
      const allRows = expenses.map((exp) => {
        const involves =
          exp.splits.some((s) => s.user.id === currentUserId) ||
          (exp.payer.id && exp.payer.id === currentUserId);
        const mySplit = exp.splits.find((s) => s.user.id === currentUserId);
        const userAmount = mySplit
          ? +(mySplit.baseAmount - (mySplit.deduction || 0))
          : exp.payer.id === currentUserId
            ? 0
            : 0;

        return {
          Description: exp.description,
          Payer: exp.payer.name,
          Total: exp.totalAmount,
          CreatedAt: new Date(parseInt(exp.createdAt)).toLocaleString(),
          Splits: exp.splits
            .map(
              (s) =>
                `${s.user.name} (${(s.baseAmount - (s.deduction || 0)).toFixed(
                  2,
                )})`,
            )
            .join(", "),
          UserAmount: userAmount,
          // internal flag for styling
          _involves: involves,
        } as any;
      });

      // Totals
      const totalSum = allRows.reduce((sum, r) => sum + (r.Total || 0), 0);
      const userSum = allRows.reduce((sum, r) => sum + (r.UserAmount || 0), 0);

      const allRowsForSheet = allRows.map(
        ({ _involves, ...rest }: any) => rest,
      );
      allRowsForSheet.push({
        Description: "TOTAL",
        Payer: "",
        Total: totalSum,
        CreatedAt: "",
        Splits: "",
        UserAmount: userSum,
      });

      const wsAll = XLSX.utils.json_to_sheet(allRowsForSheet);

      // Highlight rows where the original _involves flag is true
      try {
        const range = XLSX.utils.decode_range(wsAll["!ref"] || "A1");
        for (let idx = 0; idx < allRows.length; idx++) {
          const involves = allRows[idx]._involves;
          const R = range.s.r + 1 + idx; // row index for that expense
          if (involves) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
              const addr = XLSX.utils.encode_cell({ r: R, c: C });
              wsAll[addr] = wsAll[addr] || { t: "s", v: "" };
              wsAll[addr].s = wsAll[addr].s || {};
              wsAll[addr].s.fill = {
                patternType: "solid",
                fgColor: { rgb: "FFF7C6" },
              };
            }
          }
        }
      } catch (e) {
        // non-fatal
      }

      XLSX.utils.book_append_sheet(wb, wsAll, "All Expenses");

      // Detail sheet: Others Owe You (list each split where you are the payer and others owe you)
      const othersOweYouRows: any[] = [];
      expenses.forEach((exp) => {
        if (exp.payer.id === currentUserId) {
          exp.splits.forEach((s) => {
            if (s.user.id !== currentUserId) {
              const amt = +(s.baseAmount - (s.deduction || 0));
              if (amt > 0) {
                othersOweYouRows.push({
                  Description: exp.description,
                  OwedBy: s.user.name,
                  OwedAmount: amt,
                  ExpenseTotal: exp.totalAmount,
                  CreatedAt: new Date(parseInt(exp.createdAt)).toLocaleString(),
                });
              }
            }
          });
        }
      });
      const totalOthersOweYou = othersOweYouRows.reduce(
        (s, r) => s + (r.OwedAmount || 0),
        0,
      );
      othersOweYouRows.push({
        Description: "TOTAL",
        OwedBy: "",
        OwedAmount: totalOthersOweYou,
        ExpenseTotal: "",
        CreatedAt: "",
      });
      const wsOthers = XLSX.utils.json_to_sheet(othersOweYouRows);
      XLSX.utils.book_append_sheet(wb, wsOthers, "Others Owe You");

      // Detail sheet: You Owe Others (list each split where you owe someone else)
      const youOweOthersRows: any[] = [];
      expenses.forEach((exp) => {
        if (exp.payer.id !== currentUserId) {
          const mySplit = exp.splits.find((s) => s.user.id === currentUserId);
          if (mySplit) {
            const amt = +(mySplit.baseAmount - (mySplit.deduction || 0));
            if (amt > 0) {
              youOweOthersRows.push({
                Description: exp.description,
                Payer: exp.payer.name,
                YourAmount: amt,
                ExpenseTotal: exp.totalAmount,
                CreatedAt: new Date(parseInt(exp.createdAt)).toLocaleString(),
              });
            }
          }
        }
      });
      const totalYouOweOthers = youOweOthersRows.reduce(
        (s, r) => s + (r.YourAmount || 0),
        0,
      );
      youOweOthersRows.push({
        Description: "TOTAL",
        Payer: "",
        YourAmount: totalYouOweOthers,
        ExpenseTotal: "",
        CreatedAt: "",
      });
      const wsYouOwe = XLSX.utils.json_to_sheet(youOweOthersRows);
      XLSX.utils.book_append_sheet(wb, wsYouOwe, "You Owe Others");

      const dateStr = new Date().toISOString().slice(0, 10);
      const rawName = journeyName || journeyId || "journey";
      const safeJourney = String(rawName).replace(/[^a-zA-Z0-9-_]/g, "_");
      const fileName = `${safeJourney}_${dateStr}_Expense_Summary.xlsx`;
      XLSX.writeFile(wb, fileName, { bookType: "xlsx", cellStyles: true });
      toast.success("Exported to Excel");
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Export failed");
    }
  };

  // Close preview on Escape and prevent background scroll while open
  useEffect(() => {
    if (!previewImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewImage(null);
    };
    document.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = original || "";
    };
  }, [previewImage]);

  // Unique members for selection
  const uniqueMembers = members.filter(
    (m, index, self) => index === self.findIndex((t) => t.name === m.name),
  );

  const startEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setAmount(expense.totalAmount.toString());
    setDescription(expense.description);
    setPayerId(expense.payer.id || currentUserId);
    setImageBase64(null); // Reset image, only send if changed

    // Determine split state
    const splitUserIds = expense.splits.map((s) => s.user.id);

    // Check if splits are equal
    const baseAmounts = expense.splits.map((s) => s.baseAmount);
    const allEqual =
      baseAmounts.length > 0 &&
      baseAmounts.every((val) => Math.abs(val - baseAmounts[0]) < 0.01);

    if (allEqual) {
      setSplitType("equal");
      const allMembersInvolved = uniqueMembers.every((m) =>
        splitUserIds.includes(m.id),
      );
      setIsAllSelected(allMembersInvolved);
      setSelectedMemberIds(splitUserIds);
      setIndividualAmounts({});
    } else {
      setSplitType("separate");
      const amounts: Record<string, string> = {};
      expense.splits.forEach((s) => {
        amounts[s.user.id] = s.baseAmount.toString();
      });
      setIndividualAmounts(amounts);
      setSelectedMemberIds(splitUserIds);
    }
  };

  const closeEdit = () => {
    setEditingExpense(null);
    setAmount("");
    setDescription("");
    setPayerId("");
    setImageBase64(null);
    setIsAllSelected(true);
    setSelectedMemberIds([]);
    setSplitType("equal");
    setIndividualAmounts({});
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMemberIds((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      } else {
        return [...prev, memberId];
      }
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      toast.error("Enter a valid non-negative number");
      return;
    }

    let splits: {
      userId: string;
      baseAmount: number;
      deduction: number;
      reason?: string;
    }[] = [];

    if (splitType === "equal") {
      let splitMembers = uniqueMembers;
      if (!isAllSelected) {
        splitMembers = uniqueMembers.filter((m) =>
          selectedMemberIds.includes(m.id),
        );
      }

      if (splitMembers.length === 0) {
        toast.error(
          "Please select at least one person to split the expense with.",
        );
        return;
      }

      const splitAmount = parsedAmount / splitMembers.length;
      splits = splitMembers.map((m) => ({
        userId: m.id,
        baseAmount: splitAmount,
        deduction: 0,
      }));
    } else {
      // Separate logic
      const totalInputAmount = Object.values(individualAmounts).reduce(
        (sum, val) => sum + (parseFloat(val) || 0),
        0,
      );

      if (Math.abs(totalInputAmount - parsedAmount) > 0.01) {
        toast.error(
          `Total split amount (${totalInputAmount.toFixed(
            2,
          )}) must equal expense amount (${parsedAmount.toFixed(2)})`,
        );
        return;
      }

      splits = Object.entries(individualAmounts)
        .map(([userId, val]) => ({
          userId,
          baseAmount: parseFloat(val) || 0,
          deduction: 0,
        }))
        .filter((s) => s.baseAmount > 0);

      if (splits.length === 0) {
        toast.error("Please enter amounts for at least one person.");
        return;
      }
    }

    try {
      await updateExpense({
        variables: {
          expenseId: editingExpense.id,
          payerId,
          totalAmount: parsedAmount,
          description,
          splits,
          imageBase64, // Only sends if changed (not null)
        },
      });
      closeEdit();
      toast.success("Expense updated successfully");
      // Refresh activity logs in the parent
      onRefetch?.();
    } catch (err) {
      console.error("Failed to update expense:", err);
      toast.error("Failed to update expense: " + (err as Error).message);
    }
  };

  const handleDelete = (expenseId: string) => {
    toast((t) => (
      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm">Delete this expense?</span>
        <div className="flex gap-2">
          <button
            className="bg-red-500 text-white px-3 py-1 rounded-lg text-xs cursor-pointer"
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                await deleteExpense({ variables: { expenseId } });
                toast.success("Expense deleted successfully");
                // Refresh activity logs in the parent
                onRefetch?.();
              } catch (err) {
                console.error("Failed to delete expense:", err);
                toast.error(
                  "Failed to delete expense: " + (err as Error).message,
                );
              }
            }}
          >
            Yes
          </button>
          <button
            className="bg-gray-200 px-3 py-1 rounded-lg text-xs cursor-pointer"
            onClick={() => toast.dismiss(t.id)}
          >
            No
          </button>
        </div>
      </div>
    ));
  };

  return (
    <div className="mt-6">
      <div className="flex justify-between flex-wrap gap-4 items-center mb-6">
        <div className="flex bg-gray-100 p-1 rounded-full w-fit">
          <button
            onClick={() => setViewMode("expenses")}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              viewMode === "expenses"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            } cursor-pointer`}
          >
            Expenses
          </button>
          <button
            onClick={() => setViewMode("actions")}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              viewMode === "actions"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            } cursor-pointer`}
          >
            Activity Logs
          </button>
        </div>

        {viewMode === "expenses" && (
          <div className="flex items-center gap-3">
            <span className="font-semibold text-gray-700">
              Total: ${formatCurrency(totalInvolvedAmount)}
            </span>
            <button
              onClick={exportToExcel}
              className="px-3 py-1 bg-gray-100 rounded-full hover:bg-gray-200 text-sm transition-colors cursor-pointer"
            >
              Export
            </button>
          </div>
        )}
      </div>

      {viewMode === "actions" ? (
        <>
          <div className="flex justify-end mb-4">
            {/* Date Filter */}
            <div className="relative w-full sm:w-auto min-w-[150px] [&>div>span]:hidden [&>div>button]:mt-0">
              <TailwindDatePicker
                value={dateFilter}
                onChange={(val) => setDateFilter(val)}
                label=""
              />
            </div>
          </div>
          {/* Scrollable container — required for position:sticky to work */}
          <div className="max-h-[calc(100vh-100px)] min-h-[800px] overflow-y-auto pr-1 custom-scrollbar">
            {(() => {
              // Only show user-facing create/update/delete logs
              const VISIBLE_ACTIONS = new Set([
                "EXPENSE_CREATED",
                "EXPENSE_UPDATED",
                "EXPENSE_DELETED",
                "JOURNEY_UPDATED",
                "JOURNEY_LOCK_TOGGLED",
                "JOURNEY_INPUT_LOCK_TOGGLED",
                "APPROVAL_REQUIREMENT_TOGGLED",
                "JOURNEY_PASSWORD_UPDATED",
              ]);

              // Filter and sort newest → oldest
              const visibleLogs = (actionLogs ?? [])
                .filter((log) => {
                  if (!VISIBLE_ACTIONS.has(log.action)) return false;
                  if (dateFilter) {
                    const d = new Date(parseInt(log.createdAt));
                    const logDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    if (logDateStr !== dateFilter) return false;
                  }
                  return true;
                })
                .slice()
                .sort((a, b) => parseInt(b.createdAt) - parseInt(a.createdAt));

              if (visibleLogs.length === 0) {
                return (
                  <p className="text-gray-500 text-center py-8">
                    No activity logs found.
                  </p>
                );
              }

              // Group by date
              const groups: { dateKey: string; logs: typeof visibleLogs }[] =
                [];
              visibleLogs.forEach((log) => {
                const key = toDateKey(log.createdAt);
                const last = groups[groups.length - 1];
                if (last && last.dateKey === key) {
                  last.logs.push(log);
                } else {
                  groups.push({ dateKey: key, logs: [log] });
                }
              });

              return groups.map(({ dateKey, logs: groupLogs }) => (
                <div key={dateKey}>
                  {/* Sticky date header — works because parent has overflow-y:auto */}
                  <div className="sticky top-0 z-10 py-2 mb-3 bg-white/90 backdrop-blur-sm">
                    <span className="inline-block bg-gray-100 text-gray-600 text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
                      {dateKey}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {groupLogs.map((log) => {
                      const name = log.actorName || "Someone";
                      // Extract expense description from details if present (format: "Expense: <desc>")
                      const expenseDesc = log.details?.startsWith("Expense:")
                        ? log.details.replace("Expense:", "").trim()
                        : null;

                      let metaObj: any = null;
                      try {
                        if (log.metadata) {
                          metaObj = JSON.parse(log.metadata);
                        }
                      } catch (e) {}

                      let sentence: string;
                      switch (log.action) {
                        case "EXPENSE_CREATED":
                          sentence = expenseDesc
                            ? `${name} created expense "${expenseDesc}"`
                            : `${name} added a new expense`;
                          break;
                        case "EXPENSE_UPDATED":
                          sentence = expenseDesc
                            ? `${name} updated expense "${expenseDesc}"`
                            : `${name} updated an expense`;
                          break;
                        case "EXPENSE_DELETED":
                          sentence = expenseDesc
                            ? `${name} deleted expense "${expenseDesc}"`
                            : `${name} deleted an expense`;
                          break;
                        case "JOURNEY_UPDATED":
                          sentence = `${name} updated the journey settings`;
                          break;
                        case "JOURNEY_LOCK_TOGGLED":
                          sentence =
                            log.details === "Journey locked"
                              ? `${name} locked the journey`
                              : `${name} unlocked the journey`;
                          break;
                        case "JOURNEY_INPUT_LOCK_TOGGLED":
                          sentence =
                            log.details === "Journey input locked"
                              ? `${name} locked expense input`
                              : `${name} unlocked expense input`;
                          break;
                        case "APPROVAL_REQUIREMENT_TOGGLED":
                          sentence =
                            log.details === "Join approval enabled"
                              ? `${name} enabled join approval`
                              : `${name} disabled join approval`;
                          break;
                        case "JOURNEY_PASSWORD_UPDATED":
                          sentence =
                            log.details === "Journey password set"
                              ? `${name} set a journey password`
                              : `${name} removed the journey password`;
                          break;
                        default:
                          sentence = `${name} performed an action`;
                      }

                      const changes: string[] = [];
                      if (metaObj && metaObj.before && metaObj.after) {
                        const b = metaObj.before;
                        const a = metaObj.after;

                        if (
                          b.description &&
                          a.description &&
                          b.description !== a.description
                        ) {
                          changes.push(
                            `Description: "${b.description}" ➔ "${a.description}"`,
                          );
                        }
                        if (
                          b.totalAmount !== undefined &&
                          a.totalAmount !== undefined &&
                          b.totalAmount !== a.totalAmount
                        ) {
                          changes.push(
                            `Amount: $${formatCurrency(b.totalAmount)} ➔ $${formatCurrency(a.totalAmount)}`,
                          );
                        }
                        if (b.payerId && a.payerId && b.payerId !== a.payerId) {
                          const getMemberName = (id: string) =>
                            members?.find((m) => m.id === id)?.name ||
                            "Unknown";
                          changes.push(
                            `Payer: ${getMemberName(b.payerId)} ➔ ${getMemberName(a.payerId)}`,
                          );
                        }
                      }

                      return (
                        <div
                          key={log.id}
                          className="p-4 border border-gray-100 rounded-2xl shadow-sm bg-white flex items-start gap-4"
                        >
                          <div className="bg-blue-50 text-blue-500 p-2 rounded-full mt-1 shrink-0">
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-900 font-medium leading-snug">
                              {sentence}
                            </p>
                            {changes.length > 0 && (
                              <div className="mt-2 p-2 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
                                {changes.map((change, idx) => (
                                  <p
                                    key={idx}
                                    className="text-xs text-gray-600 font-medium"
                                  >
                                    {change}
                                  </p>
                                ))}
                              </div>
                            )}
                            <div className="mt-1.5 text-xs text-gray-400">
                              {new Date(
                                parseInt(log.createdAt),
                              ).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
            <input
              type="text"
              placeholder="Search description..."
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              className="w-full sm:flex-1 p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white transition-colors text-sm"
            />

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              {/* Date Filter */}
              <div className="relative w-full sm:w-auto min-w-[150px] [&>div>span]:hidden [&>div>button]:mt-0">
                <TailwindDatePicker
                  value={dateFilter}
                  onChange={(val) => setDateFilter(val)}
                  label=""
                />
              </div>

              {/* Payer Filter */}
              <div className="relative w-full sm:w-auto min-w-[150px]">
                <button
                  type="button"
                  onClick={() => {
                    setIsFilterDropdownOpen(!isFilterDropdownOpen);
                    setFilterSearchQuery("");
                  }}
                  className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-xl bg-white text-sm cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <span className="truncate pr-2">
                    {payerFilter === ""
                      ? "All payers"
                      : uniquePayers.find(
                          (p) => (p.id || p.name) === payerFilter,
                        )?.name || payerFilter}
                  </span>
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform ${
                      isFilterDropdownOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 9l-7 7-7-7"
                    ></path>
                  </svg>
                </button>

                {isFilterDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsFilterDropdownOpen(false)}
                    ></div>
                    <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl ring-1 ring-black/5 overflow-hidden flex flex-col">
                      <div className="p-2 border-b border-gray-100 bg-gray-50/50">
                        <input
                          type="text"
                          placeholder="Search payer..."
                          value={filterSearchQuery}
                          onChange={(e) => setFilterSearchQuery(e.target.value)}
                          className="w-full p-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-56 overflow-y-auto py-1 custom-scrollbar">
                        <button
                          type="button"
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer ${
                            payerFilter === ""
                              ? "bg-blue-50 font-medium text-blue-700"
                              : "text-gray-700"
                          }`}
                          onClick={() => {
                            setPayerFilter("");
                            setIsFilterDropdownOpen(false);
                            setFilterSearchQuery("");
                          }}
                        >
                          All payers
                        </button>
                        {uniquePayers
                          .filter((p) =>
                            (p.name || "")
                              .toLowerCase()
                              .includes(filterSearchQuery.toLowerCase()),
                          )
                          .map((p) => (
                            <button
                              key={p.id || p.name}
                              type="button"
                              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer ${
                                payerFilter === (p.id || p.name)
                                  ? "bg-blue-50 font-medium text-blue-700"
                                  : "text-gray-700"
                              }`}
                              onClick={() => {
                                setPayerFilter(p.id || p.name);
                                setIsFilterDropdownOpen(false);
                                setFilterSearchQuery("");
                              }}
                            >
                              {p.name}
                            </button>
                          ))}
                        {uniquePayers.filter((p) =>
                          (p.name || "")
                            .toLowerCase()
                            .includes(filterSearchQuery.toLowerCase()),
                        ).length === 0 && (
                          <div className="px-4 py-3 text-sm text-gray-500 text-center">
                            No payers found
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          {/* Scrollable container — required for position:sticky to work */}
          {/* Sort newest → oldest, then group by date */}
          <div
            ref={scrollContainerRef}
            className="relative max-h-[calc(100vh-100px)] min-h-[800px] overflow-y-auto px-1 pb-1 pt-0 custom-scrollbar"
            onScroll={(e) => {
              const target = e.currentTarget;
              if (
                target.scrollHeight - target.scrollTop <=
                  target.clientHeight + 100 &&
                !loadingMoreExpenses &&
                hasMoreExpenses &&
                onLoadMoreExpenses
              ) {
                onLoadMoreExpenses();
              }
            }}
          >
            {(() => {
              const sorted = visibleExpenses
                .slice()
                .sort((a, b) => parseInt(b.createdAt) - parseInt(a.createdAt));

              const groups: { dateKey: string; items: typeof sorted }[] = [];
              sorted.forEach((exp) => {
                const key = toDateKey(exp.createdAt);
                const last = groups[groups.length - 1];
                if (last && last.dateKey === key) {
                  last.items.push(exp);
                } else {
                  groups.push({ dateKey: key, items: [exp] });
                }
              });

              if (sorted.length === 0) {
                return <p className="text-gray-500">No expenses yet.</p>;
              }

              return groups.map(({ dateKey, items }) => (
                <div key={dateKey}>
                  {/* Sticky date header — works because parent has overflow-y:auto */}
                  <div className="sticky top-0 z-10 pt-2 pb-3 mb-3 bg-white">
                    <span className="inline-block bg-gray-100 text-gray-500 text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
                      {dateKey}
                    </span>
                  </div>
                  <div className="space-y-4">
                    {items.map((expense, index) => {
                      return (
                        <RollerUnstackReveal
                          key={expense.id}
                          index={index}
                          scrollContainerRef={
                            scrollContainerRef as React.RefObject<HTMLElement | null>
                          }
                        >
                          <ExpenseCard
                            expense={expense}
                            currentUserId={currentUserId}
                            isLeader={isLeader}
                            formatCurrency={formatCurrency}
                            setPreviewImage={setPreviewImage}
                            startEdit={startEdit}
                            handleDelete={handleDelete}
                            deleting={deleting}
                            containerRef={scrollContainerRef}
                          />
                        </RollerUnstackReveal>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
            {loadingMoreExpenses && (
              <div className="py-4 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            )}
          </div>
          {previewImage && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
              onClick={() => setPreviewImage(null)}
              role="dialog"
              aria-modal="true"
            >
              <div className="max-w-[90vw] max-h-[90vh] w-full flex items-center justify-center">
                <div
                  className="relative overflow-auto max-w-full max-h-full bg-transparent"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewImage(null);
                    }}
                    aria-label="Close image preview"
                    className="absolute top-2 right-2 z-50 text-white bg-black/40 rounded-full p-2 cursor-pointer"
                  >
                    ✕
                  </button>
                  <img
                    src={previewImage}
                    alt="Preview large"
                    className="block max-w-none max-h-none object-contain"
                    style={{ display: "block" }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Edit Modal */}
          {editingExpense && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
              <div className="bg-white rounded-[34px] shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                  <h2 className="text-xl font-bold">Edit Expense</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-6 modal-scroll-area">
                  <form
                    id="edit-expense-form"
                    onSubmit={handleSave}
                    className="space-y-4"
                  >
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700">
                        Description
                      </label>
                      <input
                        className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white transition-colors"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700">
                        Amount
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white transition-colors"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700">
                        Paid By
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditPayerDropdownOpen(
                              !isEditPayerDropdownOpen,
                            );
                            setEditPayerSearchQuery("");
                          }}
                          className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-xl bg-gray-50 hover:bg-white transition-colors cursor-pointer text-left"
                        >
                          <span className="truncate pr-2">
                            {
                              uniqueMembers.find(
                                (member) => member.id === payerId,
                              )?.name
                            }
                            {payerId === currentUserId ? " (You)" : ""}
                          </span>
                          <svg
                            className={`w-4 h-4 text-gray-500 transition-transform ${
                              isEditPayerDropdownOpen ? "rotate-180" : ""
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M19 9l-7 7-7-7"
                            ></path>
                          </svg>
                        </button>

                        {isEditPayerDropdownOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setIsEditPayerDropdownOpen(false)}
                            ></div>
                            <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl ring-1 ring-black/5 overflow-hidden flex flex-col">
                              <div className="p-2 border-b border-gray-100 bg-gray-50/50">
                                <input
                                  type="text"
                                  placeholder="Search member..."
                                  value={editPayerSearchQuery}
                                  onChange={(e) =>
                                    setEditPayerSearchQuery(e.target.value)
                                  }
                                  className="w-full p-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all"
                                  autoFocus
                                />
                              </div>
                              <div className="max-h-56 overflow-y-auto py-1 custom-scrollbar">
                                {uniqueMembers
                                  .filter((m) =>
                                    m.name
                                      .toLowerCase()
                                      .includes(
                                        editPayerSearchQuery.toLowerCase(),
                                      ),
                                  )
                                  .map((member) => (
                                    <button
                                      key={member.id}
                                      type="button"
                                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer ${
                                        payerId === member.id
                                          ? "bg-blue-50 font-medium text-blue-700"
                                          : "text-gray-700"
                                      }`}
                                      onClick={() => {
                                        setPayerId(member.id);
                                        setIsEditPayerDropdownOpen(false);
                                        setEditPayerSearchQuery("");
                                      }}
                                    >
                                      {member.name}{" "}
                                      {member.id === currentUserId
                                        ? "(You)"
                                        : ""}
                                    </button>
                                  ))}
                                {uniqueMembers.filter((m) =>
                                  m.name
                                    .toLowerCase()
                                    .includes(
                                      editPayerSearchQuery.toLowerCase(),
                                    ),
                                ).length === 0 && (
                                  <div className="px-4 py-3 text-sm text-gray-500 text-center">
                                    No members found
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Split Logic */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Split With
                        </label>
                        <div className="flex bg-gray-100 rounded-lg p-1">
                          <button
                            type="button"
                            onClick={() => setSplitType("equal")}
                            className={`cursor-pointer px-3 py-1 text-xs font-medium rounded-md transition-all ${
                              splitType === "equal"
                                ? "bg-white text-black shadow-sm"
                                : "text-gray-500 hover:text-gray-700"
                            }`}
                          >
                            Equally
                          </button>
                          <button
                            type="button"
                            onClick={() => setSplitType("separate")}
                            className={`cursor-pointer px-3 py-1 text-xs font-medium rounded-md transition-all ${
                              splitType === "separate"
                                ? "bg-white text-black shadow-sm"
                                : "text-gray-500 hover:text-gray-700"
                            }`}
                          >
                            Separate
                          </button>
                        </div>
                      </div>

                      {splitType === "equal" ? (
                        <>
                          {isAllSelected ? (
                            <button
                              type="button"
                              onClick={() => {
                                setIsAllSelected(false);
                                setSelectedMemberIds(
                                  uniqueMembers.map((m) => m.id),
                                );
                              }}
                              className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-80 transition-opacity cursor-pointer"
                            >
                              All
                              <span className="text-gray-300 font-bold">✕</span>
                            </button>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsAllSelected(true);
                                    setSelectedMemberIds([]);
                                  }}
                                  className="text-sm text-blue-600 hover:underline cursor-pointer"
                                >
                                  Reset to All
                                </button>
                                <span className="text-xs text-gray-500">
                                  {selectedMemberIds.length} selected
                                </span>
                              </div>

                              {uniqueMembers.length > 10 && (
                                <input
                                  type="text"
                                  placeholder="Search members..."
                                  value={memberSearchQuery}
                                  onChange={(e) =>
                                    setMemberSearchQuery(e.target.value)
                                  }
                                  className="w-full p-2 text-sm border border-gray-200 rounded-xl bg-gray-50 mb-2 focus:outline-none focus:border-blue-400"
                                />
                              )}

                              <div className="flex flex-wrap gap-2">
                                {uniqueMembers
                                  .filter((m) =>
                                    normalizeString(m.name || "").includes(
                                      normalizeString(memberSearchQuery || ""),
                                    ),
                                  )
                                  .map((member) => {
                                    const isSelected =
                                      selectedMemberIds.includes(member.id);
                                    return (
                                      <button
                                        key={member.id}
                                        type="button"
                                        onClick={() =>
                                          toggleMemberSelection(member.id)
                                        }
                                        className={`
                                          flex items-center justify-center px-3 py-1 rounded-full text-sm border transition-all cursor-pointer
                                          ${
                                            isSelected
                                              ? "bg-black text-white border-black shadow-sm"
                                              : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                                          }
                                        `}
                                      >
                                        {member.name}
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2">
                          {uniqueMembers.map((member) => (
                            <div
                              key={member.id}
                              className="flex items-center justify-between p-2 border border-gray-100 rounded-lg bg-gray-50"
                            >
                              <span className="text-sm font-medium text-gray-700">
                                {member.name}
                              </span>
                              <input
                                type="number"
                                placeholder="0.00"
                                step="0.01"
                                value={individualAmounts[member.id] || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const numVal = parseFloat(val);
                                  const total = parseFloat(amount);
                                  if (
                                    !isNaN(total) &&
                                    !isNaN(numVal) &&
                                    numVal > total
                                  ) {
                                    toast.error(
                                      "Individual amount cannot exceed total amount",
                                    );
                                    return;
                                  }
                                  setIndividualAmounts((prev) => ({
                                    ...prev,
                                    [member.id]: val,
                                  }));
                                }}
                                className="w-24 p-2 text-sm border border-gray-200 rounded-lg focus:bg-white transition-colors text-right"
                              />
                            </div>
                          ))}
                          <div className="flex flex-col items-end pt-2 border-t border-gray-100">
                            <div className="text-sm mb-1">
                              <span className="text-gray-500 mr-2">Total:</span>
                              <span
                                className={`font-bold ${
                                  Math.abs(
                                    Object.values(individualAmounts).reduce(
                                      (sum, val) =>
                                        sum + (parseFloat(val) || 0),
                                      0,
                                    ) - parseFloat(amount || "0"),
                                  ) < 0.01
                                    ? "text-green-600"
                                    : "text-red-500"
                                }`}
                              >
                                {Object.values(individualAmounts)
                                  .reduce(
                                    (sum, val) => sum + (parseFloat(val) || 0),
                                    0,
                                  )
                                  .toFixed(2)}
                              </span>
                              <span className="text-gray-400 mx-1">/</span>
                              <span className="text-gray-700">
                                {parseFloat(amount || "0").toFixed(2)}
                              </span>
                            </div>
                            <div className="text-xs">
                              <span className="text-gray-500 mr-2">
                                Remaining:
                              </span>
                              <span
                                className={
                                  Math.abs(
                                    parseFloat(amount || "0") -
                                      Object.values(individualAmounts).reduce(
                                        (sum, val) =>
                                          sum + (parseFloat(val) || 0),
                                        0,
                                      ),
                                  ) < 0.01
                                    ? "text-green-600 font-medium"
                                    : "text-red-500 font-bold"
                                }
                              >
                                {(
                                  parseFloat(amount || "0") -
                                  Object.values(individualAmounts).reduce(
                                    (sum, val) => sum + (parseFloat(val) || 0),
                                    0,
                                  )
                                ).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700">
                        Receipt Image (Optional)
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="cursor-pointer w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-black file:text-white hover:file:opacity-80 cursor-pointer"
                      />
                      {imageBase64 && (
                        <div className="mt-2 relative inline-block">
                          <div className="relative h-20 w-20">
                            <button
                              type="button"
                              onClick={() => setPreviewImage(imageBase64)}
                              aria-label="Open selected receipt preview"
                              className="absolute inset-0 w-full h-full p-0 m-0"
                            >
                              <Image
                                src={imageBase64}
                                alt="Preview"
                                fill
                                sizes="80px"
                                className="rounded-xl cursor-pointer object-cover"
                              />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setImageBase64(null);
                              if (fileInputRef.current) {
                                fileInputRef.current.value = "";
                              }
                            }}
                            className="absolute -top-2 -right-2 bg-white text-gray-700 hover:text-red-500 rounded-full p-1 shadow-md border border-gray-100 transition-colors cursor-pointer z-10"
                            title="Remove image"
                          >
                            <svg
                              className="w-4 h-4"
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
                          </button>
                        </div>
                      )}
                      {!imageBase64 && editingExpense.hasImage && (
                        <p className="text-xs text-gray-500 mt-1">
                          Current image will be kept if no new image is
                          selected.
                        </p>
                      )}
                    </div>
                  </form>
                </div>
                <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeEdit}
                    className="px-4 py-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="edit-expense-form"
                    disabled={updating}
                    className="px-4 py-2 bg-black text-white rounded-full hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    {updating ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ExpenseCard({
  expense,
  currentUserId,
  isLeader,
  formatCurrency,
  setPreviewImage,
  startEdit,
  handleDelete,
  deleting,
  containerRef,
}: {
  expense: any;
  currentUserId: string;
  isLeader: boolean;
  formatCurrency: (n: number) => string;
  setPreviewImage: (s: string) => void;
  startEdit: (e: any) => void;
  handleDelete: (id: string) => void;
  deleting: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const mySplit = expense.splits.find((s: any) => s.user.id === currentUserId);
  const myShare = mySplit ? mySplit.baseAmount - (mySplit.deduction || 0) : 0;
  const isPayer = expense.payer.id && expense.payer.id === currentUserId;
  const canEdit = isPayer || isLeader;

  return (
    <motion.div
      className="p-6 border border-gray-100 rounded-3xl shadow-sm bg-white"
      initial={{ clipPath: "inset(0% 50% 0% 50%)", opacity: 0 }}
      whileInView={{ clipPath: "inset(0% 0% 0% 0%)", opacity: 1 }}
      viewport={{ once: true, margin: "-20px" }}
      transition={{
        duration: 0.5,
        ease: "easeOut",
      }}
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="font-semibold text-lg">{expense.description}</p>
          <p className="text-sm text-gray-500">
            Paid by {expense.payer.name} • $
            {formatCurrency(expense.totalAmount)}
          </p>
          <p className="text-sm font-medium text-black mt-1">
            Your share: ${formatCurrency(myShare)}
            {mySplit && mySplit.deduction > 0 && (
              <span className="text-xs text-gray-500 block">
                (Deduction: ${formatCurrency(mySplit.deduction)} -{" "}
                {mySplit.reason || "No reason provided"})
              </span>
            )}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            <span className="font-medium">
              Split with ({expense.splits.length}):{" "}
            </span>
            {expense.splits.map((s: any) => s.user.name).join(", ")}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {new Date(parseInt(expense.createdAt)).toLocaleString()}
          </p>
        </div>
        {expense.hasImage && (
          <div className="relative h-16 w-16">
            <button
              type="button"
              onClick={() => setPreviewImage(`/api/image/${expense.id}`)}
              className="absolute inset-0 w-full h-full p-0 m-0 cursor-pointer"
              aria-label={`Open receipt for ${expense.description}`}
            >
              <Image
                src={`/api/image/${expense.id}`}
                alt="Receipt"
                fill
                sizes="64px"
                className="rounded-xl cursor-pointer object-cover"
              />
            </button>
          </div>
        )}

        {canEdit && (
          <div className="flex flex-col gap-2 ml-2">
            <button
              onClick={() => startEdit(expense)}
              className="px-3 py-1 bg-gray-100 rounded-full hover:bg-gray-200 text-sm transition-colors cursor-pointer"
            >
              Edit
            </button>
            <button
              onClick={() => handleDelete(expense.id)}
              className="px-3 py-1 bg-red-50 text-red-600 rounded-full hover:bg-red-100 text-sm transition-colors cursor-pointer"
              disabled={deleting}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

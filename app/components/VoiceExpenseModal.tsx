"use client";

import { useState } from "react";
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import toast from "react-hot-toast";
import { useCurrency } from "../context/CurrencyContext";
import { useVoiceRecorder } from "../../lib/voice/useVoiceRecorder";
import type {
  ParsedExpense,
  ParseExpensesResponse,
  TranscribeResponse,
  VoiceApiError,
} from "../../lib/voice/types";

const ADD_EXPENSE = gql`
  mutation AddExpenseFromVoice(
    $journeyId: ID!
    $payerId: ID!
    $totalAmount: Float!
    $description: String!
    $splits: [SplitInput]!
    $currency: String
  ) {
    addExpense(
      journeyId: $journeyId
      payerId: $payerId
      totalAmount: $totalAmount
      description: $description
      splits: $splits
      currency: $currency
    ) {
      id
      description
      totalAmount
      currency
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
      createdAt
    }
  }
`;

interface Member {
  id: string;
  name: string;
}

interface VoiceExpenseModalProps {
  journeyId: string;
  currentUser: Member;
  members: Member[];
  onClose: () => void;
  onExpensesAdded?: () => void;
}

type FlowStep =
  | "record"
  | "transcribing"
  | "parsing"
  | "review"
  | "submitting"
  | "done";

/** Computes equal-split base-currency amounts for the given amount/members, matching AddExpenseForm's logic. */
function computeEqualSplits(
  totalAmount: number,
  participantIds: string[],
): { userId: string; baseAmount: number; deduction: number; reason: string }[] {
  if (participantIds.length === 0) return [];
  const splitAmount = totalAmount / participantIds.length;
  return participantIds.map((userId) => ({
    userId,
    baseAmount: splitAmount,
    deduction: 0,
    reason: "",
  }));
}

export default function VoiceExpenseModal({
  journeyId,
  currentUser,
  members,
  onClose,
  onExpensesAdded,
}: VoiceExpenseModalProps) {
  const { baseCurrency, journeyCurrencies } = useCurrency();
  const recorder = useVoiceRecorder();

  const [step, setStep] = useState<FlowStep>("record");
  const [transcript, setTranscript] = useState("");
  const [draftExpenses, setDraftExpenses] = useState<ParsedExpense[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [submittedCount, setSubmittedCount] = useState(0);

  const [addExpense] = useMutation(ADD_EXPENSE);

  const uniqueMembers = members.filter(
    (m, index, self) => index === self.findIndex((t) => t.name === m.name),
  );

  const currencyContextList = [
    ...(baseCurrency
      ? [{ code: baseCurrency.code, name: baseCurrency.name, symbol: baseCurrency.symbol, isBase: true }]
      : []),
    ...journeyCurrencies
      .filter((c) => c.code !== baseCurrency?.code)
      .map((c) => ({ code: c.code, name: c.name, symbol: c.symbol, isBase: false })),
  ];

  // Fallback so the feature still works for journeys with no currencies configured yet.
  const effectiveCurrencies =
    currencyContextList.length > 0
      ? currencyContextList
      : [{ code: "USD", name: "US Dollar", symbol: "$", isBase: true }];
  const effectiveBaseCode = baseCurrency?.code || effectiveCurrencies[0].code;

  const handlePressStart = async () => {
    setApiError(null);
    await recorder.startRecording();
  };

  const handlePressEnd = async () => {
    if (recorder.status !== "recording") return;
    const result = await recorder.stopRecording();
    if (!result) {
      // Too short / empty - stay on the record screen silently.
      return;
    }
    await runTranscribeAndParse(result.audioBase64, result.format);
  };

  const runTranscribeAndParse = async (audioBase64: string, format: string) => {
    setStep("transcribing");
    setApiError(null);
    try {
      const transcribeRes = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64, format }),
      });
      const transcribeData = (await transcribeRes.json()) as
        | TranscribeResponse
        | VoiceApiError;

      if (!transcribeRes.ok || !("transcript" in transcribeData)) {
        setApiError(
          ("error" in transcribeData && transcribeData.error) ||
            "Couldn't transcribe that recording.",
        );
        setStep("record");
        return;
      }

      setTranscript(transcribeData.transcript);
      setStep("parsing");

      const parseRes = await fetch("/api/voice/parse-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcribeData.transcript,
          members: uniqueMembers,
          currencies: effectiveCurrencies,
          baseCurrencyCode: effectiveBaseCode,
          currentUserId: currentUser.id,
        }),
      });
      const parseData = (await parseRes.json()) as
        | ParseExpensesResponse
        | VoiceApiError;

      if (!parseRes.ok || !("expenses" in parseData)) {
        setApiError(
          ("error" in parseData && parseData.error) ||
            "Couldn't understand that recording.",
        );
        setStep("record");
        return;
      }

      if (parseData.transcriptUnclear || parseData.expenses.length === 0) {
        setApiError(
          "Didn't catch a clear expense in that. Try again, e.g. \"Dinner, 200000 dong, Quang paid\".",
        );
        setStep("record");
        return;
      }

      setDraftExpenses(parseData.expenses);
      setStep("review");
    } catch (err) {
      console.error("Voice flow error:", err);
      setApiError("Something went wrong. Please try again.");
      setStep("record");
    }
  };

  const updateDraft = (draftId: string, patch: Partial<ParsedExpense>) => {
    setDraftExpenses((prev) =>
      prev.map((d) => (d.draftId === draftId ? { ...d, ...patch } : d)),
    );
  };

  const removeDraft = (draftId: string) => {
    setDraftExpenses((prev) => prev.filter((d) => d.draftId !== draftId));
  };

  const handleConfirmAll = async () => {
    if (draftExpenses.length === 0) return;
    setStep("submitting");
    setSubmittedCount(0);

    let successCount = 0;
    for (const draft of draftExpenses) {
      try {
        const participantIds =
          draft.splitType === "equal"
            ? draft.splitMemberIds && draft.splitMemberIds.length > 0
              ? draft.splitMemberIds
              : uniqueMembers.map((m) => m.id)
            : [];

        const splits =
          draft.splitType === "custom" && draft.customSplits
            ? draft.customSplits.map((s) => ({
                userId: s.userId,
                baseAmount: s.amount,
                deduction: 0,
                reason: "",
              }))
            : computeEqualSplits(draft.totalAmount, participantIds);

        if (splits.length === 0) {
          toast.error(`Skipped "${draft.description}" - no split participants.`);
          continue;
        }

        await addExpense({
          variables: {
            journeyId,
            payerId: draft.payerId || currentUser.id,
            totalAmount: draft.totalAmount,
            description: draft.description,
            splits,
            currency:
              draft.currency === effectiveBaseCode ? null : draft.currency,
          },
        });
        successCount += 1;
        setSubmittedCount((c) => c + 1);
      } catch (err) {
        console.error("Failed to save voice expense:", err);
        toast.error(`Failed to save "${draft.description}".`);
      }
    }

    if (successCount > 0) {
      toast.success(
        successCount === 1
          ? "Expense added!"
          : `${successCount} expenses added!`,
      );
      onExpensesAdded?.();
    }
    setStep("done");
  };

  const handleRecordAnother = () => {
    setTranscript("");
    setDraftExpenses([]);
    setApiError(null);
    setStep("record");
  };

  const [openReasonId, setOpenReasonId] = useState<string | null>(null);

  const renderFlagBadge = (
    flag: { uncertain: boolean; reason?: string },
    badgeId: string,
  ) => {
    if (!flag.uncertain) return null;
    const isOpen = openReasonId === badgeId;
    return (
      <span className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpenReasonId(isOpen ? null : badgeId)}
          title={flag.reason || "P

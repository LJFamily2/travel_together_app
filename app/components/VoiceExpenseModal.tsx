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

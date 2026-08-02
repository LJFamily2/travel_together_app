"use client";

import { useEffect, useState } from "react";
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import toast from "react-hot-toast";
import Cookies from "js-cookie";
import { useCurrency } from "../context/CurrencyContext";
import { useVoiceRecorder } from "../../lib/voice/useVoiceRecorder";
import type {
  ParsedExpense,
  ParseExpensesResponse,
  TranscribeResponse,
  VoiceApiError,
  ClarificationRequest,
  VoiceConversationTurn,
} from "../../lib/voice/types";
import { MAX_VOICE_CLARIFICATION_ROUNDS } from "../../lib/voice/types";

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
  | "clarifying"
  | "clarify-transcribing"
  | "review"
  | "submitting"
  | "done";

/** Guards against ever rendering a raw/unexpected error payload (e.g. a stray JSON blob) directly to the user. */
function sanitizeUserMessage(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.length > 200) {
    return fallback;
  }
  return trimmed;
}

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
  const [clarification, setClarification] = useState<ClarificationRequest | null>(null);
  const [conversationHistory, setConversationHistory] = useState<VoiceConversationTurn[]>([]);

  const [addExpense] = useMutation(ADD_EXPENSE);

  // Request mic permission as soon as the modal opens, rather than waiting
  // for the user's first press-and-hold - that gesture would otherwise race
  // the permission prompt and get swallowed while it's showing. Release the
  // mic when the modal closes/unmounts.
  useEffect(() => {
    recorder.requestPermission();
    return () => {
      recorder.releaseStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Too short / empty - stay on the current screen silently.
      return;
    }
    if (step === "clarifying") {
      await runClarificationAnswer(result.audioBase64, result.format);
    } else {
      await runTranscribeAndParse(result.audioBase64, result.format);
    }
  };

  /**
   * Shared handling for a /api/voice/parse-expenses response, used by both
   * the initial recording and every clarification-answer follow-up.
   * `historySentThisCall` is the exact history array that was sent (not the
   * possibly-stale `conversationHistory` state) so the round cap check is
   * always accurate.
   */
  const handleParseResponse = (
    parseRes: Response,
    parseData: ParseExpensesResponse | VoiceApiError,
    historySentThisCall: VoiceConversationTurn[],
  ) => {
    const fallbackStep: FlowStep = historySentThisCall.length > 0 ? "clarifying" : "record";

    if (parseRes.status === 401) {
      setApiError("Your session has expired. Please sign in again.");
      setStep("record");
      return;
    }

    if (parseRes.status === 429) {
      setApiError("Too many requests. Please wait a moment and try again.");
      setStep(fallbackStep);
      return;
    }

    if (!parseRes.ok || !("expenses" in parseData)) {
      setApiError(
        sanitizeUserMessage(
          "error" in parseData ? parseData.error : null,
          "Couldn't understand that recording.",
        ),
      );
      setStep(fallbackStep);
      return;
    }

    // The model has everything it needs except one blocking piece of info
    // (in practice, an amount) - ask the user instead of giving up, as long
    // as we haven't already used up our clarification rounds.
    if (
      parseData.clarification &&
      historySentThisCall.length < MAX_VOICE_CLARIFICATION_ROUNDS
    ) {
      setDraftExpenses(parseData.expenses);
      setClarification(parseData.clarification);
      setStep("clarifying");
      return;
    }

    if (parseData.transcriptUnclear || parseData.expenses.length === 0) {
      setApiError(
        "Didn't catch a clear expense in that. Try again, e.g. \"Dinner, 200000 dong, Quang paid\".",
      );
      setClarification(null);
      setConversationHistory([]);
      setStep("record");
      return;
    }

    setDraftExpenses(parseData.expenses);
    setClarification(null);
    setStep("review");
  };

  const runTranscribeAndParse = async (audioBase64: string, format: string) => {
    setStep("transcribing");
    setApiError(null);
    setClarification(null);
    setConversationHistory([]);
    try {
      const authToken = Cookies.get("guestToken");
      const authHeaders: HeadersInit = {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      };

      const transcribeRes = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ audioBase64, format }),
      });
      const transcribeData = (await transcribeRes.json()) as
        | TranscribeResponse
        | VoiceApiError;

      if (transcribeRes.status === 401) {
        setApiError("Your session has expired. Please sign in again.");
        setStep("record");
        return;
      }

      if (transcribeRes.status === 429) {
        setApiError("Too many requests. Please wait a moment and try again.");
        setStep("record");
        return;
      }

      if (!transcribeRes.ok || !("transcript" in transcribeData)) {
        setApiError(
          sanitizeUserMessage(
            "error" in transcribeData ? transcribeData.error : null,
            "Couldn't transcribe that recording.",
          ),
        );
        setStep("record");
        return;
      }

      setTranscript(transcribeData.transcript);
      setStep("parsing");

      const parseRes = await fetch("/api/voice/parse-expenses", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          transcript: transcribeData.transcript,
          members: uniqueMembers,
          currencies: effectiveCurrencies,
          baseCurrencyCode: effectiveBaseCode,
          currentUserId: currentUser.id,
          history: [],
        }),
      });
      const parseData = (await parseRes.json()) as
        | ParseExpensesResponse
        | VoiceApiError;

      handleParseResponse(parseRes, parseData, []);
    } catch (err) {
      console.error("Voice flow error:", err);
      setApiError("Something went wrong. Please try again.");
      setStep("record");
    }
  };

  /** Handles a recorded answer to a clarification question - transcribes it, appends to history, and re-parses with the original transcript + full history. */
  const runClarificationAnswer = async (audioBase64: string, format: string) => {
    const question = clarification?.question || "";
    setStep("clarify-transcribing");
    setApiError(null);
    try {
      const authToken = Cookies.get("guestToken");
      const authHeaders: HeadersInit = {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      };

      const transcribeRes = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ audioBase64, format }),
      });
      const transcribeData = (await transcribeRes.json()) as
        | TranscribeResponse
        | VoiceApiError;

      if (transcribeRes.status === 401) {
        setApiError("Your session has expired. Please sign in again.");
        setStep("clarifying");
        return;
      }

      if (transcribeRes.status === 429) {
        setApiError("Too many requests. Please wait a moment and try again.");
        setStep("clarifying");
        return;
      }

      if (!transcribeRes.ok || !("transcript" in transcribeData)) {
        setApiError(
          sanitizeUserMessage(
            "error" in transcribeData ? transcribeData.error : null,
            "Couldn't transcribe that answer.",
          ),
        );
        setStep("clarifying");
        return;
      }

      const newHistory: VoiceConversationTurn[] = [
        ...conversationHistory,
        { question, answerTranscript: transcribeData.transcript },
      ];
      setConversationHistory(newHistory);
      setStep("parsing");

      const parseRes = await fetch("/api/voice/parse-expenses", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          transcript,
          members: uniqueMembers,
          currencies: effectiveCurrencies,
          baseCurrencyCode: effectiveBaseCode,
          currentUserId: currentUser.id,
          history: newHistory,
        }),
      });
      const parseData = (await parseRes.json()) as
        | ParseExpensesResponse
        | VoiceApiError;

      handleParseResponse(parseRes, parseData, newHistory);
    } catch (err) {
      console.error("Voice clarification flow error:", err);
      setApiError("Something went wrong. Please try again.");
      setStep("clarifying");
    }
  };

  /** Lets the user bail out of the clarification loop and review whatever was captured so far, rather than being forced to keep answering. */
  const handleSkipClarification = () => {
    setClarification(null);
    if (draftExpenses.length > 0) {
      setStep("review");
    } else {
      setConversationHistory([]);
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
    setClarification(null);
    setConversationHistory([]);
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
          title={flag.reason || "Please double-check this"}
          className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5 cursor-pointer"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
          </svg>
          Check this
        </button>
        {isOpen && flag.reason && (
          <span className="absolute z-10 top-full left-0 mt-1 w-56 text-xs font-normal text-gray-700 bg-white border border-gray-200 rounded-lg shadow-lg p-2">
            {flag.reason}
          </span>
        )}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-[34px] rounded-t-[34px] shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 pb-4 border-b border-gray-100">
          <h3 className="text-lg font-bold">Add Expense by Voice</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto p-6 flex-1">
          {step === "record" && (
            <div className="flex flex-col items-center text-center gap-4 py-6">
              <p className="text-sm text-gray-600">
                Hold the button and speak, e.g.{" "}
                <span className="italic">&quot;Ăn tối, 590 baht, Hậu trả&quot;</span> or{" "}
                <span className="italic">&quot;Dinner, 590 baht, Hau paid&quot;</span>.
              </p>
              <p className="text-xs text-gray-400">
                Adding more than one? Say{" "}
                <span className="font-medium">&quot;tiếp theo&quot;</span>,{" "}
                <span className="font-medium">&quot;next&quot;</span>, or{" "}
                <span className="font-medium">&quot;cái nữa&quot;</span> between expenses.
              </p>

              <button
                type="button"
                onMouseDown={handlePressStart}
                onMouseUp={handlePressEnd}
                onMouseLeave={() => {
                  if (recorder.status === "recording") handlePressEnd();
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  handlePressStart();
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  handlePressEnd();
                }}
                disabled={recorder.status === "requesting-permission"}
                aria-pressed={recorder.status === "recording"}
                className={`select-none cursor-pointer w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all ${
                  recorder.status === "recording"
                    ? "bg-red-500 scale-110 animate-pulse"
                    : "bg-black hover:opacity-90"
                }`}
              >
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                  />
                </svg>
              </button>

              <p className="text-sm font-medium text-gray-700 h-5">
                {recorder.status === "recording"
                  ? `Recording... ${recorder.elapsedSeconds.toFixed(1)}s (release to send)`
                  : recorder.status === "requesting-permission"
                  ? "Setting up microphone..."
                  : "Hold to talk"}
              </p>

              {(recorder.errorMessage || apiError) && (
                <p className="text-sm text-red-500 max-w-sm">
                  {recorder.errorMessage || apiError}
                </p>
              )}
            </div>
          )}

          {(step === "transcribing" || step === "parsing") && (
            <div className="flex flex-col items-center text-center gap-3 py-10">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
              <p className="text-sm text-gray-600">
                {step === "transcribing"
                  ? "Listening to your recording..."
                  : "Figuring out the expense details..."}
              </p>
              {transcript && step === "parsing" && (
                <p className="text-xs text-gray-400 italic max-w-sm">
                  &quot;{transcript}&quot;
                </p>
              )}
            </div>
          )}

          {step === "clarifying" && clarification && (
            <div className="flex flex-col items-center text-center gap-4 py-6">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-800 max-w-sm">
                {clarification.question}
              </p>
              <p className="text-xs text-gray-400">Hold the button and answer</p>

              <button
                type="button"
                onMouseDown={handlePressStart}
                onMouseUp={handlePressEnd}
                onMouseLeave={() => {
                  if (recorder.status === "recording") handlePressEnd();
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  handlePressStart();
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  handlePressEnd();
                }}
                disabled={recorder.status === "requesting-permission"}
                aria-pressed={recorder.status === "recording"}
                className={`select-none cursor-pointer w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all ${
                  recorder.status === "recording"
                    ? "bg-red-500 scale-110 animate-pulse"
                    : "bg-black hover:opacity-90"
                }`}
              >
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                  />
                </svg>
              </button>

              <p className="text-sm font-medium text-gray-700 h-5">
                {recorder.status === "recording"
                  ? `Recording... ${recorder.elapsedSeconds.toFixed(1)}s (release to send)`
                  : recorder.status === "requesting-permission"
                  ? "Setting up microphone..."
                  : "Hold to answer"}
              </p>

              {(recorder.errorMessage || apiError) && (
                <p className="text-sm text-red-500 max-w-sm">
                  {recorder.errorMessage || apiError}
                </p>
              )}

              <button
                type="button"
                onClick={handleSkipClarification}
                className="text-xs text-gray-400 hover:text-gray-600 underline cursor-pointer"
              >
                Skip - I&apos;ll fix it manually
              </button>
            </div>
          )}

          {step === "clarify-transcribing" && (
            <div className="flex flex-col items-center text-center gap-3 py-10">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
              <p className="text-sm text-gray-600">Got it, one moment...</p>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4">
              {transcript && (
                <p className="text-xs text-gray-400 italic border-l-2 border-gray-200 pl-2">
                  &quot;{transcript}&quot;
                </p>
              )}

              {draftExpenses.map((draft) => {
                const payer =
                  uniqueMembers.find((m) => m.id === draft.payerId) || null;
                const participantIds =
                  draft.splitType === "equal"
                    ? draft.splitMemberIds && draft.splitMemberIds.length > 0
                      ? draft.splitMemberIds
                      : uniqueMembers.map((m) => m.id)
                    : (draft.customSplits || []).map((s) => s.userId);

                return (
                  <div
                    key={draft.draftId}
                    className="border border-gray-100 rounded-2xl p-4 bg-gray-50 space-y-3"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={draft.description}
                            onChange={(e) =>
                              updateDraft(draft.draftId, {
                                description: e.target.value,
                              })
                            }
                            className="font-semibold text-sm bg-transparent border-b border-transparent focus:border-gray-300 outline-none w-full min-w-0"
                          />
                          <div className="shrink-0">
                            {renderFlagBadge(draft.flags.description, `${draft.draftId}-description`)}
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 break-words">{draft.sourceText}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDraft(draft.draftId)}
                        aria-label="Remove this expense"
                        className="text-gray-400 hover:text-red-500 p-1 cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div className="flex gap-2 items-start">
                      <div className="flex-1 min-w-0">
                        <label className="text-xs text-gray-500">Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          value={draft.totalAmount || ""}
                          onChange={(e) =>
                            updateDraft(draft.draftId, {
                              totalAmount: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-full p-2 text-sm border border-gray-200 rounded-lg bg-white"
                        />
                        <div className="mt-1">
                          {renderFlagBadge(draft.flags.totalAmount, `${draft.draftId}-amount`)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <label className="text-xs text-gray-500">Currency</label>
                        <select
                          value={draft.currency}
                          onChange={(e) =>
                            updateDraft(draft.draftId, {
                              currency: e.target.value,
                            })
                          }
                          className="w-full p-2 text-sm border border-gray-200 rounded-lg bg-white"
                        >
                          {effectiveCurrencies.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code}
                            </option>
                          ))}
                        </select>
                        <div className="mt-1">
                          {renderFlagBadge(draft.flags.currency, `${draft.draftId}-currency`)}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-gray-500">Paid by</label>
                      <div className="flex items-center gap-1">
                        <select
                          value={draft.payerId || ""}
                          onChange={(e) =>
                            updateDraft(draft.draftId, {
                              payerId: e.target.value || null,
                            })
                          }
                          className="w-full min-w-0 p-2 text-sm border border-gray-200 rounded-lg bg-white"
                        >
                          <option value="" disabled>
                            Select payer
                          </option>
                          {uniqueMembers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} {m.id === currentUser.id ? "(You)" : ""}
                            </option>
                          ))}
                        </select>
                        <div className="shrink-0">
                          {renderFlagBadge(draft.flags.payer, `${draft.draftId}-payer`)}
                        </div>
                      </div>
                      {draft.payerNameRaw && !payer && (
                        <p className="text-xs text-orange-500 mt-1 break-words">
                          Heard &quot;{draft.payerNameRaw}&quot; - please confirm who paid.
                        </p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-1">
                        <label className="text-xs text-gray-500">
                          Split{" "}
                          {draft.splitType === "equal" ? "equally with" : "custom with"}
                        </label>
                        {renderFlagBadge(draft.flags.split, `${draft.draftId}-split`)}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {uniqueMembers.map((m) => {
                          const included = participantIds.includes(m.id);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                if (draft.splitType !== "equal") return;
                                const current =
                                  draft.splitMemberIds &&
                                  draft.splitMemberIds.length > 0
                                    ? draft.splitMemberIds
                                    : uniqueMembers.map((mm) => mm.id);
                                const next = current.includes(m.id)
                                  ? current.filter((id) => id !== m.id)
                                  : [...current, m.id];
                                updateDraft(draft.draftId, {
                                  splitMemberIds: next,
                                });
                              }}
                              className={`text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                                included
                                  ? "bg-black text-white border-black"
                                  : "bg-white text-gray-600 border-gray-200"
                              } ${draft.splitType !== "equal" ? "opacity-50 cursor-default" : ""}`}
                              disabled={draft.splitType !== "equal"}
                            >
                              {m.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              {draftExpenses.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-6">
                  All expenses removed. Record again to add more.
                </p>
              )}
            </div>
          )}

          {step === "submitting" && (
            <div className="flex flex-col items-center text-center gap-3 py-10">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
              <p className="text-sm text-gray-600">
                Saving {submittedCount}/{draftExpenses.length} expenses...
              </p>
            </div>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center text-center gap-3 py-10">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-sm text-gray-600">All done!</p>
            </div>
          )}
        </div>

        <div className="p-6 pt-4 border-t border-gray-100 flex gap-3">
          {step === "review" && (
            <>
              <button
                type="button"
                onClick={handleRecordAnother}
                className="flex-1 border border-gray-200 text-gray-700 py-3 px-4 rounded-full font-medium hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Record again
              </button>
              <button
                type="button"
                onClick={handleConfirmAll}
                disabled={draftExpenses.length === 0}
                className="flex-1 bg-black text-white py-3 px-4 rounded-full font-medium hover:opacity-80 disabled:opacity-50 transition-opacity cursor-pointer"
              >
                Confirm &amp; Save {draftExpenses.length > 0 ? `(${draftExpenses.length})` : ""}
              </button>
            </>
          )}
          {step === "done" && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-black text-white py-3 px-4 rounded-full font-medium hover:opacity-80 transition-opacity cursor-pointer"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

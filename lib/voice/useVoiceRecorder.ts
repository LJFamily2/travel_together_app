"use client";

import { useCallback, useRef, useState } from "react";

export type VoiceRecorderStatus =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "processing"
  | "error";

interface UseVoiceRecorderResult {
  status: VoiceRecorderStatus;
  /** Seconds elapsed in the current recording (updates ~every 200ms). */
  elapsedSeconds: number;
  errorMessage: string | null;
  /** Call on press/touchstart of the mic button. */
  startRecording: () => Promise<void>;
  /**
   * Call on release/touchend of the mic button.
   * Resolves with the recorded audio as a base64 string + mime format,
   * or null if the recording was too short / empty to bother sending.
   */
  stopRecording: () => Promise<{ audioBase64: string; format: string } | null>;
  /** Call to abandon a recording without processing it (e.g. cancel button). */
  cancelRecording: () => void;
}

const MIN_RECORDING_MS = 400;

/**
 * Picks the best supported mime type for MediaRecorder across browsers.
 * Chrome/Android generally support webm/opus; Safari/iOS support mp4/aac.
 */
function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

function mimeToFormat(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip the "data:audio/webm;base64," prefix - OpenRouter wants raw base64.
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function useVoiceRecorder(): UseVoiceRecorderResult {
  const [status, setStatus] = useState<VoiceRecorderStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupStream = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    setStatus("requesting-permission");
    chunksRef.current = [];

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setStatus("error");
      setErrorMessage("Voice recording isn't supported on this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const mime = pickMimeType();
      mimeTypeRef.current = mime;

      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(250); // collect chunks every 250ms
      startTimeRef.current = Date.now();
      setElapsedSeconds(0);
      setStatus("recording");

      timerRef.current = setInterval(() => {
        setElapsedSeconds((Date.now() - startTimeRef.current) / 1000);
      }, 200);
    } catch (err) {
      cleanupStream();
      setStatus("error");
      setErrorMessage(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone permission was denied. Please allow mic access to use voice entry."
          : "Couldn't access the microphone. Please check your device settings.",
      );
    }
  }, [cleanupStream]);

  const stopRecording = useCallback((): Promise<{
    audioBase64: string;
    format: string;
  } | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      const durationMs = Date.now() - startTimeRef.current;

      if (!recorder || recorder.state === "inactive") {
        cleanupStream();
        setStatus("idle");
        resolve(null);
        return;
      }

      recorder.onstop = async () => {
        cleanupStream();

        if (durationMs < MIN_RECORDING_MS || chunksRef.current.length === 0) {
          setStatus("idle");
          resolve(null);
          return;
        }

        setStatus("processing");
        try {
          const blob = new Blob(chunksRef.current, {
            type: mimeTypeRef.current || "audio/webm",
          });
          const base64 = await blobToBase64(blob);
          resolve({
            audioBase64: base64,
            format: mimeToFormat(mimeTypeRef.current),
          });
        } catch {
          setStatus("error");
          setErrorMessage("Failed to process the recording.");
          resolve(null);
        }
      };

      recorder.stop();
    });
  }, [cleanupStream]);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    cleanupStream();
    setStatus("idle");
    setElapsedSeconds(0);
  }, [cleanupStream]);

  return {
    status,
    elapsedSeconds,
    errorMessage,
    startRecording,
    stopRecording,
    cancelRecording,
  };
  }

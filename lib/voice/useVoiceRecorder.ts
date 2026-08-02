"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  /**
   * Proactively requests mic permission and keeps the stream open for
   * reuse, without starting a recording. Call this as soon as the voice UI
   * opens (e.g. on mount) so the permission prompt - and any user
   * interaction it requires - happens before the user's first
   * press-and-hold gesture, instead of racing with it.
   */
  requestPermission: () => Promise<void>;
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
  /**
   * Fully releases the microphone (stops hardware tracks). Call when the
   * voice UI closes/unmounts for good - not between individual takes, since
   * the stream is intentionally kept alive across multiple recordings once
   * granted (avoids re-prompting / re-acquiring the device each time).
   */
  releaseStream: () => void;
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

function isMicNotSupportedError(): boolean {
  return (
    typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia
  );
}

function permissionDeniedMessage(err: unknown): string {
  return err instanceof Error && err.name === "NotAllowedError"
    ? "Microphone permission was denied. Please allow mic access to use voice entry."
    : "Couldn't access the microphone. Please check your device settings.";
}

async function acquireStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
    },
  });
}

function streamIsLive(stream: MediaStream | null): boolean {
  return !!stream && stream.getTracks().some((t) => t.readyState === "live");
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
  // Guards against overlapping requestPermission() calls (e.g. StrictMode
  // double-invoking effects, or the consumer calling it more than once).
  const permissionRequestRef = useRef<Promise<void> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Releases the mic hardware entirely. Safe to call multiple times. */
  const releaseStream = useCallback(() => {
    stopTimer();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }, [stopTimer]);

  const requestPermission = useCallback(async () => {
    if (streamIsLive(streamRef.current)) return; // already have a live stream
    if (permissionRequestRef.current) return permissionRequestRef.current; // already in flight

    if (isMicNotSupportedError()) {
      setStatus("error");
      setErrorMessage("Voice recording isn't supported on this browser.");
      return;
    }

    setErrorMessage(null);
    setStatus("requesting-permission");

    const promise = (async () => {
      try {
        const stream = await acquireStream();
        streamRef.current = stream;
        setStatus("idle");
      } catch (err) {
        setStatus("error");
        setErrorMessage(permissionDeniedMessage(err));
      } finally {
        permissionRequestRef.current = null;
      }
    })();

    permissionRequestRef.current = promise;
    return promise;
  }, []);

  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    chunksRef.current = [];

    // Reuse the stream from an earlier requestPermission()/recording if
    // it's still live - this is what lets the very first press-and-hold
    // start recording instantly instead of racing the permission prompt,
    // and avoids re-acquiring the mic between multiple takes in one session.
    let stream = streamRef.current;
    if (!streamIsLive(stream)) {
      if (isMicNotSupportedError()) {
        setStatus("error");
        setErrorMessage("Voice recording isn't supported on this browser.");
        return;
      }
      setStatus("requesting-permission");
      try {
        stream = await acquireStream();
        streamRef.current = stream;
      } catch (err) {
        releaseStream();
        setStatus("error");
        setErrorMessage(permissionDeniedMessage(err));
        return;
      }
    }

    if (!stream) {
      // Shouldn't happen (the block above either has a live stream or
      // returns early), but keeps TypeScript's narrowing honest and gives
      // a safe fallback instead of ever calling `new MediaRecorder(null)`.
      setStatus("error");
      setErrorMessage("Couldn't access the microphone. Please try again.");
      return;
    }

    try {
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
    } catch {
      releaseStream();
      setStatus("error");
      setErrorMessage("Couldn't start recording. Please try again.");
    }
  }, [releaseStream]);

  const stopRecording = useCallback((): Promise<{
    audioBase64: string;
    format: string;
  } | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      const durationMs = Date.now() - startTimeRef.current;

      if (!recorder || recorder.state === "inactive") {
        stopTimer();
        setStatus("idle");
        resolve(null);
        return;
      }

      recorder.onstop = async () => {
        // Only stop the timer/recorder handle here - deliberately do NOT
        // release the underlying MediaStream, so the mic stays "warm" for
        // the next take (e.g. another expense, or a clarification answer)
        // without prompting/re-acquiring again. releaseStream() is called
        // separately when the voice UI actually closes.
        stopTimer();
        mediaRecorderRef.current = null;

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
  }, [stopTimer]);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    stopTimer();
    mediaRecorderRef.current = null;
    setStatus("idle");
    setElapsedSeconds(0);
  }, [stopTimer]);

  // Safety net: release the mic if the component unmounts while a stream is
  // still open (e.g. user closes the modal without an explicit releaseStream
  // call somewhere).
  useEffect(() => {
    return () => {
      releaseStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    elapsedSeconds,
    errorMessage,
    requestPermission,
    startRecording,
    stopRecording,
    cancelRecording,
    releaseStream,
  };
}

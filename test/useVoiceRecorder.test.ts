/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { useVoiceRecorder } from "../lib/voice/useVoiceRecorder";

class FakeTrack {
  readyState: "live" | "ended" = "live";
  stop = jest.fn(() => {
    this.readyState = "ended";
  });
}

class FakeMediaStream {
  private tracks: FakeTrack[];
  constructor() {
    this.tracks = [new FakeTrack()];
  }
  getTracks() {
    return this.tracks;
  }
}

class FakeMediaRecorder {
  static isTypeSupported = jest.fn((type: string) => type === "audio/webm;codecs=opus");
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob; size: number }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: unknown, public opts?: unknown) {}
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x"]), size: 1 });
    this.onstop?.();
  }
}

let mockGetUserMedia: jest.Mock;

beforeEach(() => {
  mockGetUserMedia = jest.fn(async () => new FakeMediaStream());
  Object.defineProperty(global.navigator, "mediaDevices", {
    value: { getUserMedia: mockGetUserMedia },
    configurable: true,
  });
  // @ts-expect-error - test double, not a full MediaRecorder implementation
  global.MediaRecorder = FakeMediaRecorder;
});

describe("useVoiceRecorder - permission pre-request (Fix #1)", () => {
  test("requestPermission() acquires the mic without starting a recording", async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("idle");
  });

  test("startRecording() after requestPermission() reuses the stream (no second getUserMedia call)", async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.requestPermission();
    });
    expect(mockGetUserMedia).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.startRecording();
    });

    expect(mockGetUserMedia).toHaveBeenCalledTimes(1); // still just one call
    expect(result.current.status).toBe("recording");
  });

  test("startRecording() without a prior requestPermission() still works (falls back to requesting on press)", async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("recording");
  });

  test("multiple takes in one session only acquire the mic once", async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.requestPermission();
    });

    await act(async () => {
      await result.current.startRecording();
    });
    await act(async () => {
      await result.current.stopRecording();
    });

    await act(async () => {
      await result.current.startRecording();
    });
    await act(async () => {
      await result.current.stopRecording();
    });

    expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
  });

  test("permission denial surfaces an error status/message without any recording attempt", async () => {
    mockGetUserMedia.mockRejectedValue(
      Object.assign(new Error("denied"), { name: "NotAllowedError" }),
    );
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toMatch(/permission was denied/i);
  });

  test("releaseStream() stops the underlying tracks", async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    let acquiredStream: FakeMediaStream | null = null;
    mockGetUserMedia.mockImplementation(async () => {
      acquiredStream = new FakeMediaStream();
      return acquiredStream;
    });

    await act(async () => {
      await result.current.requestPermission();
    });

    act(() => {
      result.current.releaseStream();
    });

    const tracks = acquiredStream!.getTracks();
    expect(tracks[0].stop).toHaveBeenCalled();
  });

  test("a second requestPermission() call while one is already granted does not re-prompt", async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.requestPermission();
    });
    await act(async () => {
      await result.current.requestPermission();
    });

    expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
  });
});

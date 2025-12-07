"use client";

import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import QRCodeStyling from "qr-code-styling";

type StyledQRCodeProps = {
  value: string;
  size?: number;
  className?: string;
  onDownload?: (blob: Blob | Buffer) => void;
};

export default function StyledQRCode({
  value,
  size = 300,
  className,
  onDownload,
}: StyledQRCodeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const qrRef = useRef<InstanceType<typeof QRCodeStyling> | null>(null);

  const baseConfig: Partial<import("qr-code-styling").Options> = {
    type: "canvas",
    shape: "square",
    width: size,
    height: size,
    data: value,
    margin: 0,
    qrOptions: {
      typeNumber: 6,
      mode: "Byte",
      errorCorrectionLevel: "M",
    },
    image: undefined,
    imageOptions: {
      saveAsBlob: true,
      hideBackgroundDots: false,
      imageSize: 0.4,
      margin: 0,
      crossOrigin: "anonymous",
    },
    dotsOptions: {
      type: "rounded",
      color: "#000000",
    },
    cornersSquareOptions: {
      type: "square",
      color: "#000000",
    },
    cornersDotOptions: {
      // omit type to use default
      color: "#000000",
    },
    backgroundOptions: {
      round: 0,
      color: "#ffffff",
    },
  };

  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;

    const config = { ...baseConfig, width: size, height: size, data: value };
    qrRef.current = new QRCodeStyling(config);
    qrRef.current.append(containerEl);

    return () => {
      // remove anything appended by the library from the container
      if (containerEl) containerEl.innerHTML = "";
      qrRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!qrRef.current) return;
    qrRef.current.update({ data: value });
  }, [value]);

  const download = async (format: "png" | "jpeg" = "png") => {
    // Prevent unsupported formats (e.g., svg) from being downloaded
    if (!["png", "jpeg"].includes(format)) {
      console.warn(`Unsupported download format: ${format}`);
      return;
    }
    try {
      qrRef.current?.download({ extension: format });
      if (onDownload && qrRef.current?.getRawData) {
        try {
          const blob = await qrRef.current.getRawData(format);
          if (blob) onDownload(blob);
        } catch {
          // ignore blob retrieval errors but still trigger download
        }
      }
    } catch (err) {
      console.error("Failed to download QR", err);
    }
  };

  return (
    <div className={className}>
      <div ref={containerRef} role="img" aria-label="QR code to join journey" />
      <div className="flex gap-2 justify-center items-center mt-3">
        <button
          className="bg-gray-100 text-gray-800 px-3 py-1 rounded-md text-xs hover:bg-gray-200 cursor-pointer"
          onClick={() => {
            navigator.clipboard?.writeText(value);
            toast.success("Join link copied to clipboard");
          }}
          title="Copy join link"
          aria-label="Copy join link"
        >
          Copy link
        </button>

        <button
          className="bg-blue-600 text-white px-3 py-1 rounded-md text-xs hover:bg-blue-700 flex items-center cursor-pointer"
          onClick={() => download("png")}
          title="Download PNG"
          aria-label="Download PNG"
        >
          {/* Inline download icon + label to match requested UI change */}
          <svg
            className="w-3 h-3 mr-2"
            aria-hidden
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Download PNG</span>
        </button>
        {/* Download SVG option removed to avoid large token overflow in QR codes */}
      </div>
    </div>
  );
}

"use client";

import ReactWorldFlag from "react-world-flags";

interface CurrencyFlagProps {
  /** ISO 3166-1 alpha-2 country code, e.g. "VN", "TH", "US" */
  countryCode: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  xs: { width: 16, height: 12 },
  sm: { width: 20, height: 15 },
  md: { width: 28, height: 21 },
  lg: { width: 36, height: 27 },
};

export default function CurrencyFlag({
  countryCode,
  size = "sm",
  className = "",
}: CurrencyFlagProps) {
  const { width, height } = sizeMap[size];

  // Special handling for EUR which has no single country
  if (countryCode === "EU") {
    return (
      <span
        style={{ width, height, fontSize: height * 0.9, lineHeight: 1 }}
        className={`inline-flex items-center justify-center ${className}`}
      >
        🇪🇺
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden rounded-sm ${className}`}
      style={{ width, height, flexShrink: 0 }}
    >
      <ReactWorldFlag
        code={countryCode}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        fallback={
          <span style={{ fontSize: height * 0.7, lineHeight: 1 }}>🏳️</span>
        }
      />
    </span>
  );
}

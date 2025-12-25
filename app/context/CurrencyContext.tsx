"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

type CurrencyFormat = "US" | "EU";

interface CurrencyContextType {
  formatPreference: CurrencyFormat;
  setFormatPreference: (format: CurrencyFormat) => void;
  formatCurrency: (value: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(
  undefined
);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [formatPreference, setFormatPreference] =
    useState<CurrencyFormat>("US");

  useEffect(() => {
    const stored = localStorage.getItem("currencyFormat");
    if (stored === "US" || stored === "EU") {
      setFormatPreference(stored);
    }
  }, []);

  const updatePreference = (format: CurrencyFormat) => {
    setFormatPreference(format);
    localStorage.setItem("currencyFormat", format);
  };

  const formatCurrency = (value: number) => {
    const isInteger = value % 1 === 0;
    const options: Intl.NumberFormatOptions = {
      minimumFractionDigits: isInteger ? 0 : 2,
      maximumFractionDigits: 2,
    };

    if (formatPreference === "US") {
      return value.toLocaleString("en-US", options);
    } else {
      return value.toLocaleString("de-DE", options);
    }
  };

  return (
    <CurrencyContext.Provider
      value={{
        formatPreference,
        setFormatPreference: updatePreference,
        formatCurrency,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}

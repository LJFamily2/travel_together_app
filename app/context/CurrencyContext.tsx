"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

type CurrencyFormat = "US" | "EU";

export interface JourneyCurrencyConfig {
  code: string;
  name: string;
  symbol: string;
  countryCode: string;
  exchangeRate: number; // How many of this currency = 1 base unit
}

export interface JourneyBaseCurrency {
  code: string;
  name: string;
  symbol: string;
  countryCode: string;
}

interface CurrencyContextType {
  // Number format preference
  formatPreference: CurrencyFormat;
  setFormatPreference: (format: CurrencyFormat) => void;
  formatCurrency: (value: number) => string;
  // Journey currencies (set by the journey page)
  baseCurrency: JourneyBaseCurrency | null;
  journeyCurrencies: JourneyCurrencyConfig[];
  setJourneyCurrencyData: (
    base: JourneyBaseCurrency | null,
    currencies: JourneyCurrencyConfig[]
  ) => void;
  /** Convert an amount in a given currency to the base currency */
  convertToBase: (amount: number, currencyCode?: string | null) => number;
  /** Format a number using current locale preference, with optional currency symbol prefix */
  formatAmount: (amount: number, currencyCode?: string | null) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(
  undefined
);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [formatPreference, setFormatPreference] = useState<CurrencyFormat>(
    () => {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("currencyFormat");
        if (stored === "US" || stored === "EU") {
          return stored;
        }
      }
      return "US";
    }
  );

  const [baseCurrency, setBaseCurrency] =
    useState<JourneyBaseCurrency | null>(null);
  const [journeyCurrencies, setJourneyCurrencies] = useState<
    JourneyCurrencyConfig[]
  >([]);

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

  const setJourneyCurrencyData = (
    base: JourneyBaseCurrency | null,
    currencies: JourneyCurrencyConfig[]
  ) => {
    setBaseCurrency(base);
    setJourneyCurrencies(currencies);
  };

  /**
   * Convert an amount from a specific currency to the base currency.
   * If no currency code given (or matches base), returns the amount unchanged.
   * exchangeRate = how many of that currency = 1 base unit
   * => base = amount / exchangeRate
   */
  const convertToBase = (
    amount: number,
    currencyCode?: string | null
  ): number => {
    if (!currencyCode || !baseCurrency) return amount;
    if (currencyCode === baseCurrency.code) return amount;
    const config = journeyCurrencies.find((c) => c.code === currencyCode);
    if (!config || config.exchangeRate === 0) return amount;
    return amount / config.exchangeRate;
  };

  /**
   * Format an amount, showing the currency symbol if available.
   * If currencyCode is provided and differs from base, converts then shows base symbol.
   */
  const formatAmount = (
    amount: number,
    currencyCode?: string | null
  ): string => {
    let symbol = baseCurrency?.symbol ?? "";
    if (currencyCode && baseCurrency && currencyCode !== baseCurrency.code) {
      const config = journeyCurrencies.find((c) => c.code === currencyCode);
      if (config) {
        symbol = config.symbol;
      }
    }
    return `${symbol}${formatCurrency(amount)}`;
  };

  return (
    <CurrencyContext.Provider
      value={{
        formatPreference,
        setFormatPreference: updatePreference,
        formatCurrency,
        baseCurrency,
        journeyCurrencies,
        setJourneyCurrencyData,
        convertToBase,
        formatAmount,
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

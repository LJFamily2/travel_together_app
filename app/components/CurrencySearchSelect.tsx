"use client";

import { useState, useRef, useEffect } from "react";
import CurrencyFlag from "./CurrencyFlag";
import { CURRENCIES, CurrencyInfo } from "./CurrencyData";

interface CurrencySearchSelectProps {
  /** Currently selected currency code, e.g. "VND" */
  value: string;
  onChange: (currency: CurrencyInfo) => void;
  /** List of currency codes to exclude (already added) */
  excludeCodes?: string[];
  placeholder?: string;
  /** Compact single-line trigger button (used next to Amount field) */
  compact?: boolean;
  label?: string;
  disabled?: boolean;
}

export default function CurrencySearchSelect({
  value,
  onChange,
  excludeCodes = [],
  placeholder = "Select currency",
  compact = false,
  label,
  disabled = false,
}: CurrencySearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropdownDirection, setDropdownDirection] = useState<"down" | "up">("down");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = CURRENCIES.find((c) => c.code === value);

  const filtered = CURRENCIES.filter((c) => {
    if (excludeCodes.includes(c.code)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.symbol.includes(search)
    );
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Determine direction based on viewport space when opened
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // Dropdown height max is 52 (208px) + search box (~50px) + margins = ~270px
      if (spaceBelow < 280) {
        setDropdownDirection("up");
      } else {
        setDropdownDirection("down");
      }
    }
  }, [isOpen]);

  // Focus search when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSelect = (currency: CurrencyInfo) => {
    onChange(currency);
    setIsOpen(false);
    setSearch("");
  };

  const trigger = compact ? (
    // Compact inline trigger for next to Amount field
    <button
      type="button"
      disabled={disabled}
      onClick={() => setIsOpen(!isOpen)}
      className={`flex items-center gap-1.5 px-2.5 py-2 border border-gray-200 rounded-xl bg-gray-50 hover:bg-white transition-colors cursor-pointer text-sm font-medium text-gray-700 whitespace-nowrap min-w-[80px] ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {selected ? (
        <>
          <CurrencyFlag countryCode={selected.countryCode} size="xs" />
          <span>{selected.code}</span>
        </>
      ) : (
        <span className="text-gray-400">{placeholder}</span>
      )}
      <svg
        className={`w-3 h-3 text-gray-400 transition-transform ml-auto ${isOpen ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  ) : (
    // Full-width trigger for modals
    <button
      type="button"
      disabled={disabled}
      onClick={() => setIsOpen(!isOpen)}
      className={`w-full flex items-center justify-between gap-2 p-3 border border-gray-200 rounded-xl bg-gray-50 hover:bg-white transition-colors cursor-pointer text-left ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span className="flex items-center gap-2 min-w-0">
        {selected ? (
          <>
            <CurrencyFlag countryCode={selected.countryCode} size="sm" />
            <span className="font-medium text-gray-900 text-sm">{selected.code}</span>
            <span className="text-gray-500 text-sm truncate">{selected.name}</span>
          </>
        ) : (
          <span className="text-gray-400 text-sm">{placeholder}</span>
        )}
      </span>
      <svg
        className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      {trigger}

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => { setIsOpen(false); setSearch(""); }} />
          {/* Dropdown */}
          <div className={`absolute z-50 w-full min-w-[220px] bg-white border border-gray-200 rounded-xl shadow-2xl ring-1 ring-black/5 overflow-hidden flex flex-col ${
            dropdownDirection === "up" ? "bottom-full mb-1" : "top-full mt-1"
          }`}>
            {/* Search box */}
            <div className="p-2 border-b border-gray-100 bg-gray-50/50">
              <div className="relative">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search currency..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all"
                />
              </div>
            </div>

            {/* Options list */}
            <div className="max-h-52 overflow-y-auto custom-scrollbar py-1">
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400 text-center">
                  No currencies found
                </div>
              ) : (
                filtered.map((currency) => (
                  <button
                    key={currency.code}
                    type="button"
                    onClick={() => handleSelect(currency)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 transition-colors cursor-pointer text-left ${value === currency.code ? "bg-blue-50 text-blue-700" : "text-gray-700"}`}
                  >
                    <CurrencyFlag countryCode={currency.countryCode} size="sm" />
                    <span className="font-medium w-10 flex-shrink-0">{currency.code}</span>
                    <span className="text-gray-500 truncate">{currency.name}</span>
                    <span className="text-gray-400 ml-auto flex-shrink-0">{currency.symbol}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

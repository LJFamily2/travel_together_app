"use client";

import { useState } from "react";
import { useCurrency, JourneyCurrencyConfig, JourneyBaseCurrency } from "../context/CurrencyContext";
import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { getCurrencyByCode } from "./CurrencyData";
import CurrencyFlag from "./CurrencyFlag";
import CurrencySearchSelect from "./CurrencySearchSelect";
import toast from "react-hot-toast";

const UPDATE_JOURNEY_CURRENCIES = gql`
  mutation UpdateJourneyCurrencies(
    $journeyId: ID!
    $baseCurrency: BaseCurrencyInput
    $currencies: [CurrencyConfigInput]!
  ) {
    updateJourneyCurrencies(
      journeyId: $journeyId
      baseCurrency: $baseCurrency
      currencies: $currencies
    ) {
      id
      baseCurrency {
        code
        name
        symbol
        countryCode
      }
      currencies {
        code
        name
        symbol
        countryCode
        exchangeRate
      }
    }
  }
`;

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  journeyId?: string;
  isLeader?: boolean;
  initialBaseCurrency?: JourneyBaseCurrency | null;
  initialCurrencies?: JourneyCurrencyConfig[];
  onCurrenciesUpdated?: (
    base: JourneyBaseCurrency | null,
    currencies: JourneyCurrencyConfig[]
  ) => void;
}

export default function UserSettingsModal({
  isOpen,
  onClose,
  journeyId,
  isLeader = false,
  initialBaseCurrency,
  initialCurrencies = [],
  onCurrenciesUpdated,
}: UserSettingsModalProps) {
  const { formatPreference, setFormatPreference } = useCurrency();

  // Local currency state for editing
  const [baseCurrency, setBaseCurrency] = useState<JourneyBaseCurrency | null>(
    initialBaseCurrency ?? null
  );
  const [currencies, setCurrencies] = useState<JourneyCurrencyConfig[]>(
    initialCurrencies ?? []
  );
  // State for the "add currency" row
  const [addingCode, setAddingCode] = useState("");
  const [addingRate, setAddingRate] = useState("");
  const [showAddRow, setShowAddRow] = useState(false);

  const [updateCurrencies, { loading: savingCurrencies }] = useMutation(
    UPDATE_JOURNEY_CURRENCIES
  );

  if (!isOpen) return null;

  // Re-sync local state when modal re-opens
  const syncedBase = initialBaseCurrency ?? null;

  const handleAddCurrency = () => {
    if (!addingCode) {
      toast.error("Please select a currency.");
      return;
    }
    const rate = parseFloat(addingRate);
    if (isNaN(rate) || rate <= 0) {
      toast.error("Please enter a valid exchange rate greater than 0.");
      return;
    }
    const info = getCurrencyByCode(addingCode);
    if (!info) return;

    if (currencies.some((c) => c.code === addingCode)) {
      toast.error("Currency already added.");
      return;
    }

    setCurrencies((prev) => [
      ...prev,
      { ...info, exchangeRate: rate },
    ]);
    setAddingCode("");
    setAddingRate("");
    setShowAddRow(false);
  };

  const handleRemoveCurrency = (code: string) => {
    setCurrencies((prev) => prev.filter((c) => c.code !== code));
  };

  const handleUpdateRate = (code: string, rate: string) => {
    setCurrencies((prev) =>
      prev.map((c) =>
        c.code === code ? { ...c, exchangeRate: parseFloat(rate) || 0 } : c
      )
    );
  };

  const handleSaveCurrencies = async () => {
    if (!journeyId) return;
    // Validate rates
    const hasInvalidRate = currencies.some(
      (c) => isNaN(c.exchangeRate) || c.exchangeRate <= 0
    );
    if (hasInvalidRate) {
      toast.error("All exchange rates must be greater than 0.");
      return;
    }
    try {
      const result = await updateCurrencies({
        variables: {
          journeyId,
          baseCurrency: baseCurrency
            ? {
                code: baseCurrency.code,
                name: baseCurrency.name,
                symbol: baseCurrency.symbol,
                countryCode: baseCurrency.countryCode,
              }
            : null,
          currencies: currencies.map((c) => ({
            code: c.code,
            name: c.name,
            symbol: c.symbol,
            countryCode: c.countryCode,
            exchangeRate: c.exchangeRate,
          })),
        },
      });
      const updated = (result?.data as any)?.updateJourneyCurrencies;
      if (updated) {
        onCurrenciesUpdated?.(
          updated.baseCurrency ?? null,
          updated.currencies ?? []
        );
      }
      toast.success("Currency settings saved!");
      onClose();
    } catch (err) {
      toast.error("Failed to save: " + (err as Error).message);
    }
  };

  const existingCodes = currencies.map((c) => c.code);
  if (baseCurrency) existingCodes.push(baseCurrency.code);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900">Preferences</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">

          {/* Number Format */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Number Format</h3>
            <div className="grid grid-cols-1 gap-3">
              <label className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${formatPreference === "US" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${formatPreference === "US" ? "border-blue-500" : "border-gray-300"}`}>
                    {formatPreference === "US" && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                  </div>
                  <span className="font-medium text-gray-900">10,000.00</span>
                </div>
                <input type="radio" name="format" value="US" checked={formatPreference === "US"} onChange={() => setFormatPreference("US")} className="hidden" />
              </label>
              <label className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${formatPreference === "EU" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${formatPreference === "EU" ? "border-blue-500" : "border-gray-300"}`}>
                    {formatPreference === "EU" && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                  </div>
                  <span className="font-medium text-gray-900">10.000,00</span>
                </div>
                <input type="radio" name="format" value="EU" checked={formatPreference === "EU"} onChange={() => setFormatPreference("EU")} className="hidden" />
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-2">Choose how numbers are displayed.</p>
          </div>

          {/* Currency Section — leader only */}
          {isLeader && journeyId && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Journey Currencies</h3>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Leader only</span>
              </div>

              {/* Base Currency */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Base Currency <span className="text-gray-400">(your home currency)</span>
                </label>
                <CurrencySearchSelect
                  value={baseCurrency?.code ?? ""}
                  onChange={(c) => setBaseCurrency({ code: c.code, name: c.name, symbol: c.symbol, countryCode: c.countryCode })}
                  excludeCodes={currencies.map((c) => c.code)}
                  placeholder="Pick base currency..."
                />
              </div>

              {/* Added currencies list */}
              {currencies.length > 0 && (
                <div className="mb-3 space-y-2">
                  <p className="text-xs text-gray-500">
                    Exchange rates: 1 {baseCurrency?.code ?? "base"} = X foreign currency
                  </p>
                  {currencies.map((c) => (
                    <div key={c.code} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                      <CurrencyFlag countryCode={c.countryCode} size="sm" />
                      <span className="font-semibold text-sm w-10 flex-shrink-0 text-gray-800">{c.code}</span>
                      <span className="text-gray-500 text-xs flex-1 truncate">{c.name}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs text-gray-400">1 {baseCurrency?.code ?? "base"} =</span>
                        <input
                          type="number"
                          value={c.exchangeRate === 0 ? "" : c.exchangeRate}
                          onChange={(e) => handleUpdateRate(c.code, e.target.value)}
                          step="any"
                          min="0"
                          placeholder="rate"
                          className="w-20 text-right text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-400"
                        />
                        <span className="text-xs text-gray-500">{c.code}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveCurrency(c.code)}
                        className="text-gray-300 hover:text-red-400 transition-colors cursor-pointer p-1 flex-shrink-0"
                        title="Remove currency"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add currency row */}
              {showAddRow ? (
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 space-y-2">
                  <CurrencySearchSelect
                    value={addingCode}
                    onChange={(c) => setAddingCode(c.code)}
                    excludeCodes={existingCodes}
                    placeholder="Select currency to add..."
                  />
                  {addingCode && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 flex-shrink-0">
                        1 {baseCurrency?.code ?? "base"} =
                      </span>
                      <input
                        type="number"
                        value={addingRate}
                        onChange={(e) => setAddingRate(e.target.value)}
                        placeholder="Exchange rate"
                        step="any"
                        min="0"
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
                      />
                      <span className="text-xs text-gray-600 flex-shrink-0">{addingCode}</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddCurrency}
                      className="flex-1 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors cursor-pointer font-medium"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAddRow(false); setAddingCode(""); setAddingRate(""); }}
                      className="flex-1 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddRow(true)}
                  disabled={!baseCurrency}
                  className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Currency
                </button>
              )}
              {!baseCurrency && (
                <p className="text-xs text-amber-600 mt-1.5">
                  ⚠ Set a base currency first before adding others.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-3 flex-shrink-0">
          <div />
          <div className="flex gap-3">
            {isLeader && journeyId && (
              <button
                onClick={handleSaveCurrencies}
                disabled={savingCurrencies}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 transition-colors shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {savingCurrencies ? "Saving..." : "Save Currencies"}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-gray-900 text-white rounded-full font-medium hover:bg-gray-800 transition-colors shadow-sm cursor-pointer text-sm"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

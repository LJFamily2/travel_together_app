"use client";

import { useCurrency } from "../context/CurrencyContext";

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserSettingsModal({
  isOpen,
  onClose,
}: UserSettingsModalProps) {
  const { formatPreference, setFormatPreference } = useCurrency();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">User Preferences</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Number Format
            </h3>
            <div className="grid grid-cols-1 gap-3">
              <label
                className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  formatPreference === "US"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      formatPreference === "US"
                        ? "border-blue-500"
                        : "border-gray-300"
                    }`}
                  >
                    {formatPreference === "US" && (
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <span className="font-medium text-gray-900">10,000.00</span>
                </div>
                <input
                  type="radio"
                  name="format"
                  value="US"
                  checked={formatPreference === "US"}
                  onChange={() => setFormatPreference("US")}
                  className="hidden"
                />
              </label>

              <label
                className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  formatPreference === "EU"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      formatPreference === "EU"
                        ? "border-blue-500"
                        : "border-gray-300"
                    }`}
                  >
                    {formatPreference === "EU" && (
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <span className="font-medium text-gray-900">10.000,00</span>
                </div>
                <input
                  type="radio"
                  name="format"
                  value="EU"
                  checked={formatPreference === "EU"}
                  onChange={() => setFormatPreference("EU")}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Choose how you want numbers and currency to be displayed.
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-900 text-white rounded-full font-medium hover:bg-gray-800 transition-colors shadow-sm cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// Master list of the most commonly used travel currencies
// with ISO codes, symbols, country codes for flag rendering

export interface CurrencyInfo {
  code: string;       // ISO 4217, e.g. "THB"
  name: string;       // e.g. "Thai Baht"
  symbol: string;     // e.g. "฿"
  countryCode: string; // ISO 3166-1 alpha-2 for flag lookup, e.g. "TH"
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: "USD", name: "US Dollar",          symbol: "$",    countryCode: "US" },
  { code: "EUR", name: "Euro",               symbol: "€",    countryCode: "EU" },
  { code: "GBP", name: "British Pound",      symbol: "£",    countryCode: "GB" },
  { code: "JPY", name: "Japanese Yen",       symbol: "¥",    countryCode: "JP" },
  { code: "KRW", name: "South Korean Won",   symbol: "₩",    countryCode: "KR" },
  { code: "CNY", name: "Chinese Yuan",       symbol: "¥",    countryCode: "CN" },
  { code: "THB", name: "Thai Baht",          symbol: "฿",    countryCode: "TH" },
  { code: "VND", name: "Vietnamese Dong",    symbol: "₫",    countryCode: "VN" },
  { code: "SGD", name: "Singapore Dollar",   symbol: "S$",   countryCode: "SG" },
  { code: "MYR", name: "Malaysian Ringgit",  symbol: "RM",   countryCode: "MY" },
  { code: "IDR", name: "Indonesian Rupiah",  symbol: "Rp",   countryCode: "ID" },
  { code: "PHP", name: "Philippine Peso",    symbol: "₱",    countryCode: "PH" },
  { code: "HKD", name: "Hong Kong Dollar",   symbol: "HK$",  countryCode: "HK" },
  { code: "TWD", name: "Taiwan Dollar",      symbol: "NT$",  countryCode: "TW" },
  { code: "AUD", name: "Australian Dollar",  symbol: "A$",   countryCode: "AU" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$",  countryCode: "NZ" },
  { code: "CAD", name: "Canadian Dollar",    symbol: "C$",   countryCode: "CA" },
  { code: "CHF", name: "Swiss Franc",        symbol: "Fr",   countryCode: "CH" },
  { code: "INR", name: "Indian Rupee",       symbol: "₹",    countryCode: "IN" },
  { code: "SAR", name: "Saudi Riyal",        symbol: "﷼",    countryCode: "SA" },
  { code: "AED", name: "UAE Dirham",         symbol: "د.إ",  countryCode: "AE" },
  { code: "KHR", name: "Cambodian Riel",     symbol: "៛",    countryCode: "KH" },
  { code: "LAK", name: "Lao Kip",            symbol: "₭",    countryCode: "LA" },
  { code: "MMK", name: "Myanmar Kyat",       symbol: "K",    countryCode: "MM" },
  { code: "BND", name: "Brunei Dollar",      symbol: "B$",   countryCode: "BN" },
  { code: "MXN", name: "Mexican Peso",       symbol: "$",    countryCode: "MX" },
  { code: "BRL", name: "Brazilian Real",     symbol: "R$",   countryCode: "BR" },
  { code: "ZAR", name: "South African Rand", symbol: "R",    countryCode: "ZA" },
  { code: "TRY", name: "Turkish Lira",       symbol: "₺",    countryCode: "TR" },
  { code: "NOK", name: "Norwegian Krone",    symbol: "kr",   countryCode: "NO" },
  { code: "SEK", name: "Swedish Krona",      symbol: "kr",   countryCode: "SE" },
  { code: "DKK", name: "Danish Krone",       symbol: "kr",   countryCode: "DK" },
];

/** Find currency info by code */
export function getCurrencyByCode(code: string): CurrencyInfo | undefined {
  return CURRENCIES.find((c) => c.code === code);
}

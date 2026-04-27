import React, { useState, useRef, useEffect } from "react";

interface TailwindDatePickerProps {
  value: string; // format "YYYY-MM-DD"
  onChange: (val: string) => void;
  label: string;
}

export default function TailwindDatePicker({
  value,
  onChange,
  label,
}: TailwindDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Parse initial value or use today
  const initialDate = value ? new Date(value) : new Date();
  const [viewDate, setViewDate] = useState(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Month names
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Days of week
  const daysOfWeek = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  // Get days in month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Get first day of month (0 = Sun, 6 = Sat)
  const firstDayIndex = new Date(year, month, 1).getDay();

  // Previous month days to pad
  const prevMonthDays = new Date(year, month, 0).getDate();

  const days: { day: number; current: boolean; dateStr: string }[] = [];

  // Pad previous month days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    days.push({
      day: d,
      current: false,
      dateStr: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({
      day: d,
      current: true,
      dateStr: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }

  // Pad next month days to fill 42 cells (6 weeks)
  const remainingCells = 42 - days.length;
  for (let d = 1; d <= remainingCells; d++) {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    days.push({
      day: d,
      current: false,
      dateStr: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const handleDateSelect = (dateStr: string) => {
    onChange(dateStr);
    setIsOpen(false);
  };

  // Format current value for display
  const formatDisplayDate = (val: string) => {
    if (!val) return "Select Date";
    const [y, m, d] = val.split("-");
    return `${m}/${d}/${y}`;
  };

  const isSelected = (dateStr: string) => dateStr === value;
  const isToday = (dateStr: string) => {
    const today = new Date();
    const tStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return dateStr === tStr;
  };

  return (
    <div className="relative flex flex-col text-xs font-medium text-gray-500">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="mt-1 w-full flex items-center justify-between p-3 border border-gray-200 rounded-xl bg-white text-sm text-gray-800 cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all"
      >
        <span className="truncate pr-2">{formatDisplayDate(value)}</span>
        <svg
          className="w-4 h-4 text-gray-400 ml-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute z-50 top-[100%] left-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 w-[280px] animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-gray-800">
              {monthNames[month]} {year}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 hover:bg-gray-100 rounded-full text-gray-600 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 hover:bg-gray-100 rounded-full text-gray-600 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {daysOfWeek.map((d) => (
              <span key={d} className="text-[10px] font-bold text-gray-400 uppercase">
                {d}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((cell, idx) => {
              const selected = isSelected(cell.dateStr);
              const today = isToday(cell.dateStr);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleDateSelect(cell.dateStr)}
                  className={`
                    h-8 w-8 rounded-full text-xs flex items-center justify-center transition-all cursor-pointer
                    ${!cell.current ? "text-gray-300" : "text-gray-700 font-medium"}
                    ${selected ? "bg-blue-600 text-white font-bold shadow-sm" : ""}
                    ${!selected && today ? "border border-blue-300 text-blue-600" : ""}
                    ${!selected && cell.current ? "hover:bg-gray-100" : ""}
                  `}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-2 border-t border-gray-50 flex justify-between text-[10px]">
            <button
              type="button"
              onClick={() => handleDateSelect("")}
              className="text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const t = new Date();
                handleDateSelect(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`);
              }}
              className="text-blue-500 hover:text-blue-700 font-medium cursor-pointer"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

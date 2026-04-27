import React, { useState, useRef, useEffect } from "react";

interface TailwindDateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
  isRange?: boolean;
}

export default function TailwindDateRangePicker({
  startDate,
  endDate,
  onChange,
  isRange = true,
}: TailwindDateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"start" | "end">("start");

  // For calendar view
  const initialDate = startDate ? new Date(startDate) : new Date();
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

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const daysOfWeek = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const days: { day: number; current: boolean; dateStr: string }[] = [];

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

  for (let d = 1; d <= daysInMonth; d++) {
    days.push({
      day: d,
      current: true,
      dateStr: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }

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

  const handlePrevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const handleDateSelect = (dateStr: string) => {
    if (!isRange) {
      onChange(dateStr, "");
      setIsOpen(false);
      return;
    }

    if (activeTab === "start") {
      onChange(dateStr, ""); // Reset end date if start date changes
      setActiveTab("end");
    } else {
      // end date selection
      if (startDate && dateStr < startDate) {
        onChange(dateStr, "");
        setActiveTab("end");
      } else {
        onChange(startDate, dateStr);
        setIsOpen(false);
      }
    }
  };

  const formatDisplayDate = (val: string) => {
    if (!val) return "Add Date";
    const [y, m, d] = val.split("-");
    return `${m}/${d}/${y}`;
  };

  const isStartDate = (dateStr: string) => dateStr === startDate;
  const isEndDate = (dateStr: string) => dateStr === endDate;
  const isInRange = (dateStr: string) => {
    if (!startDate || !endDate) return false;
    return dateStr > startDate && dateStr < endDate;
  };

  const isToday = (dateStr: string) => {
    const today = new Date();
    const tStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return dateStr === tStr;
  };

  return (
    <div className="relative flex flex-wrap items-end gap-2 animate-in fade-in slide-in-from-left-2 duration-150">
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen && !startDate) setActiveTab("start");
        }}
        className={`flex items-center gap-2 h-[48px] px-5 border border-gray-200 rounded-2xl bg-white shadow-sm transition-all hover:border-blue-400 hover:ring-1 hover:ring-blue-100 cursor-pointer ${
          isOpen ? "border-blue-400 ring-2 ring-blue-100" : ""
        }`}
      >
        <svg
          className="w-5 h-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span className="text-sm font-medium text-gray-700">
          {isRange ? (
            startDate || endDate ? (
              <>
                <span className={startDate ? "text-gray-900" : "text-gray-400"}>
                  {formatDisplayDate(startDate)}
                </span>
                <span className="mx-2 text-gray-300">—</span>
                <span className={endDate ? "text-gray-900" : "text-gray-400"}>
                  {formatDisplayDate(endDate)}
                </span>
              </>
            ) : (
              <span className="text-gray-500">Select dates</span>
            )
          ) : (
            <span className={startDate ? "text-gray-900" : "text-gray-500"}>
              {startDate ? formatDisplayDate(startDate) : "Select date"}
            </span>
          )}
        </span>
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute z-50 top-[115%] left-0 mt-1 bg-white rounded-3xl shadow-2xl border border-gray-100 p-6 w-[320px] animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-base font-bold text-gray-800">
              {monthNames[month]} {year}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-600 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-600 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {daysOfWeek.map((d) => (
              <span key={d} className="text-[11px] font-bold text-gray-400 uppercase">
                {d}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1 gap-x-0 relative">
            {days.map((cell, idx) => {
              const start = isStartDate(cell.dateStr);
              const end = isEndDate(cell.dateStr);
              const range = isInRange(cell.dateStr);
              const today = isToday(cell.dateStr);

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleDateSelect(cell.dateStr)}
                  className={`
                    h-9 w-9 text-xs flex items-center justify-center relative transition-all cursor-pointer
                    ${!cell.current ? "text-gray-300" : "text-gray-700 font-medium"}
                    ${start ? "bg-blue-600 text-white font-bold shadow-md z-10 rounded-full" : ""}
                    ${end ? "bg-blue-600 text-white font-bold shadow-md z-10 rounded-full" : ""}
                    ${range ? "bg-blue-50 text-blue-600" : ""}
                    ${!start && !end && !range && today ? "border border-blue-300 text-blue-600 rounded-full" : ""}
                    ${!start && !end && !range && cell.current ? "hover:bg-gray-100 rounded-full" : ""}
                  `}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                onChange("", "");
                setActiveTab("start");
              }}
              className="text-gray-400 hover:text-gray-600 font-medium cursor-pointer"
            >
              Clear dates
            </button>
            {isRange && activeTab === "end" && (
              <span className="text-blue-600 font-medium animate-pulse">
                Select end date
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
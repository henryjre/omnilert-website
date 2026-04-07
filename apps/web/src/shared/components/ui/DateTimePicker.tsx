import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function parseDateTimeValue(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toYmd(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatLabel(value: string): string {
  const parsed = parseDateTimeValue(value);
  if (!parsed) return 'Select date and time...';

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getTimeValue(value: string): string {
  const parsed = parseDateTimeValue(value);
  if (!parsed) return '00:00';
  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function buildDateTime(year: number, month: number, day: number, hours: number, minutes: number): string {
  return new Date(year, month, day, hours, minutes, 0, 0).toISOString();
}

function CalendarGrid({
  viewYear,
  viewMonth,
  selectedYmd,
  onDayClick,
}: {
  viewYear: number;
  viewMonth: number;
  selectedYmd: string;
  onDayClick: (ymd: string) => void;
}) {
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="grid grid-cols-7">
      {cells.map((day, index) => {
        if (!day) return <div key={index} className="h-8" />;

        const ymd = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
        const isSelected = ymd === selectedYmd;

        return (
          <div key={index} className="flex h-8 items-center justify-center">
            <button
              type="button"
              onClick={() => onDayClick(ymd)}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors ${
                isSelected
                  ? 'bg-primary-600 font-semibold text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {day}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function DateTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const fallbackDate = parseDateTimeValue(value) ?? new Date();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(fallbackDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(fallbackDate.getMonth());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    const selected = parseDateTimeValue(value);
    if (!selected) return;
    setViewYear(selected.getFullYear());
    setViewMonth(selected.getMonth());
  }, [value]);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((current) => current - 1);
      return;
    }

    setViewMonth((current) => current - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((current) => current + 1);
      return;
    }

    setViewMonth((current) => current + 1);
  }

  function handleDayClick(ymd: string) {
    const current = parseDateTimeValue(value) ?? new Date();
    const [year, month, day] = ymd.split('-').map(Number);
    onChange(buildDateTime(year, month - 1, day, current.getHours(), current.getMinutes()));
  }

  function handleTimeChange(nextTime: string) {
    const [hours, minutes] = nextTime.split(':').map(Number);
    const current = parseDateTimeValue(value) ?? new Date();
    onChange(
      buildDateTime(
        current.getFullYear(),
        current.getMonth(),
        current.getDate(),
        Number.isFinite(hours) ? hours : 0,
        Number.isFinite(minutes) ? minutes : 0,
      ),
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 rounded border border-primary-500 bg-primary-50 px-3 py-2 text-sm text-primary-700 transition-colors"
      >
        <span>{formatLabel(value)}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-primary-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 select-none rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-semibold text-gray-700">
              {MONTHS_FULL[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7">
            {DAYS.map((day) => (
              <span key={day} className="text-center text-[10px] font-medium text-gray-400">
                {day}
              </span>
            ))}
          </div>

          <CalendarGrid
            viewYear={viewYear}
            viewMonth={viewMonth}
            selectedYmd={toYmd(parseDateTimeValue(value) ?? new Date())}
            onDayClick={handleDayClick}
          />

          <div className="mt-3 border-t border-gray-100 pt-3">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Select checkout time
            </label>
            <input
              type="time"
              value={getTimeValue(value)}
              onChange={(event) => handleTimeChange(event.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}

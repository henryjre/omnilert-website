import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtRangeLabel(from: string, to: string): string {
  if (!from && !to) return '';
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  };
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  return `From ${fmt(from)}`;
}

function CalendarGrid({
  viewYear,
  viewMonth,
  dateFrom,
  dateTo,
  onDayClick,
}: {
  viewYear: number;
  viewMonth: number;
  dateFrom: string;
  dateTo: string;
  onDayClick: (ymd: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="grid grid-cols-7" onMouseLeave={() => setHovered(null)}>
      {cells.map((day, idx) => {
        if (!day) return <div key={idx} className="h-7" />;
        const ymd = toYMD(new Date(viewYear, viewMonth, day));
        const isStart = ymd === dateFrom;
        const isEnd = ymd === dateTo;
        const isInRange = !!(dateFrom && dateTo && ymd > dateFrom && ymd < dateTo);
        const isHoveredRange = !!(dateFrom && !dateTo && hovered && (
          (ymd > dateFrom && ymd < hovered) || (ymd < dateFrom && ymd > hovered)
        ));
        const isEdge = isStart || isEnd;
        const col = idx % 7;

        const bandActive = isInRange || isHoveredRange;
        const bandCls = bandActive
          ? `bg-primary-100${col === 0 ? ' rounded-l' : ''}${col === 6 ? ' rounded-r' : ''}`
          : '';

        return (
          <div
            key={idx}
            className={`relative flex h-7 items-center justify-center ${bandCls}`}
            onMouseEnter={() => { if (dateFrom && !dateTo) setHovered(ymd); }}
          >
            {isStart && (dateTo || (hovered && hovered > dateFrom)) && (
              <div className="absolute inset-y-0 right-0 w-1/2 bg-primary-100" />
            )}
            {isEnd && dateFrom && (
              <div className="absolute inset-y-0 left-0 w-1/2 bg-primary-100" />
            )}
            <button
              onClick={() => onDayClick(ymd)}
              className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-xs transition-colors
                ${isEdge ? 'bg-primary-600 font-semibold text-white' : ''}
                ${!isEdge && !bandActive ? 'text-gray-700 hover:bg-gray-100' : ''}
                ${bandActive && !isEdge ? 'text-gray-800' : ''}
              `}
            >
              {day}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function DateRangePicker({
  dateFrom,
  dateTo,
  onChange,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
}) {
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  function handleDayClick(ymd: string) {
    if (!dateFrom || (dateFrom && dateTo)) {
      onChange(ymd, '');
    } else {
      if (ymd < dateFrom) onChange(ymd, dateFrom);
      else if (ymd === dateFrom) onChange('', '');
      else { onChange(dateFrom, ymd); setOpen(false); }
    }
  }

  const label = fmtRangeLabel(dateFrom, dateTo);
  const hasValue = !!(dateFrom || dateTo);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded border px-3 py-1.5 text-sm transition-colors ${
          hasValue
            ? 'border-primary-500 bg-primary-50 text-primary-700'
            : 'border-gray-300 bg-white text-gray-400 hover:border-gray-400'
        }`}
      >
        <span className={hasValue ? 'text-primary-700' : 'text-gray-400'}>
          {label || 'Select date range...'}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {hasValue && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onChange('', ''); }}
              className="flex h-4 w-4 items-center justify-center rounded-full text-primary-400 hover:bg-primary-100 hover:text-primary-600"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''} ${hasValue ? 'text-primary-500' : 'text-gray-400'}`} />
        </div>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 select-none rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              onClick={prevMonth}
              className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-semibold text-gray-700">
              {MONTHS_FULL[viewMonth]} {viewYear}
            </span>
            <button
              onClick={nextMonth}
              className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7">
            {DAYS.map((d) => (
              <span key={d} className="text-center text-[10px] font-medium text-gray-400">{d}</span>
            ))}
          </div>

          <CalendarGrid
            viewYear={viewYear}
            viewMonth={viewMonth}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDayClick={handleDayClick}
          />

          <p className="mt-2 text-center text-[10px] text-gray-400">
            {!dateFrom ? 'Click to set start date' : !dateTo ? 'Click to set end date' : 'Click a date to reset'}
          </p>
        </div>
      )}
    </div>
  );
}

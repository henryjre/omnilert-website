import { forwardRef, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  type AnalyticsGranularity,
  type AnalyticsRangeSelection,
  compareYmd,
  createDefaultRangeForGranularity,
  endOfLocalDay,
  formatAnalyticsRangeSummary,
  fromLocalYmd,
  monthKey,
  monthKeyBounds,
  normalizeRangeYmd,
  parseMonthKey,
  toLocalYmd,
  ymdToMonthKey,
} from "../utils/analyticsRangeBuckets";

/* ─── Constants ───────────────────────────────────────────────────────── */

const GRANULARITIES: { id: AnalyticsGranularity; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const YEAR_GRID_SPAN = 9;
const DEFAULT_MIN_ANALYTICS_DATE_YMD = "2026-03-28";

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function mondayLeadingEmptyCells(year: number, month: number): number {
  const firstDow = new Date(year, month, 1).getDay();
  return firstDow === 0 ? 6 : firstDow - 1;
}

function rangeSelectionsEqual(a: AnalyticsRangeSelection, b: AnalyticsRangeSelection): boolean {
  return a.granularity === b.granularity && a.rangeStartYmd === b.rangeStartYmd && a.rangeEndYmd === b.rangeEndYmd;
}

function isBeforeMinAnalyticsDate(ymd: string, minAnalyticsDateYmd: string | null): boolean {
  if (!minAnalyticsDateYmd) return false;
  return compareYmd(ymd, minAnalyticsDateYmd) < 0;
}

function clampSelectionToMinAnalyticsDate(
  selection: AnalyticsRangeSelection,
  minAnalyticsDateYmd: string | null,
): AnalyticsRangeSelection {
  const normalized = normalizeRangeYmd(selection.rangeStartYmd, selection.rangeEndYmd);
  const clampedStart = isBeforeMinAnalyticsDate(normalized.rangeStartYmd, minAnalyticsDateYmd)
    ? (minAnalyticsDateYmd ?? normalized.rangeStartYmd)
    : normalized.rangeStartYmd;
  const clampedEnd = isBeforeMinAnalyticsDate(normalized.rangeEndYmd, minAnalyticsDateYmd)
    ? (minAnalyticsDateYmd ?? normalized.rangeEndYmd)
    : normalized.rangeEndYmd;
  const { rangeStartYmd, rangeEndYmd } = normalizeRangeYmd(clampedStart, clampedEnd);
  return {
    granularity: selection.granularity,
    rangeStartYmd,
    rangeEndYmd,
  };
}

function getSelectionFocusDate(selection: AnalyticsRangeSelection): Date {
  return fromLocalYmd(selection.rangeEndYmd);
}

function getSelectionFocusYear(selection: AnalyticsRangeSelection): number {
  const startYear = fromLocalYmd(selection.rangeStartYmd).getFullYear();
  const endYear = fromLocalYmd(selection.rangeEndYmd).getFullYear();
  return Math.floor((Math.min(startYear, endYear) + Math.max(startYear, endYear)) / 2);
}

/** Build cells for a month: null = empty leading/trailing slot, number = day. */
function buildMonthCells(year: number, month: number): (number | null)[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = mondayLeadingEmptyCells(year, month);
  const cells: (number | null)[] = [...Array(leading).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Build the Monday-start weeks whose Monday falls within a given month. */
function buildMonthWeeks(year: number, month: number): { mondayYmd: string; sundayYmd: string; label: string; weekNum: number }[] {
  const weeks: { mondayYmd: string; sundayYmd: string; label: string; weekNum: number }[] = [];
  // Find the first Monday in or before this month
  const first = new Date(year, month, 1);
  const dow = first.getDay();
  const offsetToMonday = dow === 0 ? -6 : dow === 1 ? 0 : -(dow - 1);
  let monday = new Date(year, month, 1 + offsetToMonday);

  // If that Monday is before the month, advance to the next Monday in the month
  if (monday.getMonth() < month || monday.getFullYear() < year) {
    monday.setDate(monday.getDate() + 7);
  }

  let weekNum = 1;
  while (monday.getMonth() === month && monday.getFullYear() === year) {
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const monYmd = toLocalYmd(monday);
    const sunYmd = toLocalYmd(endOfLocalDay(sunday));
    const label = formatWeekLabel(monday, sunday);
    weeks.push({ mondayYmd: monYmd, sundayYmd: sunYmd, label, weekNum });
    weekNum++;
    monday = new Date(monday);
    monday.setDate(monday.getDate() + 7);
  }
  return weeks;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function formatWeekLabel(monday: Date, sunday: Date): string {
  const mMon = SHORT_MONTHS[monday.getMonth()];
  const mSun = SHORT_MONTHS[sunday.getMonth()];
  if (mMon === mSun) {
    return `${mMon} ${monday.getDate()} – ${sunday.getDate()}`;
  }
  return `${mMon} ${monday.getDate()} – ${mSun} ${sunday.getDate()}`;
}

/* ─── Types ───────────────────────────────────────────────────────────── */

export interface AnalyticsRangePickerProps {
  value: AnalyticsRangeSelection;
  onChange: (next: AnalyticsRangeSelection) => void;
  className?: string;
  minDateYmd?: string | null;
  excludeGranularities?: AnalyticsGranularity[];
}

/* ─── Main Component ──────────────────────────────────────────────────── */

export function AnalyticsRangePicker({
  value,
  onChange,
  className = "",
  minDateYmd = DEFAULT_MIN_ANALYTICS_DATE_YMD,
  excludeGranularities = [],
}: AnalyticsRangePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const effectiveMinAnalyticsDateYmd = minDateYmd ?? null;
  const effectiveMinAnalyticsDate = useMemo(
    () => (effectiveMinAnalyticsDateYmd ? fromLocalYmd(effectiveMinAnalyticsDateYmd) : null),
    [effectiveMinAnalyticsDateYmd],
  );
  const clampedValue = useMemo(
    () => clampSelectionToMinAnalyticsDate(value, effectiveMinAnalyticsDateYmd),
    [effectiveMinAnalyticsDateYmd, value],
  );

  // Snapshot the value when the picker opens — used by Discard
  const [initialValue, setInitialValue] = useState(clampedValue);
  const [draft, setDraft] = useState(clampedValue);

  const summary = useMemo(() => formatAnalyticsRangeSummary(clampedValue), [clampedValue]);

  const openPicker = useCallback(() => {
    setInitialValue(clampedValue);
    setDraft(clampedValue);
    setOpen(true);
  }, [clampedValue]);

  const handleApply = useCallback(() => {
    onChange(clampSelectionToMinAnalyticsDate(draft, effectiveMinAnalyticsDateYmd));
    setOpen(false);
  }, [draft, effectiveMinAnalyticsDateYmd, onChange]);

  const handleDiscard = useCallback(() => {
    setDraft(initialValue);
  }, [initialValue]);

  const handleClose = useCallback(() => {
    // Close without applying — revert silently
    setOpen(false);
  }, []);

  const setGranularity = useCallback(
    (g: AnalyticsGranularity) => {
      if (g === draft.granularity) return;
      setDraft(clampSelectionToMinAnalyticsDate(createDefaultRangeForGranularity(g), effectiveMinAnalyticsDateYmd));
    },
    [draft.granularity, effectiveMinAnalyticsDateYmd],
  );

  const isDirty = !rangeSelectionsEqual(draft, initialValue);

  useEffect(() => {
    if (rangeSelectionsEqual(value, clampedValue)) {
      return;
    }
    onChange(clampedValue);
  }, [clampedValue, onChange, value]);

  // Desktop: close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      const inRoot = rootRef.current?.contains(target);
      const inDrawer = drawerRef.current?.contains(target);
      if (!inRoot && !inDrawer) handleClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, handleClose]);

  // Lock body scroll on mobile when drawer is open
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(max-width: 767px)");
    if (mq.matches) document.body.classList.add("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? handleClose() : openPicker())}
        className="flex min-h-[44px] min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left shadow-sm transition-all hover:border-gray-300 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 md:min-h-0 md:py-1.5"
      >
        <Calendar className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        <span className="truncate text-xs font-semibold text-gray-700">{summary}</span>
        <ChevronDown
          className={`ml-auto h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {/* Desktop dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Select analytics date range"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 340 }}
            className="absolute right-0 top-full z-[50] mt-2 hidden max-h-[min(72vh,560px)] w-[22rem] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl md:flex"
          >
            <PanelContent
              draft={draft}
              setDraft={setDraft}
              setGranularity={setGranularity}
              isDirty={isDirty}
              onApply={handleApply}
              onDiscard={handleDiscard}
              minAnalyticsDateYmd={effectiveMinAnalyticsDateYmd}
              minAnalyticsDate={effectiveMinAnalyticsDate}
              excludeGranularities={excludeGranularities}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <MobileDrawer
            ref={drawerRef}
            panelId={panelId}
            draft={draft}
            setDraft={setDraft}
            setGranularity={setGranularity}
            isDirty={isDirty}
            onApply={handleApply}
            onDiscard={handleDiscard}
            onClose={handleClose}
            minAnalyticsDateYmd={effectiveMinAnalyticsDateYmd}
            minAnalyticsDate={effectiveMinAnalyticsDate}
            excludeGranularities={excludeGranularities}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Panel Content (shared between desktop dropdown and mobile drawer) ─ */

function PanelContent({
  draft,
  setDraft,
  setGranularity,
  isDirty,
  onApply,
  onDiscard,
  minAnalyticsDateYmd,
  minAnalyticsDate,
  excludeGranularities = [],
}: {
  draft: AnalyticsRangeSelection;
  setDraft: (v: AnalyticsRangeSelection) => void;
  setGranularity: (g: AnalyticsGranularity) => void;
  isDirty: boolean;
  onApply: () => void;
  onDiscard: () => void;
  minAnalyticsDateYmd: string | null;
  minAnalyticsDate: Date | null;
  excludeGranularities?: AnalyticsGranularity[];
}) {
  return (
    <>
      {/* Granularity tabs */}
      <GranularityTabs active={draft.granularity} onChange={setGranularity} excludeGranularities={excludeGranularities} />

      {/* Grid body */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 pt-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={draft.granularity}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {draft.granularity === "day" && (
              <DayGrid
                draft={draft}
                setDraft={setDraft}
                minAnalyticsDateYmd={minAnalyticsDateYmd}
                minAnalyticsDate={minAnalyticsDate}
              />
            )}
            {draft.granularity === "week" && (
              <WeekGrid
                draft={draft}
                setDraft={setDraft}
                minAnalyticsDateYmd={minAnalyticsDateYmd}
                minAnalyticsDate={minAnalyticsDate}
              />
            )}
            {draft.granularity === "month" && (
              <MonthGrid
                draft={draft}
                setDraft={setDraft}
                minAnalyticsDateYmd={minAnalyticsDateYmd}
                minAnalyticsDate={minAnalyticsDate}
              />
            )}
            {draft.granularity === "year" && (
              <YearGrid
                draft={draft}
                setDraft={setDraft}
                minAnalyticsDateYmd={minAnalyticsDateYmd}
                minAnalyticsDate={minAnalyticsDate}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer — Apply / Discard */}
      <ActionFooter isDirty={isDirty} onApply={onApply} onDiscard={onDiscard} />
    </>
  );
}

/* ─── Granularity Tabs ────────────────────────────────────────────────── */

function GranularityTabs({
  active,
  onChange,
  excludeGranularities = [],
}: {
  active: AnalyticsGranularity;
  onChange: (g: AnalyticsGranularity) => void;
  excludeGranularities?: AnalyticsGranularity[];
}) {
  const visibleGranularities = GRANULARITIES.filter((g) => !excludeGranularities.includes(g.id));
  const activeIndex = visibleGranularities.findIndex((g) => g.id === active);
  const count = visibleGranularities.length;

  return (
    <div className="shrink-0 border-b border-gray-100 px-3 pb-3 pt-3">
      <div className="relative flex rounded-xl bg-gray-100/80 p-1">
        {/* Animated pill background */}
        <motion.div
          className="absolute h-8 rounded-lg bg-primary-600"
          initial={false}
          animate={{
            left: `calc(4px + ${activeIndex} * (100% - 8px) / ${count})`,
            width: `calc((100% - 8px) / ${count})`,
          }}
          transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
        />
        {visibleGranularities.map((g) => {
          const isActive = active === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onChange(g.id)}
              className="group relative flex h-8 flex-1 items-center justify-center rounded-lg px-2 text-[11px] font-bold uppercase tracking-wide outline-none transition-colors"
            >
              <span
                className={`relative z-10 transition-colors duration-200 ${
                  isActive ? "text-white" : "text-gray-500 group-hover:text-gray-700"
                }`}
              >
                {g.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Action Footer ───────────────────────────────────────────────────── */

function ActionFooter({
  isDirty,
  onApply,
  onDiscard,
}: {
  isDirty: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="shrink-0 border-t border-gray-100 bg-gray-50/60 px-4 py-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDiscard}
          disabled={!isDirty}
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onApply}
          className="flex-1 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-primary-700 active:scale-[0.98]"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

/* ─── Mobile Bottom Drawer ────────────────────────────────────────────── */

const MobileDrawer = forwardRef<HTMLDivElement, {
  panelId: string;
  draft: AnalyticsRangeSelection;
  setDraft: (v: AnalyticsRangeSelection) => void;
  setGranularity: (g: AnalyticsGranularity) => void;
  isDirty: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onClose: () => void;
  minAnalyticsDateYmd: string | null;
  minAnalyticsDate: Date | null;
  excludeGranularities?: AnalyticsGranularity[];
}>(function MobileDrawer({
  panelId,
  draft,
  setDraft,
  setGranularity,
  isDirty,
  onApply,
  onDiscard,
  onClose,
  minAnalyticsDateYmd,
  minAnalyticsDate,
  excludeGranularities = [],
}, ref) {
  const draftSummary = useMemo(() => formatAnalyticsRangeSummary(draft), [draft]);

  return createPortal(
    <div ref={ref} className="md:hidden">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[45] bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <motion.div
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-label="Select analytics date range"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-[50] flex max-h-[88dvh] flex-col rounded-t-2xl bg-white shadow-2xl"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 pt-1">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-gray-900">Date Range</h3>
            <p className="mt-0.5 truncate text-[11px] text-gray-500">{draftSummary}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <PanelContent
          draft={draft}
          setDraft={setDraft}
          setGranularity={setGranularity}
          isDirty={isDirty}
          onApply={onApply}
          onDiscard={onDiscard}
          minAnalyticsDateYmd={minAnalyticsDateYmd}
          minAnalyticsDate={minAnalyticsDate}
          excludeGranularities={excludeGranularities}
        />

        {/* Safe area spacer */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </motion.div>
    </div>,
    document.body,
  );
});

/* ─── Shared Nav Header ───────────────────────────────────────────────── */

function NavHeader({
  label,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  disablePrev = false,
  disableNext = false,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
  disablePrev?: boolean;
  disableNext?: boolean;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={onPrev}
        disabled={disablePrev}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
          disablePrev
            ? "cursor-not-allowed text-gray-300"
            : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        }`}
        aria-label={prevLabel}
      >
        <ChevronLeft className="h-4 w-4" />
      </motion.button>
      <span className="text-sm font-bold text-gray-800">{label}</span>
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={onNext}
        disabled={disableNext}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
          disableNext
            ? "cursor-not-allowed text-gray-300"
            : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        }`}
        aria-label={nextLabel}
      >
        <ChevronRight className="h-4 w-4" />
      </motion.button>
    </div>
  );
}

/* ─── Weekday Header Row (shared by Day + Week grids) ─────────────────── */

function WeekdayHeaders() {
  return (
    <div className="mb-1 grid grid-cols-7">
      {WEEKDAY_LABELS.map((d) => (
        <span key={d} className="py-1 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400">
          {d}
        </span>
      ))}
    </div>
  );
}

/* ─── Day Grid ────────────────────────────────────────────────────────── */

function DayGrid({
  draft,
  setDraft,
  minAnalyticsDateYmd,
  minAnalyticsDate,
}: {
  draft: AnalyticsRangeSelection;
  setDraft: (v: AnalyticsRangeSelection) => void;
  minAnalyticsDateYmd: string | null;
  minAnalyticsDate: Date | null;
}) {
  const today = new Date();
  const todayYmd = toLocalYmd(today);
  const focusDate = getSelectionFocusDate(draft);
  const [viewYear, setViewYear] = useState(() => focusDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => focusDate.getMonth());
  const [picking, setPicking] = useState<"start" | "end">("start");
  const minYear = minAnalyticsDate?.getFullYear() ?? Number.NEGATIVE_INFINITY;
  const minMonth = minAnalyticsDate?.getMonth() ?? Number.NEGATIVE_INFINITY;
  const canGoPrevMonth = minAnalyticsDate === null || viewYear > minYear || (viewYear === minYear && viewMonth > minMonth);

  const dateFrom = draft.rangeStartYmd;
  const dateTo = draft.rangeEndYmd;

  const handleDayClick = useCallback(
    (ymd: string) => {
      if (picking === "start" || dateFrom !== dateTo) {
        // Starting a new selection
        setDraft({ granularity: "day", rangeStartYmd: ymd, rangeEndYmd: ymd });
        setPicking("end");
        return;
      }
      // Completing the range
      const n = normalizeRangeYmd(dateFrom, ymd);
      setDraft({ granularity: "day", ...n });
      setPicking("start");
    },
    [dateFrom, dateTo, picking, setDraft],
  );

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }, [viewMonth]);

  const cells = useMemo(() => buildMonthCells(viewYear, viewMonth), [viewYear, viewMonth]);

  return (
    <div className="select-none">
      <NavHeader
        label={`${MONTH_NAMES[viewMonth]} ${viewYear}`}
        onPrev={prevMonth}
        onNext={nextMonth}
        prevLabel="Previous month"
        nextLabel="Next month"
        disablePrev={!canGoPrevMonth}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${viewYear}-${viewMonth}`}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.15 }}
        >
          <WeekdayHeaders />
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, idx) => {
              if (day === null) return <div key={`e-${idx}`} className="h-9" />;

              const ymd = toLocalYmd(new Date(viewYear, viewMonth, day));
              const isDisabled = isBeforeMinAnalyticsDate(ymd, minAnalyticsDateYmd);
              const isToday = ymd === todayYmd;
              const isStart = ymd === dateFrom;
              const isEnd = ymd === dateTo;
              const isEdge = isStart || isEnd;
              const hasRange = dateFrom !== dateTo;
              const inRange = hasRange && dateFrom !== "" && dateTo !== "" && ymd > dateFrom && ymd < dateTo;
              const col = idx % 7;

              let bandCls = "";
              if (inRange) {
                bandCls = "bg-primary-50";
                if (col === 0) bandCls += " rounded-l-lg";
                if (col === 6) bandCls += " rounded-r-lg";
              }

              return (
                <div key={ymd} className={`relative flex h-9 items-stretch justify-center ${bandCls}`}>
                  {isEdge && hasRange && (
                    <>
                      {isStart && <div className="absolute inset-y-0 right-0 w-1/2 bg-primary-50" aria-hidden />}
                      {isEnd && <div className="absolute inset-y-0 left-0 w-1/2 bg-primary-50" aria-hidden />}
                    </>
                  )}
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.88 }}
                    onClick={() => {
                      if (isDisabled) return;
                      handleDayClick(ymd);
                    }}
                    disabled={isDisabled}
                    className={`relative z-10 m-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                      isEdge
                        ? "bg-primary-600 text-white shadow-sm"
                        : inRange
                          ? "text-primary-800 hover:bg-primary-100"
                          : isDisabled
                            ? "cursor-not-allowed text-gray-300"
                          : isToday
                            ? "font-bold text-primary-600 ring-1 ring-inset ring-primary-300"
                            : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {day}
                  </motion.button>
                </div>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      <HintText>
        {picking === "end" && dateFrom === dateTo
          ? "Tap another day to complete the range"
          : "Tap a day to start a new range"}
      </HintText>
    </div>
  );
}

/* ─── Week Grid (2-column week cards per month) ──────────────────────── */

function WeekGrid({
  draft,
  setDraft,
  minAnalyticsDateYmd,
  minAnalyticsDate,
}: {
  draft: AnalyticsRangeSelection;
  setDraft: (v: AnalyticsRangeSelection) => void;
  minAnalyticsDateYmd: string | null;
  minAnalyticsDate: Date | null;
}) {
  const focusDate = getSelectionFocusDate(draft);
  const [viewYear, setViewYear] = useState(() => focusDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => focusDate.getMonth());
  const [anchor, setAnchor] = useState<string | null>(null);
  const minYear = minAnalyticsDate?.getFullYear() ?? Number.NEGATIVE_INFINITY;
  const minMonth = minAnalyticsDate?.getMonth() ?? Number.NEGATIVE_INFINITY;
  const canGoPrevMonth = minAnalyticsDate === null || viewYear > minYear || (viewYear === minYear && viewMonth > minMonth);

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }, [viewMonth]);

  const weeks = useMemo(() => buildMonthWeeks(viewYear, viewMonth), [viewYear, viewMonth]);

  const handleWeekClick = useCallback(
    (mondayYmd: string, sundayYmd: string) => {
      if (!anchor) {
        setAnchor(mondayYmd);
        setDraft({ granularity: "week", rangeStartYmd: mondayYmd, rangeEndYmd: sundayYmd });
        return;
      }
      const aMon = fromLocalYmd(anchor);
      const bMon = fromLocalYmd(mondayYmd);
      const startMon = aMon.getTime() <= bMon.getTime() ? anchor : mondayYmd;
      const endMon = aMon.getTime() <= bMon.getTime() ? mondayYmd : anchor;
      const endSun = fromLocalYmd(endMon);
      endSun.setDate(endSun.getDate() + 6);
      const normalized = normalizeRangeYmd(startMon, toLocalYmd(endOfLocalDay(endSun)));
      setDraft({ granularity: "week", ...normalized });
      setAnchor(null);
    },
    [anchor, setDraft],
  );

  const startY = draft.rangeStartYmd;
  const endY = draft.rangeEndYmd;

  return (
    <div className="select-none">
      <NavHeader
        label={`${MONTH_NAMES[viewMonth]} ${viewYear}`}
        onPrev={prevMonth}
        onNext={nextMonth}
        prevLabel="Previous month"
        nextLabel="Next month"
        disablePrev={!canGoPrevMonth}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${viewYear}-${viewMonth}`}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.15 }}
        >
          <div className="grid grid-cols-2 gap-2">
            {weeks.map((w) => {
              const isDisabled = isBeforeMinAnalyticsDate(w.sundayYmd, minAnalyticsDateYmd);
              const overlaps = !(compareYmd(w.sundayYmd, startY) < 0 || compareYmd(w.mondayYmd, endY) > 0);
              const isEdge = overlaps && (
                (compareYmd(w.mondayYmd, startY) <= 0 && compareYmd(w.sundayYmd, startY) >= 0) ||
                (compareYmd(w.mondayYmd, endY) <= 0 && compareYmd(w.sundayYmd, endY) >= 0)
              );
              const isMid = overlaps && !isEdge;

              return (
                <motion.button
                  key={w.mondayYmd}
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    if (isDisabled) return;
                    handleWeekClick(w.mondayYmd, w.sundayYmd);
                  }}
                  disabled={isDisabled}
                  className={`flex flex-col items-center justify-center rounded-lg border px-2 py-3 transition-all ${
                    isDisabled
                      ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300"
                      : isEdge
                      ? "border-primary-500 bg-primary-600 text-white shadow-sm"
                      : isMid
                        ? "border-primary-200 bg-primary-50 text-primary-800"
                        : "border-gray-100 bg-white text-gray-700 hover:border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${
                    isDisabled
                      ? "text-gray-300"
                      : isEdge
                        ? "text-primary-200"
                        : "text-gray-400"
                  }`}>
                    Week {w.weekNum}
                  </span>
                  <span className="mt-0.5 text-xs font-semibold">{w.label}</span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      <HintText>
        {anchor ? "Tap another week to complete the range" : "Tap a week to start"}
      </HintText>
    </div>
  );
}

/* ─── Month Grid ──────────────────────────────────────────────────────── */

function MonthGrid({
  draft,
  setDraft,
  minAnalyticsDateYmd,
  minAnalyticsDate,
}: {
  draft: AnalyticsRangeSelection;
  setDraft: (v: AnalyticsRangeSelection) => void;
  minAnalyticsDateYmd: string | null;
  minAnalyticsDate: Date | null;
}) {
  const focusDate = getSelectionFocusDate(draft);
  const [viewYear, setViewYear] = useState(() => focusDate.getFullYear());
  const [anchorKey, setAnchorKey] = useState<string | null>(null);
  const minYear = minAnalyticsDate?.getFullYear() ?? Number.NEGATIVE_INFINITY;

  const onMonthClick = useCallback(
    (mi: number) => {
      const key = monthKey(viewYear, mi);
      const bounds = monthKeyBounds(key);
      if (!bounds) return;

      if (!anchorKey) {
        setAnchorKey(key);
        setDraft({ granularity: "month", rangeStartYmd: bounds.rangeStartYmd, rangeEndYmd: bounds.rangeEndYmd });
        return;
      }
      const a = parseMonthKey(anchorKey);
      const b = parseMonthKey(key);
      if (!a || !b) return;
      const aOrd = a.year * 12 + a.monthIndex;
      const bOrd = b.year * 12 + b.monthIndex;
      const lo = aOrd <= bOrd ? a : b;
      const hi = aOrd <= bOrd ? b : a;
      const rs = new Date(lo.year, lo.monthIndex, 1, 0, 0, 0, 0);
      const re = new Date(hi.year, hi.monthIndex + 1, 0, 23, 59, 59, 999);
      setDraft({ granularity: "month", ...normalizeRangeYmd(toLocalYmd(rs), toLocalYmd(re)) });
      setAnchorKey(null);
    },
    [anchorKey, setDraft, viewYear],
  );

  const rangeLo = useMemo(() => {
    const lo = parseMonthKey(ymdToMonthKey(draft.rangeStartYmd));
    const hi = parseMonthKey(ymdToMonthKey(draft.rangeEndYmd));
    if (!lo || !hi) return null;
    const a = lo.year * 12 + lo.monthIndex;
    const b = hi.year * 12 + hi.monthIndex;
    return { loOrd: Math.min(a, b), hiOrd: Math.max(a, b) };
  }, [draft.rangeStartYmd, draft.rangeEndYmd]);

  return (
    <div className="select-none">
      <NavHeader
        label={String(viewYear)}
        onPrev={() => setViewYear((y) => y - 1)}
        onNext={() => setViewYear((y) => y + 1)}
        prevLabel="Previous year"
        nextLabel="Next year"
        disablePrev={minAnalyticsDate !== null && viewYear <= minYear}
      />
      <div className="grid grid-cols-3 gap-1.5">
        {MONTH_NAMES.map((name, mi) => {
          const kOrd = viewYear * 12 + mi;
          const bounds = monthKeyBounds(monthKey(viewYear, mi));
          const isDisabled = !bounds || isBeforeMinAnalyticsDate(bounds.rangeEndYmd, minAnalyticsDateYmd);
          const selected = rangeLo !== null && kOrd >= rangeLo.loOrd && kOrd <= rangeLo.hiOrd;
          const isEdge = rangeLo !== null && (kOrd === rangeLo.loOrd || kOrd === rangeLo.hiOrd);
          return (
            <motion.button
              key={monthKey(viewYear, mi)}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                if (isDisabled) return;
                onMonthClick(mi);
              }}
              disabled={isDisabled}
              className={`flex h-10 items-center justify-center rounded-lg border text-xs font-semibold transition-all ${
                isDisabled
                  ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300"
                  : isEdge
                  ? "border-primary-500 bg-primary-600 text-white shadow-sm"
                  : selected
                    ? "border-primary-200 bg-primary-50 text-primary-800"
                    : "border-gray-100 bg-white text-gray-700 hover:border-gray-200 hover:bg-gray-50"
              }`}
            >
              {name.slice(0, 3)}
            </motion.button>
          );
        })}
      </div>

      <HintText>
        {anchorKey ? "Tap another month to complete the range" : "Tap a month to start"}
      </HintText>
    </div>
  );
}

/* ─── Year Grid ───────────────────────────────────────────────────────── */

function YearGrid({
  draft,
  setDraft,
  minAnalyticsDateYmd,
  minAnalyticsDate,
}: {
  draft: AnalyticsRangeSelection;
  setDraft: (v: AnalyticsRangeSelection) => void;
  minAnalyticsDateYmd: string | null;
  minAnalyticsDate: Date | null;
}) {
  const [center, setCenter] = useState(() => getSelectionFocusYear(draft));
  const years = useMemo(() => {
    const start = center - Math.floor(YEAR_GRID_SPAN / 2);
    return Array.from({ length: YEAR_GRID_SPAN }, (_, i) => start + i);
  }, [center]);

  const [anchorYear, setAnchorYear] = useState<number | null>(null);
  const minYear = minAnalyticsDate?.getFullYear() ?? Number.NEGATIVE_INFINITY;

  const onYearClick = useCallback(
    (y: number) => {
      const rs = toLocalYmd(new Date(y, 0, 1, 0, 0, 0, 0));
      const re = toLocalYmd(endOfLocalDay(new Date(y, 11, 31)));
      if (anchorYear === null) {
        setAnchorYear(y);
        setDraft({ granularity: "year", rangeStartYmd: rs, rangeEndYmd: re });
        return;
      }
      const yMin = Math.min(anchorYear, y);
      const yMax = Math.max(anchorYear, y);
      const rStart = toLocalYmd(new Date(yMin, 0, 1, 0, 0, 0, 0));
      const rEnd = toLocalYmd(endOfLocalDay(new Date(yMax, 11, 31)));
      setDraft({ granularity: "year", ...normalizeRangeYmd(rStart, rEnd) });
      setAnchorYear(null);
    },
    [anchorYear, setDraft],
  );

  const sy = Math.min(fromLocalYmd(draft.rangeStartYmd).getFullYear(), fromLocalYmd(draft.rangeEndYmd).getFullYear());
  const ey = Math.max(fromLocalYmd(draft.rangeStartYmd).getFullYear(), fromLocalYmd(draft.rangeEndYmd).getFullYear());

  return (
    <div className="select-none">
      <NavHeader
        label={`${years[0]} – ${years[years.length - 1]}`}
        onPrev={() => setCenter((c) => c - YEAR_GRID_SPAN)}
        onNext={() => setCenter((c) => c + YEAR_GRID_SPAN)}
        prevLabel="Earlier years"
        nextLabel="Later years"
        disablePrev={minAnalyticsDate !== null && years[0] <= minYear}
      />
      <div className="grid grid-cols-3 gap-1.5">
        {years.map((y) => {
          const yearEndYmd = toLocalYmd(endOfLocalDay(new Date(y, 11, 31)));
          const isDisabled = isBeforeMinAnalyticsDate(yearEndYmd, minAnalyticsDateYmd);
          const inRange = y >= sy && y <= ey;
          const isEdge = y === sy || y === ey;
          return (
            <motion.button
              key={y}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                if (isDisabled) return;
                onYearClick(y);
              }}
              disabled={isDisabled}
              className={`flex h-10 items-center justify-center rounded-lg border text-sm font-bold transition-all ${
                isDisabled
                  ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300"
                  : isEdge
                  ? "border-primary-500 bg-primary-600 text-white shadow-sm"
                  : inRange
                    ? "border-primary-200 bg-primary-50 text-primary-800"
                    : "border-gray-100 bg-white text-gray-700 hover:border-gray-200 hover:bg-gray-50"
              }`}
            >
              {y}
            </motion.button>
          );
        })}
      </div>

      <HintText>
        {anchorYear !== null ? "Tap another year to complete the range" : "Tap a year to start"}
      </HintText>
    </div>
  );
}

/* ─── Shared hint text ────────────────────────────────────────────────── */

function HintText({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-center text-[10px] leading-relaxed text-gray-400">{children}</p>
  );
}

/* ─── Public helper (used by page) ────────────────────────────────────── */

export function getSummaryForSelection(selection: AnalyticsRangeSelection): string {
  if (!selection.rangeStartYmd || !selection.rangeEndYmd) return "Select range";
  return formatAnalyticsRangeSummary(selection);
}

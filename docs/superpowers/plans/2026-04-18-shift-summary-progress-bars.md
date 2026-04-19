# Shift Summary Progress Bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static hours/break grid in the Shift Detail Panel's Shift Summary section with visual progress bars in both `ScheduleTab.tsx` (My Account) and `EmployeeShiftsPage.tsx` (manager view).

**Architecture:** Two inline helper components — `ShiftProgressBar` (single bar with overflow support) and `ShiftStackedBar` (segmented composite bar) — are defined once per file since both files are large self-contained components. The grid is replaced with a compact row for Shift Start/End/Pending Approvals, then three full-width bars below. Field task hours are derived from logs the same way break hours already are.

**Tech Stack:** React 18, Tailwind CSS 3, TypeScript, `formatDuration` from `@/shared/utils/duration`

---

## File Map

| File | Change |
|---|---|
| `apps/web/src/features/account/components/ScheduleTab.tsx` | Add `totalFieldTaskMinutes` useMemo; add `ShiftProgressBar` + `ShiftStackedBar` components before `ShiftDetailPanel`; replace Shift Summary grid JSX |
| `apps/web/src/features/employee-shifts/pages/EmployeeShiftsPage.tsx` | Same changes mirrored exactly |

---

## Task 1: Add `ShiftProgressBar` and `ShiftStackedBar` to `ScheduleTab.tsx`

**Files:**
- Modify: `apps/web/src/features/account/components/ScheduleTab.tsx` (insert before line ~980, the `ShiftDetailPanel` definition)

- [ ] **Step 1: Insert the two helper components just above the `ShiftDetailPanel` definition**

Find this line in the file (around line 980):
```tsx
// ─── Shift Detail Panel ───────────────────────────────────────────────────────
```

Insert the following block immediately before it:

```tsx
// ─── Shift Progress Bar ───────────────────────────────────────────────────────

function ShiftProgressBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: 'blue' | 'amber';
}) {
  const isOverflow = value > max && max > 0;
  const displayMax = isOverflow ? value : max;
  const normalPct = max > 0 ? Math.min((max / displayMax) * 100, 100) : 0;
  const fillPct = displayMax > 0 ? Math.min((value / displayMax) * 100, 100) : 0;

  const trackCls = 'h-2 w-full overflow-hidden rounded-full bg-gray-100 relative';
  const normalFillCls =
    color === 'blue'
      ? 'h-full rounded-full bg-blue-500'
      : 'h-full rounded-full bg-amber-400';
  const overflowFillCls = 'h-full rounded-full bg-red-400';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-gray-600 uppercase tracking-wide">{label}</span>
        <span className="text-gray-500 tabular-nums">
          {formatDuration(value)} / {formatDuration(max)}
        </span>
      </div>
      <div className={trackCls}>
        {isOverflow ? (
          <>
            <div className={normalFillCls} style={{ width: `${normalPct}%`, position: 'absolute', top: 0, left: 0 }} />
            <div className={overflowFillCls} style={{ width: `${fillPct}%`, position: 'absolute', top: 0, left: 0 }} />
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${normalPct}%`,
                width: '2px',
                backgroundColor: 'white',
                transform: 'translateX(-50%)',
              }}
            />
          </>
        ) : (
          <div className={normalFillCls} style={{ width: `${fillPct}%` }} />
        )}
      </div>
    </div>
  );
}

// ─── Shift Stacked Bar ────────────────────────────────────────────────────────

function ShiftStackedBar({
  segments,
  total,
}: {
  segments: { label: string; value: number; color: 'blue' | 'amber' | 'purple' }[];
  total: number;
}) {
  const colorCls: Record<string, string> = {
    blue: 'bg-blue-500',
    amber: 'bg-amber-400',
    purple: 'bg-purple-500',
  };
  const dotCls: Record<string, string> = {
    blue: 'bg-blue-500',
    amber: 'bg-amber-400',
    purple: 'bg-purple-500',
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-gray-600 uppercase tracking-wide">Total Active Hours</span>
        <span className="text-gray-500 tabular-nums">{formatDuration(total)} total</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 flex">
        {total > 0
          ? segments.map((seg) => (
              <div
                key={seg.label}
                className={colorCls[seg.color]}
                style={{ width: `${(seg.value / total) * 100}%` }}
              />
            ))
          : null}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
        {segments.map((seg) => (
          <span key={seg.label} className="flex items-center gap-1 text-[11px] text-gray-500">
            <span className={`h-1.5 w-1.5 rounded-full ${dotCls[seg.color]}`} />
            {formatDuration(seg.value)} {seg.label}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add apps/web/src/features/account/components/ScheduleTab.tsx
rtk git commit -m "feat(schedules): add ShiftProgressBar and ShiftStackedBar helper components to ScheduleTab"
```

---

## Task 2: Add `totalFieldTaskMinutes` useMemo in `ScheduleTab.tsx` `ShiftDetailPanel`

**Files:**
- Modify: `apps/web/src/features/account/components/ScheduleTab.tsx` (inside `ShiftDetailPanel`, around line 1038)

- [ ] **Step 1: Find this existing block in `ShiftDetailPanel` (around line 1032)**

```tsx
    const totalBreakMinutes = useMemo(
      () =>
        logs
          .filter((l) => l.log_type === 'break_end')
          .reduce((sum, l) => sum + (Number((l.changes as any)?.duration_minutes) || 0), 0),
      [logs],
    );

    const allocatedBreakHours = ALLOCATED_BREAK_HOURS;
    const effectiveAllocatedHours = Math.max(
      0,
      Number(shift.allocated_hours || 0) - allocatedBreakHours,
    );
    const totalBreakHours = totalBreakMinutes / 60;
    const totalWorkedHours = Number(shift.total_worked_hours || 0);
    const netWorkedHours = Math.max(0, totalWorkedHours - totalBreakHours);
```

Replace it with:

```tsx
    const totalBreakMinutes = useMemo(
      () =>
        logs
          .filter((l) => l.log_type === 'break_end')
          .reduce((sum, l) => sum + (Number((l.changes as any)?.duration_minutes) || 0), 0),
      [logs],
    );

    const totalFieldTaskMinutes = useMemo(
      () =>
        logs
          .filter((l) => l.log_type === 'field_task_end')
          .reduce((sum, l) => sum + (Number((l.changes as any)?.duration_minutes) || 0), 0),
      [logs],
    );

    const allocatedBreakHours = ALLOCATED_BREAK_HOURS;
    const effectiveAllocatedHours = Math.max(
      0,
      Number(shift.allocated_hours || 0) - allocatedBreakHours,
    );
    const totalBreakHours = totalBreakMinutes / 60;
    const totalFieldTaskHours = totalFieldTaskMinutes / 60;
    const totalWorkedHours = Number(shift.total_worked_hours || 0);
    const netWorkedHours = Math.max(0, totalWorkedHours - totalBreakHours);
```

- [ ] **Step 2: Commit**

```bash
rtk git add apps/web/src/features/account/components/ScheduleTab.tsx
rtk git commit -m "feat(schedules): derive totalFieldTaskHours from logs in ScheduleTab ShiftDetailPanel"
```

---

## Task 3: Replace Shift Summary grid JSX in `ScheduleTab.tsx`

**Files:**
- Modify: `apps/web/src/features/account/components/ScheduleTab.tsx` (lines ~1157–1221, the `<div className="grid grid-cols-2 ...">` block inside Shift Summary)

- [ ] **Step 1: Find the grid block inside the Shift Summary section (starts around line 1157)**

```tsx
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">Shift Start</p>
                  <p className="mt-0.5 text-sm font-medium text-gray-800">
                    {fmtShift(shift.shift_start)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">Shift End</p>
                  <p className="mt-0.5 text-sm font-medium text-gray-800">
                    {fmtShift(shift.shift_end)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">
                    Allocated Hours
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-gray-800">
                    {formatDuration(effectiveAllocatedHours)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">
                    Allocated Breaks
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-gray-800">
                    {formatDuration(allocatedBreakHours)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 text-blue-600">
                    Net Worked Hours
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-blue-700">
                    {formatDuration(netWorkedHours)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">
                    Total Active Hours
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-gray-800">
                    {formatDuration(totalWorkedHours)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">
                    Total Break Hours
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-gray-800">
                    {formatDuration(totalBreakHours)}
                  </p>
                </div>
                {shift.pending_approvals > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">
                      Pending Approvals
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-amber-700 font-bold flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {shift.pending_approvals}
                    </p>
                  </div>
                )}
              </div>
```

Replace it with:

```tsx
              <div className="px-4 py-3 space-y-3">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Shift Start</p>
                    <p className="mt-0.5 text-sm font-medium text-gray-800">
                      {fmtShift(shift.shift_start)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Shift End</p>
                    <p className="mt-0.5 text-sm font-medium text-gray-800">
                      {fmtShift(shift.shift_end)}
                    </p>
                  </div>
                  {shift.pending_approvals > 0 && (
                    <div className="col-span-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">
                        Pending Approvals
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {shift.pending_approvals}
                      </p>
                    </div>
                  )}
                </div>
                <div className="border-t border-gray-100 pt-3 space-y-3">
                  <ShiftProgressBar
                    label="Worked Hours"
                    value={netWorkedHours}
                    max={effectiveAllocatedHours}
                    color="blue"
                  />
                  <ShiftProgressBar
                    label="Break Hours"
                    value={totalBreakHours}
                    max={allocatedBreakHours}
                    color="amber"
                  />
                  <ShiftStackedBar
                    total={totalWorkedHours}
                    segments={[
                      { label: 'worked', value: netWorkedHours, color: 'blue' },
                      { label: 'break', value: totalBreakHours, color: 'amber' },
                      { label: 'field task', value: totalFieldTaskHours, color: 'purple' },
                    ]}
                  />
                </div>
              </div>
```

- [ ] **Step 2: Commit**

```bash
rtk git add apps/web/src/features/account/components/ScheduleTab.tsx
rtk git commit -m "feat(schedules): replace Shift Summary grid with progress bars in ScheduleTab"
```

---

## Task 4: Add `ShiftProgressBar` and `ShiftStackedBar` to `EmployeeShiftsPage.tsx`

**Files:**
- Modify: `apps/web/src/features/employee-shifts/pages/EmployeeShiftsPage.tsx` (insert before the `ShiftDetailPanel` definition, around line 1223)

- [ ] **Step 1: Find this comment in `EmployeeShiftsPage.tsx` (around line 1223)**

```tsx
const ShiftDetailPanel = memo(
```

Insert the following block immediately before it:

```tsx
// --- Shift Progress Bar ---

function ShiftProgressBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: 'blue' | 'amber';
}) {
  const isOverflow = value > max && max > 0;
  const displayMax = isOverflow ? value : max;
  const normalPct = max > 0 ? Math.min((max / displayMax) * 100, 100) : 0;
  const fillPct = displayMax > 0 ? Math.min((value / displayMax) * 100, 100) : 0;

  const trackCls = 'h-2 w-full overflow-hidden rounded-full bg-gray-100 relative';
  const normalFillCls =
    color === 'blue'
      ? 'h-full rounded-full bg-blue-500'
      : 'h-full rounded-full bg-amber-400';
  const overflowFillCls = 'h-full rounded-full bg-red-400';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-gray-600 uppercase tracking-wide">{label}</span>
        <span className="text-gray-500 tabular-nums">
          {formatDuration(value)} / {formatDuration(max)}
        </span>
      </div>
      <div className={trackCls}>
        {isOverflow ? (
          <>
            <div className={normalFillCls} style={{ width: `${normalPct}%`, position: 'absolute', top: 0, left: 0 }} />
            <div className={overflowFillCls} style={{ width: `${fillPct}%`, position: 'absolute', top: 0, left: 0 }} />
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${normalPct}%`,
                width: '2px',
                backgroundColor: 'white',
                transform: 'translateX(-50%)',
              }}
            />
          </>
        ) : (
          <div className={normalFillCls} style={{ width: `${fillPct}%` }} />
        )}
      </div>
    </div>
  );
}

// --- Shift Stacked Bar ---

function ShiftStackedBar({
  segments,
  total,
}: {
  segments: { label: string; value: number; color: 'blue' | 'amber' | 'purple' }[];
  total: number;
}) {
  const colorCls: Record<string, string> = {
    blue: 'bg-blue-500',
    amber: 'bg-amber-400',
    purple: 'bg-purple-500',
  };
  const dotCls: Record<string, string> = {
    blue: 'bg-blue-500',
    amber: 'bg-amber-400',
    purple: 'bg-purple-500',
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-gray-600 uppercase tracking-wide">Total Active Hours</span>
        <span className="text-gray-500 tabular-nums">{formatDuration(total)} total</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 flex">
        {total > 0
          ? segments.map((seg) => (
              <div
                key={seg.label}
                className={colorCls[seg.color]}
                style={{ width: `${(seg.value / total) * 100}%` }}
              />
            ))
          : null}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
        {segments.map((seg) => (
          <span key={seg.label} className="flex items-center gap-1 text-[11px] text-gray-500">
            <span className={`h-1.5 w-1.5 rounded-full ${dotCls[seg.color]}`} />
            {formatDuration(seg.value)} {seg.label}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add apps/web/src/features/employee-shifts/pages/EmployeeShiftsPage.tsx
rtk git commit -m "feat(employee-shifts): add ShiftProgressBar and ShiftStackedBar helper components"
```

---

## Task 5: Add `totalFieldTaskMinutes` useMemo in `EmployeeShiftsPage.tsx` `ShiftDetailPanel`

**Files:**
- Modify: `apps/web/src/features/employee-shifts/pages/EmployeeShiftsPage.tsx` (inside `ShiftDetailPanel`, around line 1272)

- [ ] **Step 1: Find this existing block in `ShiftDetailPanel` (around line 1272)**

```tsx
    const totalBreakMinutes = useMemo(
      () =>
        logs
          .filter((l) => l.log_type === 'break_end')
          .reduce((sum, l) => sum + (Number((l.changes as any)?.duration_minutes) || 0), 0),
      [logs],
    );

    const allocatedBreakHours = ALLOCATED_BREAK_HOURS;
    const effectiveAllocatedHours = Math.max(
      0,
      Number(shift.allocated_hours || 0) - allocatedBreakHours,
    );
    const totalBreakHours = totalBreakMinutes / 60;
    const totalWorkedHours = Number(shift.total_worked_hours || 0);
    const netWorkedHours = Math.max(0, totalWorkedHours - totalBreakHours);
```

Replace it with:

```tsx
    const totalBreakMinutes = useMemo(
      () =>
        logs
          .filter((l) => l.log_type === 'break_end')
          .reduce((sum, l) => sum + (Number((l.changes as any)?.duration_minutes) || 0), 0),
      [logs],
    );

    const totalFieldTaskMinutes = useMemo(
      () =>
        logs
          .filter((l) => l.log_type === 'field_task_end')
          .reduce((sum, l) => sum + (Number((l.changes as any)?.duration_minutes) || 0), 0),
      [logs],
    );

    const allocatedBreakHours = ALLOCATED_BREAK_HOURS;
    const effectiveAllocatedHours = Math.max(
      0,
      Number(shift.allocated_hours || 0) - allocatedBreakHours,
    );
    const totalBreakHours = totalBreakMinutes / 60;
    const totalFieldTaskHours = totalFieldTaskMinutes / 60;
    const totalWorkedHours = Number(shift.total_worked_hours || 0);
    const netWorkedHours = Math.max(0, totalWorkedHours - totalBreakHours);
```

- [ ] **Step 2: Commit**

```bash
rtk git add apps/web/src/features/employee-shifts/pages/EmployeeShiftsPage.tsx
rtk git commit -m "feat(employee-shifts): derive totalFieldTaskHours from logs in ShiftDetailPanel"
```

---

## Task 6: Replace Shift Summary grid JSX in `EmployeeShiftsPage.tsx`

**Files:**
- Modify: `apps/web/src/features/employee-shifts/pages/EmployeeShiftsPage.tsx` (lines ~1401–1481, the `<div className="grid grid-cols-2 ...">` block inside Shift Summary)

- [ ] **Step 1: Find the grid block inside the Shift Summary section (starts around line 1401)**

```tsx
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">Shift Start</p>
                  <p className="mt-0.5 text-sm font-medium text-gray-800">
                    {fmtShift(shift.shift_start)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">Shift End</p>
                  <p className="mt-0.5 text-sm font-medium text-gray-800">
                    {fmtShift(shift.shift_end)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">
                    Allocated Hours
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-gray-800">
                    {formatDuration(effectiveAllocatedHours)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">
                    Allocated Breaks
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-gray-800">
                    {formatDuration(allocatedBreakHours)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 text-blue-600">
                    Net Worked Hours
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-blue-700">
                    {formatDuration(netWorkedHours)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">
                    Total Active Hours
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-gray-800">
                    {formatDuration(totalWorkedHours)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">
                    Total Break Hours
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-gray-800">
                    {formatDuration(totalBreakHours)}
                  </p>
                </div>
                {shift.check_in_status && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Attendance</p>
                    <p className="mt-0.5 text-sm font-medium">
                      {shift.check_in_status === 'checked_in' ? (
                        <span className="inline-flex items-center gap-1 text-green-700">
                          <span className="h-2 w-2 rounded-full bg-green-500" /> Checked In
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-500">
                          <span className="h-2 w-2 rounded-full bg-gray-400" /> Checked Out
                        </span>
                      )}
                    </p>
                  </div>
                )}
                {shift.pending_approvals > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">
                      Pending Approvals
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-amber-700 font-bold flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {shift.pending_approvals}
                    </p>
                  </div>
                )}
              </div>
```

Replace it with:

```tsx
              <div className="px-4 py-3 space-y-3">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Shift Start</p>
                    <p className="mt-0.5 text-sm font-medium text-gray-800">
                      {fmtShift(shift.shift_start)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Shift End</p>
                    <p className="mt-0.5 text-sm font-medium text-gray-800">
                      {fmtShift(shift.shift_end)}
                    </p>
                  </div>
                  {shift.check_in_status && (
                    <div className="col-span-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Attendance</p>
                      <p className="mt-0.5 text-sm font-medium">
                        {shift.check_in_status === 'checked_in' ? (
                          <span className="inline-flex items-center gap-1 text-green-700">
                            <span className="h-2 w-2 rounded-full bg-green-500" /> Checked In
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-500">
                            <span className="h-2 w-2 rounded-full bg-gray-400" /> Checked Out
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                  {shift.pending_approvals > 0 && (
                    <div className="col-span-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">
                        Pending Approvals
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {shift.pending_approvals}
                      </p>
                    </div>
                  )}
                </div>
                <div className="border-t border-gray-100 pt-3 space-y-3">
                  <ShiftProgressBar
                    label="Worked Hours"
                    value={netWorkedHours}
                    max={effectiveAllocatedHours}
                    color="blue"
                  />
                  <ShiftProgressBar
                    label="Break Hours"
                    value={totalBreakHours}
                    max={allocatedBreakHours}
                    color="amber"
                  />
                  <ShiftStackedBar
                    total={totalWorkedHours}
                    segments={[
                      { label: 'worked', value: netWorkedHours, color: 'blue' },
                      { label: 'break', value: totalBreakHours, color: 'amber' },
                      { label: 'field task', value: totalFieldTaskHours, color: 'purple' },
                    ]}
                  />
                </div>
              </div>
```

- [ ] **Step 2: Commit**

```bash
rtk git add apps/web/src/features/employee-shifts/pages/EmployeeShiftsPage.tsx
rtk git commit -m "feat(employee-shifts): replace Shift Summary grid with progress bars"
```

---

## Task 7: Type-check and verify

- [ ] **Step 1: Run TypeScript check**

```bash
cd /home/phaeton/Projects/omnilert-website && rtk tsc --noEmit -p apps/web/tsconfig.json
```

Expected: No errors. If errors appear, fix them before continuing.

- [ ] **Step 2: Open both views in the browser and verify visually**

1. Open the My Account → Schedule tab, click a shift → Shift Summary section should show:
   - Shift Start + Shift End compact row
   - Pending Approvals row (if any)
   - "Worked Hours" blue progress bar with `value / max` label
   - "Break Hours" amber progress bar with `value / max` label
   - "Total Active Hours" stacked bar with colored dot legend
2. Open Employee Shifts page (manager view), click a shift → same structure
3. For a shift with no breaks and no field tasks: bars should show 0-width fill gracefully (no layout break)
4. Mentally verify: if `netWorkedHours` were larger than `effectiveAllocatedHours`, the worked bar would render red overflow + white line marker

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
rtk git add -p
rtk git commit -m "fix(schedules): address type errors in progress bar components"
```

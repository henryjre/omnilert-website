import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  PERMISSIONS,
  type PayslipDetailResponse,
  type PayslipListItem,
  type PayrollOverviewPeriod,
  type PayrollOverviewPeriodOption,
  type PayrollOverviewResponse,
  type PayrollOverviewValidationResponse,
} from '@omnilert/shared';
import type { ViewOption } from '@/shared/components/ui/ViewToggle';
import {
  AlertTriangle,
  CalendarDays,
  CircleCheck,
  ChevronDown,
  Clock,
  FileEdit,
  FileText,
  LayoutGrid,
  Loader2,
  X,
} from 'lucide-react';
import { api } from '@/shared/services/api.client';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { usePermission } from '@/shared/hooks/usePermission';
import { useBranchStore } from '@/shared/store/branchStore';
import type { SelectorCompanyGroup } from '@/shared/components/branchSelectorState';
import { Pagination } from '@/shared/components/ui/Pagination';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { PayrollOverviewCard } from './PayrollOverviewCard';
import { PayrollManagementDetailPanel } from './PayrollManagementDetailPanel';
import { PayrollValidationReportModal } from './PayrollValidationReportModal';
import {
  buildGroupedEmployees,
  matchesPayrollOverviewStatusTab,
  resolveGroupedEmployeeStatus,
  resolvePayrollOverviewDisplayStatus,
  resolvePrimaryPayslip,
  type GroupedEmployee,
  type PayrollOverviewStatusTab,
} from './payrollOverview.shared';
import {
  fetchPayrollOverview,
  validatePayrollOverview,
} from '../services/payrollManagement.api';

const STATUS_TABS: ViewOption<PayrollOverviewStatusTab>[] = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'pending', label: 'Pending', icon: Clock },
  { id: 'draft', label: 'Draft', icon: FileEdit },
  { id: 'completed', label: 'Completed', icon: CircleCheck },
  { id: 'on_hold', label: 'On Hold', icon: AlertTriangle },
];

const PERIOD_OPTIONS: Array<{ id: PayrollOverviewPeriodOption; label: string }> = [
  { id: 'current', label: 'Current period' },
  { id: 'previous', label: 'Previous period' },
];

function usePageSize(): number {
  const [pageSize, setPageSize] = useState(() => (window.innerWidth >= 1024 ? 20 : 10));
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setPageSize(e.matches ? 20 : 10);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return pageSize;
}

function formatPeriodHeader(dateFrom: string, dateTo: string, cutoff: 1 | 2): string {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
  const cutoffLabel = cutoff === 1 ? '1st Cutoff' : '2nd Cutoff';
  return `${fmt(from)} – ${fmt(to)} · ${cutoffLabel}`;
}

function getSemiMonthRangeForMonth(year: number, month: number, cutoff: 1 | 2): {
  dateFrom: string;
  dateTo: string;
  cutoff: 1 | 2;
} {
  const monthText = String(month).padStart(2, '0');
  if (cutoff === 1) {
    return {
      dateFrom: `${year}-${monthText}-01`,
      dateTo: `${year}-${monthText}-15`,
      cutoff,
    };
  }

  const lastDay = new Date(year, month, 0).getDate();
  return {
    dateFrom: `${year}-${monthText}-16`,
    dateTo: `${year}-${monthText}-${String(lastDay).padStart(2, '0')}`,
    cutoff,
  };
}

function getRelativePayrollPeriod(
  period: { dateFrom: string; dateTo: string; cutoff: 1 | 2 },
  direction: 'previous' | 'next',
): { dateFrom: string; dateTo: string; cutoff: 1 | 2 } {
  const [yearText, monthText] = period.dateFrom.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (direction === 'previous') {
    if (period.cutoff === 2) {
      return getSemiMonthRangeForMonth(year, month, 1);
    }

    const previousMonth = new Date(year, month - 2, 1);
    return getSemiMonthRangeForMonth(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 2);
  }

  if (period.cutoff === 1) {
    return getSemiMonthRangeForMonth(year, month, 2);
  }

  const nextMonth = new Date(year, month, 1);
  return getSemiMonthRangeForMonth(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 1);
}

function stripEmployeeNumber(name: string): string {
  return name.replace(/^\d+\s*-\s*/, '').trim();
}

function CardSkeleton() {
  return (
    <div className="w-full animate-pulse overflow-hidden rounded-2xl shadow-sm">
      <div className="flex items-center gap-3 bg-gray-100 px-4 py-3.5">
        <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-28 rounded bg-gray-200" />
          <div className="h-2.5 w-20 rounded bg-gray-200" />
        </div>
        <div className="h-4 w-16 rounded-full bg-gray-200" />
      </div>
      <div className="border border-t-0 border-gray-100 bg-white px-4 py-3">
        <div className="h-4 w-24 rounded bg-gray-200" />
        <div className="mt-1 h-2.5 w-12 rounded bg-gray-100" />
      </div>
    </div>
  );
}

function CompanyLogo({ logoUrl, name, size = 'sm' }: { logoUrl?: string | null; name: string; size?: 'sm' | 'xs' }) {
  const [err, setErr] = useState(false);
  const dim = size === 'xs' ? 'h-4 w-4' : 'h-5 w-5';
  if (logoUrl && !err) {
    return <img src={logoUrl} alt={name} onError={() => setErr(true)} className={`${dim} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-gray-200 text-[8px] font-bold uppercase text-gray-500`}>
      {name.charAt(0)}
    </span>
  );
}

function BranchDropdown({
  branches,
  selectedId,
  onChange,
  companyGroups,
}: {
  branches: PayslipListItem[];
  selectedId: string | null;
  onChange: (id: string) => void;
  companyGroups: SelectorCompanyGroup[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = branches.find((b) => b.id === selectedId) ?? branches[0];

  const companyByBranchName = useMemo(() => {
    const map = new Map<string, SelectorCompanyGroup>();
    for (const group of companyGroups) {
      for (const branch of group.branches) {
        map.set(branch.name, group);
      }
    }
    return map;
  }, [companyGroups]);

  const grouped = useMemo(() => {
    const map = new Map<string, { group: SelectorCompanyGroup | null; items: PayslipListItem[] }>();
    for (const branch of branches) {
      const companyGroup = companyByBranchName.get(branch.company_name) ?? null;
      const key = branch.company_name.replace(/\s+(Main Branch|Starmills.*|Bacolor.*|Guagua.*|CSFP.*)$/i, '').trim();
      const companyKey = companyGroup?.name ?? key;
      if (!map.has(companyKey)) map.set(companyKey, { group: companyGroup, items: [] });
      map.get(companyKey)!.items.push(branch);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, ...value }));
  }, [branches, companyByBranchName]);

  const selectedCompany = companyByBranchName.get(selected.company_name) ?? null;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left shadow-sm transition-colors hover:border-gray-300 focus:outline-none"
      >
        <div className="flex min-w-0 items-center gap-2">
          <CompanyLogo logoUrl={selectedCompany?.logoUrl} name={selected.company_name} size="xs" />
          <span className="truncate text-sm font-medium text-gray-800">{selected.company_name}</span>
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: selectedCompany?.themeColor ?? '#f59e0b' }}
          />
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          >
            {grouped.map(({ name, group, items }) => (
              <div key={name}>
                <div className="flex items-center gap-2 border-b border-gray-50 bg-gray-50 px-3 py-2">
                  <CompanyLogo logoUrl={group?.logoUrl} name={name} size="sm" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{name}</span>
                </div>
                {items.map((branch) => {
                  const isActive = branch.id === selectedId;
                  return (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => {
                        if (!isActive) onChange(branch.id);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-2.5 py-2.5 pl-9 pr-3 text-left text-sm transition-colors ${
                        isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: group?.themeColor ?? '#f59e0b' }}
                      />
                      <span className="flex-1 truncate font-medium">{branch.company_name}</span>
                      {isActive && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary-400">Selected</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PeriodDropdown({
  activePeriod,
  period,
  onChange,
}: {
  activePeriod: PayrollOverviewPeriodOption;
  period: PayrollOverviewPeriod | null;
  onChange: (period: PayrollOverviewPeriodOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeOption = PERIOD_OPTIONS.find((option) => option.id === activePeriod) ?? PERIOD_OPTIONS[0];
  const periodLabel = period ? formatPeriodHeader(period.dateFrom, period.dateTo, period.cutoff) : 'Loading payroll period...';
  const alternatePeriodLabel = useMemo(() => {
    if (!period) return 'Loading payroll period...';
    const adjacentPeriod = getRelativePayrollPeriod(
      period,
      activePeriod === 'current' ? 'previous' : 'next',
    );
    return formatPeriodHeader(adjacentPeriod.dateFrom, adjacentPeriod.dateTo, adjacentPeriod.cutoff);
  }, [activePeriod, period]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-left text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 sm:w-auto sm:justify-start"
      >
        <span className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0" />
          <span className="truncate whitespace-nowrap">{activeOption.label}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg sm:left-auto sm:right-0 sm:w-[320px] sm:max-w-[calc(100vw-2rem)]"
          >
            {PERIOD_OPTIONS.map((option) => {
              const isActive = option.id === activePeriod;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    if (!isActive) onChange(option.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors ${
                    isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium">{option.label}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {option.id === activePeriod ? periodLabel : alternatePeriodLabel}
                    </p>
                  </div>
                  {isActive ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary-400">Selected</span>
                  ) : null}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PayrollOverviewTab() {
  const { error: showError } = useAppToast();
  const { hasPermission } = usePermission();
  const { selectedBranchIds, companyBranchGroups } = useBranchStore();
  const pageSize = usePageSize();
  const canManage = hasPermission(PERMISSIONS.PAYSLIPS_MANAGE);

  const [items, setItems] = useState<PayslipListItem[]>([]);
  const [period, setPeriod] = useState<PayrollOverviewPeriod | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [activeStatusTab, setActiveStatusTab] = useState<PayrollOverviewStatusTab>('all');
  const [activePeriod, setActivePeriod] = useState<PayrollOverviewPeriodOption>('current');
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationReport, setValidationReport] = useState<PayrollOverviewValidationResponse | null>(null);

  const [selectedGroup, setSelectedGroup] = useState<GroupedEmployee | null>(null);
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<PayslipDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const resetSelection = useCallback(() => {
    setSelectedGroup(null);
    setSelectedPayslipId(null);
    setSelectedDetail(null);
  }, []);

  const applyOverviewData = useCallback((data: PayrollOverviewResponse) => {
    setItems(data.items.filter((payslip) => !/pos\s*system/i.test(payslip.employee_name)));
    setPeriod(data.period);
    setPage(1);
  }, []);

  const loadOverview = useCallback(
    () =>
      fetchPayrollOverview({
        branchIds: selectedBranchIds.length > 0 ? selectedBranchIds : undefined,
        period: activePeriod,
      }),
    [activePeriod, selectedBranchIds],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    resetSelection();

    void loadOverview()
      .then((data) => {
        if (!active) return;
        applyOverviewData(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
        showError(axiosErr?.response?.data?.error ?? axiosErr?.response?.data?.message ?? 'Failed to load payroll overview.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [applyOverviewData, loadOverview, resetSelection, showError]);

  const refreshOverviewAfterValidation = useCallback(async () => {
    setLoading(true);
    resetSelection();

    try {
      const data = await loadOverview();
      applyOverviewData(data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
      showError(
        axiosErr?.response?.data?.error ??
        axiosErr?.response?.data?.message ??
        'Payroll was validated, but the overview could not be refreshed.',
      );
    } finally {
      setLoading(false);
    }
  }, [applyOverviewData, loadOverview, resetSelection, showError]);

  const handleValidatePayroll = useCallback(async () => {
    if (!canManage || validationLoading) return;

    setValidationLoading(true);

    try {
      const report = await validatePayrollOverview({
        branchIds: selectedBranchIds.length > 0 ? selectedBranchIds : undefined,
        period: activePeriod,
      });
      setValidationReport(report);
      await refreshOverviewAfterValidation();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
      showError(
        axiosErr?.response?.data?.error ??
        axiosErr?.response?.data?.message ??
        'Failed to validate payroll.',
      );
    } finally {
      setValidationLoading(false);
    }
  }, [
    activePeriod,
    canManage,
    refreshOverviewAfterValidation,
    selectedBranchIds,
    showError,
    validationLoading,
  ]);

  useEffect(() => {
    if (!selectedPayslipId) {
      setSelectedDetail(null);
      return;
    }

    let active = true;
    setDetailLoading(true);

    void api.get(`/dashboard/payslips/${encodeURIComponent(selectedPayslipId)}`)
      .then((response) => {
        if (!active) return;
        const detail = response.data.data as PayslipDetailResponse;
        setSelectedDetail(detail);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
        showError(axiosErr?.response?.data?.error ?? axiosErr?.response?.data?.message ?? 'Failed to load payslip detail.');
        setSelectedPayslipId(null);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedPayslipId, showError]);

  useEffect(() => {
    setPage(1);
    setSelectedGroup(null);
    setSelectedPayslipId(null);
    setSelectedDetail(null);
  }, [activeStatusTab]);

  const grouped = useMemo(() => buildGroupedEmployees(items), [items]);

  const branchColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of companyBranchGroups) {
      if (!group.themeColor) continue;
      for (const branch of group.branches) {
        map.set(branch.name, group.themeColor);
      }
    }
    return map;
  }, [companyBranchGroups]);

  const filteredGroups = useMemo(
    () => grouped.filter((group) => matchesPayrollOverviewStatusTab(group, activeStatusTab)),
    [activeStatusTab, grouped],
  );

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const paginatedGroups = filteredGroups.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  const handleSelect = useCallback((group: GroupedEmployee) => {
    setSelectedGroup(group);
    const primary = resolvePrimaryPayslip(group.branches, activeStatusTab === 'all' ? null : activeStatusTab);
    setSelectedPayslipId(primary?.id ?? null);
    setSelectedDetail(null);
  }, [activeStatusTab]);

  const handleClosePanel = useCallback(() => {
    setSelectedGroup(null);
    setSelectedPayslipId(null);
    setSelectedDetail(null);
  }, []);

  const periodLabel = useMemo(() => {
    if (!period) return activePeriod === 'current' ? 'Current period' : 'Previous period';
    return formatPeriodHeader(period.dateFrom, period.dateTo, period.cutoff);
  }, [activePeriod, period]);

  const emptyStateLabel = activeStatusTab === 'all'
    ? `No payslips found for ${periodLabel}.`
    : `No ${activeStatusTab.replace('_', ' ')} payslips found for ${periodLabel}.`;

  const panelOpen = Boolean(selectedGroup);

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <ViewToggle
            options={STATUS_TABS}
            activeId={activeStatusTab}
            onChange={setActiveStatusTab}
            layoutId="payroll-status-tabs"
            className="sm:flex-1"
            labelAboveOnMobile
            size="compact"
          />

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {canManage ? (
              <button
                type="button"
                onClick={handleValidatePayroll}
                disabled={validationLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
              >
                {validationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span>{validationLoading ? 'Validating...' : 'Validate Payroll'}</span>
              </button>
            ) : null}
            <PeriodDropdown
              activePeriod={activePeriod}
              period={period}
              onChange={setActivePeriod}
            />
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, index) => <CardSkeleton key={index} />)}
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <FileText className="h-4 w-4 shrink-0 text-gray-300" />
            <p className="text-sm text-gray-400">{emptyStateLabel}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {paginatedGroups.map((group) => (
                <PayrollOverviewCard
                  key={group.employee_id}
                  group={group}
                  selected={group.employee_id === selectedGroup?.employee_id}
                  onSelect={handleSelect}
                  displayStatus={resolvePayrollOverviewDisplayStatus(group, activeStatusTab)}
                  branchColorMap={branchColorMap}
                />
              ))}
            </div>
            {totalPages > 1 ? (
              <div className="flex justify-center pt-2">
                <Pagination currentPage={clampedPage} totalPages={totalPages} onPageChange={setPage} />
              </div>
            ) : null}
          </div>
        )}
      </div>

      <AnimatePresence>
        {validationReport ? (
          <PayrollValidationReportModal
            report={validationReport}
            onClose={() => setValidationReport(null)}
          />
        ) : null}
      </AnimatePresence>

      {createPortal(
        <AnimatePresence>
          {panelOpen && selectedGroup ? (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
                onClick={handleClosePanel}
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[680px] flex-col overflow-hidden bg-white shadow-2xl"
              >
                <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {stripEmployeeNumber(selectedGroup.employee_name)}
                    </h2>
                    {(() => {
                      const fallbackBranch = resolvePrimaryPayslip(
                        selectedGroup.branches,
                        activeStatusTab === 'all' ? null : activeStatusTab,
                      );
                      const activeBranch = selectedGroup.branches.find((branch) => branch.id === selectedPayslipId)
                        ?? fallbackBranch
                        ?? selectedGroup.branches[0];
                      const activeBranchStatus = resolveGroupedEmployeeStatus([activeBranch]);
                      return (
                        <p className="text-xs text-gray-500">
                          {activeBranch.cutoff === 1 ? '1st' : '2nd'} Cutoff
                          {' · '}
                          {activeBranch.company_name}
                          {' · '}
                          {activeBranch.date_from} to {activeBranch.date_to}
                          {' · '}
                          {activeBranchStatus === 'on_hold'
                            ? 'On Hold'
                            : activeBranchStatus === 'completed'
                              ? 'Completed'
                              : activeBranchStatus === 'draft'
                                ? 'Draft'
                                : 'Pending'}
                        </p>
                      );
                    })()}
                  </div>
                  <button
                    type="button"
                    onClick={handleClosePanel}
                    className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    aria-label="Close payslip detail"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {selectedGroup.branches.length > 1 ? (
                  <div className="border-b border-gray-100 bg-gray-50/60 px-6 py-3">
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Branch</p>
                    <BranchDropdown
                      branches={selectedGroup.branches}
                      selectedId={selectedPayslipId}
                      companyGroups={companyBranchGroups}
                      onChange={(id) => {
                        setSelectedDetail(null);
                        setSelectedPayslipId(id);
                      }}
                    />
                  </div>
                ) : null}

                <PayrollManagementDetailPanel detail={selectedDetail} loading={detailLoading} />
              </motion.div>
            </>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

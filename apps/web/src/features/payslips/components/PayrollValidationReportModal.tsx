import type {
  PayrollOverviewPeriod,
  PayrollOverviewValidationItem,
  PayrollOverviewValidationResponse,
} from '@omnilert/shared';
import { AlertTriangle, CalendarDays, CheckCircle2, X } from 'lucide-react';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';

function formatPeriodHeader(period: PayrollOverviewPeriod): string {
  const from = new Date(period.dateFrom);
  const to = new Date(period.dateTo);
  const fmt = (value: Date) =>
    value.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
  const cutoffLabel = period.cutoff === 1 ? '1st Cutoff' : '2nd Cutoff';
  return `${fmt(from)} - ${fmt(to)} · ${cutoffLabel}`;
}

function stripEmployeeNumber(name: string): string {
  return name.replace(/^\d+\s*-\s*/, '').trim();
}

function getInitials(name: string): string {
  const cleaned = stripEmployeeNumber(name);
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

function blockerLabel(type: PayrollOverviewValidationItem['blockerTypes'][number]): string {
  return type === 'shift_authorization' ? 'Shift Authorization' : 'Adjustment Authorization';
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}

function ValidationLogItem({ item }: { item: PayrollOverviewValidationItem }) {
  const displayName = stripEmployeeNumber(item.employeeName);

  return (
    <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
      {item.avatarUrl ? (
        <img
          src={item.avatarUrl}
          alt={displayName}
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-rose-100"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-sm font-bold text-rose-600 ring-2 ring-rose-100">
          {getInitials(item.employeeName)}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">{displayName}</p>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
            {item.companyName}
          </span>
          {item.blockerTypes.map((type) => (
            <span
              key={type}
              className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700"
            >
              {blockerLabel(type)}
            </span>
          ))}
        </div>

        <div className="mt-2 space-y-1.5">
          {item.messages.map((message) => (
            <div key={message} className="flex items-start gap-2 text-sm text-gray-600">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
              <p>{message}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PayrollValidationReportModal({
  report,
  onClose,
}: {
  report: PayrollOverviewValidationResponse;
  onClose: () => void;
}) {
  const hasBlockers = report.summary.blockedPayslips > 0;

  return (
    <AnimatedModal onBackdropClick={onClose} maxWidth="max-w-3xl" zIndexClass="z-[60]">
      <div className="relative flex max-h-[88vh] flex-col overflow-hidden sm:max-h-[80vh]">
        <div className="flex items-start gap-3 border-b border-gray-200 px-4 py-4 sm:px-5">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              hasBlockers ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            {hasBlockers ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-gray-500">Payroll</p>
            <p className="font-semibold text-gray-900">Validation Report</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
              <CalendarDays className="h-4 w-4 shrink-0" />
              <span>{formatPeriodHeader(report.period)}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close validation report"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div
            className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${
              hasBlockers
                ? 'border-rose-100 bg-rose-50 text-rose-800'
                : 'border-emerald-100 bg-emerald-50 text-emerald-800'
            }`}
          >
            {hasBlockers
              ? `${report.summary.blockedPayslips} payslip${report.summary.blockedPayslips === 1 ? '' : 's'} were placed on hold for this validation run.`
              : 'No blockers found for this period.'}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <SummaryStat label="Scanned" value={report.summary.scannedPayslips} />
            <SummaryStat label="On Hold" value={report.summary.blockedPayslips} />
            <SummaryStat label="Cleared" value={report.summary.clearedPayslips} />
            <SummaryStat label="Shift Auth" value={report.summary.shiftAuthorizationBlocks} />
            <SummaryStat label="Adjustments" value={report.summary.payrollAdjustmentBlocks} />
          </div>

          {hasBlockers ? (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 sm:px-5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                  Validation Log
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {report.items.map((item) => (
                  <ValidationLogItem key={`${item.odooCompanyId}:${item.employeeOdooId}`} item={item} />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-gray-200 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </AnimatedModal>
  );
}

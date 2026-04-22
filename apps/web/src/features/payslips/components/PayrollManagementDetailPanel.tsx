import type { PayslipDetailResponse } from '@omnilert/shared';
import { Spinner } from '@/shared/components/ui/Spinner';

function formatPHP(amount: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

interface PayrollManagementDetailPanelProps {
  detail: PayslipDetailResponse | null;
  loading: boolean;
}

function LineRow({ label, amount, isDeduction = false, isBold = false }: {
  label: string;
  amount: number;
  isDeduction?: boolean;
  isBold?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between py-2 ${isBold ? '' : 'border-b border-gray-50'}`}>
      <span className={`text-sm ${isBold ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>
        {label}
      </span>
      <span className={`tabular-nums text-sm ${
        isBold ? 'font-bold text-gray-900' :
        isDeduction ? 'text-red-500 font-medium' : 'font-medium text-gray-800'
      }`}>
        {isDeduction && amount > 0 ? `− ${formatPHP(amount).replace(/^₱/, '₱')}` : formatPHP(amount)}
      </span>
    </div>
  );
}

function SectionLabel({ children, color = 'gray' }: { children: React.ReactNode; color?: 'green' | 'red' | 'gray' }) {
  const colorMap = {
    green: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    red: 'text-red-500 bg-red-50 border-red-100',
    gray: 'text-gray-500 bg-gray-50 border-gray-100',
  };
  return (
    <div className={`mb-1 inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${colorMap[color]}`}>
      {children}
    </div>
  );
}

export function PayrollManagementDetailPanel({ detail, loading }: PayrollManagementDetailPanelProps) {
  if (loading || !detail) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  const totalEarnings =
    detail.salary.taxable.reduce((s, l) => s + l.amount, 0) +
    detail.salary.nonTaxable.reduce((s, l) => s + l.amount, 0);
  const totalDeductions = detail.salary.deductions.reduce((s, l) => s + l.amount, 0);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Unofficial banner */}
      {detail.status !== 'completed' && (
        <div className="flex items-center gap-2 bg-amber-50 px-6 py-2.5 text-xs text-amber-700 border-b border-amber-100">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
          Unofficial record — official payslips are distributed by Finance via email.
        </div>
      )}

      <div className="space-y-6 px-6 py-5">

        {/* ── Attendance ── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Attendance</h3>
          </div>

          {detail.attendance.items.length === 0 ? (
            <p className="text-sm italic text-gray-300">No attendance records for this period.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    <th className="px-4 py-2.5 text-left">Type</th>
                    <th className="px-4 py-2.5 text-right">Days</th>
                    <th className="px-4 py-2.5 text-right">Hours</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {detail.attendance.items.map((item, i) => (
                    <tr key={i} className="text-sm">
                      <td className="px-4 py-2.5 text-gray-600">{item.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{item.days.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{item.hours.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-800">{formatPHP(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-100 bg-gray-50 text-sm font-semibold text-gray-700">
                    <td className="px-4 py-2.5">Total</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{detail.attendance.totalDays.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{detail.attendance.totalHours.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatPHP(detail.attendance.totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        {/* ── Salary breakdown ── */}
        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">Salary Breakdown</h3>

          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
            <div className="divide-y divide-gray-50">

              {/* Taxable */}
              {detail.salary.taxable.length > 0 && (
                <div className="px-4 pt-3 pb-2">
                  <SectionLabel color="green">Taxable</SectionLabel>
                  <div>
                    {detail.salary.taxable.map((item, i) => (
                      <LineRow key={i} label={item.description} amount={item.amount} />
                    ))}
                  </div>
                </div>
              )}

              {/* Non-taxable */}
              {detail.salary.nonTaxable.length > 0 && (
                <div className="px-4 pt-3 pb-2">
                  <SectionLabel color="green">Non-Taxable</SectionLabel>
                  <div>
                    {detail.salary.nonTaxable.map((item, i) => (
                      <LineRow key={i} label={item.description} amount={item.amount} />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty earnings state */}
              {detail.salary.taxable.length === 0 && detail.salary.nonTaxable.length === 0 && (
                <div className="px-4 py-3">
                  <SectionLabel color="green">Earnings</SectionLabel>
                  <p className="mt-2 text-sm italic text-gray-300">No earnings recorded yet.</p>
                </div>
              )}

              {/* Deductions */}
              <div className="px-4 pt-3 pb-2">
                <SectionLabel color="red">Deductions</SectionLabel>
                {detail.salary.deductions.length > 0 ? (
                  <div>
                    {detail.salary.deductions.map((item, i) => (
                      <LineRow key={i} label={item.description} amount={item.amount} isDeduction />
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm italic text-gray-300">No deductions for this period.</p>
                )}
              </div>

              {/* Subtotal row */}
              {(totalEarnings > 0 || totalDeductions > 0) && (
                <div className="bg-gray-50 px-4 py-2.5">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span className="tabular-nums">Gross earnings</span>
                    <span className="tabular-nums">{formatPHP(totalEarnings)}</span>
                  </div>
                  {totalDeductions > 0 && (
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Total deductions</span>
                      <span className="tabular-nums text-red-400">− {formatPHP(totalDeductions)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Net Pay ── */}
        <section>
          <div className="overflow-hidden rounded-xl bg-gradient-to-br from-[#4f6ef7] via-[#2d52f5] to-[#1a3be8]">
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Net Pay</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-white">
                {formatPHP(detail.netPay)}
              </p>
            </div>
            <div className="flex items-center gap-2 border-t border-white/10 bg-white/5 px-5 py-2.5">
              <span className={`h-1.5 w-1.5 rounded-full ${
                detail.status === 'completed' ? 'bg-green-400' :
                detail.status === 'draft' ? 'bg-blue-300' :
                detail.status === 'on_hold' ? 'bg-rose-400' : 'bg-amber-400'
              }`} />
              <span className="text-[11px] font-medium uppercase tracking-wider text-white/60">
                {detail.status === 'completed' ? 'Completed' :
                 detail.status === 'draft' ? 'Draft' :
                 detail.status === 'on_hold' ? 'On Hold' : 'Pending'}
              </span>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

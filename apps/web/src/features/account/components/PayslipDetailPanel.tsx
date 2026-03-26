import React from "react";
import type { PayslipDetailResponse } from "@omnilert/shared";
import { Spinner } from "@/shared/components/ui/Spinner";

/** Formats a number as Philippine Peso currency */
function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);
}

interface PayslipDetailPanelProps {
  /** Full payslip detail data, or null while loading */
  detail: PayslipDetailResponse | null;
  /** Whether the detail is currently loading */
  loading: boolean;
}

/**
 * Renders the full payslip breakdown inside the side panel.
 * Extracted from the original PayslipPage single-view implementation.
 */
export function PayslipDetailPanel({ detail, loading }: PayslipDetailPanelProps) {
  if (loading || !detail) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
      {/* Period */}
      <div className="text-sm text-gray-600">
        Period: <span className="font-medium text-gray-900">{detail.period}</span>
      </div>

      {/* Attendance Computation */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Attendance Computation</h3>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Name</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Days</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Hours</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Amount</th>
              </tr>
            </thead>
            <tbody>
              {detail.attendance.items.map((item, index) => (
                <tr key={index} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-700">{item.name}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{item.days.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{item.hours.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-700">
                    {formatPHP(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-medium">
              <tr className="border-t border-gray-200">
                <td className="px-3 py-2 text-gray-700">Total</td>
                <td className="px-3 py-2 text-right text-gray-700">
                  {detail.attendance.totalDays.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right text-gray-700">
                  {detail.attendance.totalHours.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right text-gray-700">
                  {formatPHP(detail.attendance.totalAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Salary Computation */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Salary Computation</h3>

        {/* Taxable Salary */}
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-medium uppercase text-green-700">Taxable Salary</h4>
          {detail.salary.taxable.length > 0 ? (
            <div className="space-y-1 rounded border border-gray-200 p-3">
              {detail.salary.taxable.map((item, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className="text-gray-600">{item.description}</span>
                  <span className="font-medium">{formatPHP(item.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-gray-400">No taxable earnings yet.</p>
          )}
        </div>

        {/* Non-Taxable Salary */}
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-medium uppercase text-green-700">Non-Taxable Salary</h4>
          {detail.salary.nonTaxable.length > 0 ? (
            <div className="space-y-1 rounded border border-gray-200 p-3">
              {detail.salary.nonTaxable.map((item, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className="text-gray-600">{item.description}</span>
                  <span className="font-medium">{formatPHP(item.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-gray-400">No non-taxable earnings yet.</p>
          )}
        </div>

        {/* Deductions */}
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-medium uppercase text-red-700">Deductions</h4>
          {detail.salary.deductions.length > 0 ? (
            <div className="space-y-1 rounded border border-gray-200 p-3">
              {detail.salary.deductions.map((item, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className="text-gray-600">{item.description}</span>
                  <span className="font-medium text-red-600">{formatPHP(item.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-gray-400">No deductions for this payslip.</p>
          )}
        </div>

        {/* Net Pay */}
        <div className="mt-4 rounded-lg bg-primary-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-primary-800">Net Pay</span>
            <span className="text-2xl font-bold text-primary-700">
              {formatPHP(detail.netPay)}
            </span>
          </div>
        </div>
      </div>

      {/* Disclaimer — only shown for draft/pending payslips that may still change */}
      {detail.status !== "completed" && (
        <div className="rounded bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">
          This payslip may not be accurate. Official payslips are distributed by the Finance
          Department through email.
        </div>
      )}
    </div>
  );
}

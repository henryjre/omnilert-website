import { useState, useEffect } from "react";
import { Button } from "@/shared/components/ui/Button";
import { X } from "lucide-react";

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];
const PESO_SYMBOL = "\u20B1";

const DENOMINATION_STYLES: Record<number, { textColor: string; backgroundColor: string; borderColor: string }> = {
  1000: { textColor: "#1F6FA3", backgroundColor: "#DDEFFC", borderColor: "#9DC8E3" },
  500: { textColor: "#8A6A00", backgroundColor: "#FFF7CC", borderColor: "#EEDC7A" },
  200: { textColor: "#4F7F1A", backgroundColor: "#EAF6D2", borderColor: "#B9D87A" },
  100: { textColor: "#473B76", backgroundColor: "#E8E3F4", borderColor: "#B6AAD8" },
  50: { textColor: "#B8254E", backgroundColor: "#FCE1E8", borderColor: "#F3A2B8" },
  20: { textColor: "#B55D00", backgroundColor: "#FFE9CF", borderColor: "#F4B46A" },
  10: { textColor: "#4F6070", backgroundColor: "#E9EDF2", borderColor: "#BEC8D3" },
  5: { textColor: "#4F6070", backgroundColor: "#E9EDF2", borderColor: "#BEC8D3" },
  1: { textColor: "#4F6070", backgroundColor: "#E9EDF2", borderColor: "#BEC8D3" },
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

interface BreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (quantities: Record<number, number>) => void;
  initialQuantities?: Record<number, number>;
  expectedAmount?: number | null;
}

/**
 * Modal component for entering denomination breakdown for CF/PCF verifications.
 * Displays a 3-column grid of denomination inputs with a running total.
 */
export function BreakdownModal({
  isOpen,
  onClose,
  onConfirm,
  initialQuantities = {},
  expectedAmount,
}: BreakdownModalProps) {
  const [quantities, setQuantities] = useState<Record<number, number>>(() =>
    Object.fromEntries(DENOMINATIONS.map((d) => [d, initialQuantities[d] || 0])),
  );

  // Update quantities when initialQuantities changes (e.g., when editing existing breakdown)
  useEffect(() => {
    setQuantities(
      Object.fromEntries(DENOMINATIONS.map((d) => [d, initialQuantities[d] || 0])),
    );
  }, [initialQuantities, isOpen]);

  // Calculate running total
  const total = DENOMINATIONS.reduce((sum, d) => sum + d * (quantities[d] || 0), 0);

  const handleConfirm = () => {
    onConfirm(quantities);
    onClose();
  };

  const handleCancel = () => {
    // Reset to initial values on cancel
    setQuantities(
      Object.fromEntries(DENOMINATIONS.map((d) => [d, initialQuantities[d] || 0])),
    );
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={handleCancel} />

      {/* Modal */}
      <div className="relative max-h-[90vh] w-[calc(100vw-1rem)] max-w-md overflow-y-auto rounded-xl bg-white p-4 text-gray-900 shadow-xl sm:p-6 dark:border dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between sm:mb-4">
          <h3 className="text-base font-semibold text-gray-900 sm:text-lg dark:text-slate-100">Enter Denomination Breakdown</h3>
          <button
            onClick={handleCancel}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Responsive Denomination Grid */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-x-4">
          {DENOMINATIONS.map((denom) => {
            const style = DENOMINATION_STYLES[denom];
            return (
              <div
                key={denom}
                className="flex items-center justify-between gap-2 rounded-lg border border-gray-200/80 bg-white/70 px-2 py-1.5 dark:border-slate-700/70 dark:bg-slate-900/40 sm:justify-start sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0"
              >
                <span
                  className="w-16 rounded-md border px-1.5 py-1 text-right text-sm font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  style={{
                    color: style.textColor,
                    backgroundColor: style.backgroundColor,
                    borderColor: style.borderColor,
                  }}
                >
                  {PESO_SYMBOL}{denom.toLocaleString()}
                </span>
                <input
                  type="number"
                  min={0}
                  value={quantities[denom] || 0}
                  onChange={(e) =>
                    setQuantities((prev) => ({
                      ...prev,
                      [denom]: Math.max(0, parseInt(e.target.value) || 0),
                    }))
                  }
                  className="h-9 w-20 rounded border border-gray-300 bg-white px-2 py-1.5 text-right text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:h-auto sm:w-16 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-primary-400 dark:focus:ring-primary-400"
                />
              </div>
            );
          })}
        </div>

        {/* Running Total / Summary */}
        <div className="mb-4 space-y-1.5 rounded-lg bg-gray-50 p-3 sm:mb-6 dark:bg-slate-800/70">
          {expectedAmount != null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-slate-400">Expected:</span>
              <span className="font-medium text-gray-700 dark:text-slate-200">
                {PESO_SYMBOL}{fmt(expectedAmount)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600 dark:text-slate-300">Counted:</span>
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              {PESO_SYMBOL}{fmt(total)}
            </span>
          </div>
          {expectedAmount != null && (() => {
            const diff = total - expectedAmount;
            return (
              <div className="flex items-center justify-between border-t border-gray-200 pt-1.5 text-sm dark:border-slate-700">
                <span className="text-gray-500 dark:text-slate-400">Difference:</span>
                <span className={`font-semibold ${diff === 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {diff >= 0 ? '+' : '-'}{PESO_SYMBOL}{fmt(Math.abs(diff))}
                </span>
              </div>
            );
          })()}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
          <Button variant="secondary" onClick={handleCancel} className="h-10 w-full sm:h-auto sm:flex-1">
            Cancel
          </Button>
          <Button variant="success" onClick={handleConfirm} className="h-10 w-full sm:h-auto sm:flex-1" disabled={total === 0}>
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}

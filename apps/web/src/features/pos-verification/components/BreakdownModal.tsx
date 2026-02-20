import { useState, useEffect } from "react";
import { Button } from "@/shared/components/ui/Button";
import { X } from "lucide-react";

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

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
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Enter Denomination Breakdown</h3>
          <button
            onClick={handleCancel}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 3-Column Denomination Grid */}
        <div className="mb-4 grid grid-cols-3 gap-x-4">
          {[[1000, 500, 200], [100, 50, 20], [10, 5, 1]].map((col, ci) => (
            <div key={ci} className="space-y-2">
              {col.map((denom) => (
                <div key={denom} className="flex items-center gap-2">
                  <span className="w-16 text-right text-sm font-medium text-gray-700">
                    ₱{denom.toLocaleString()}
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
                    className="w-16 rounded border border-gray-300 px-2 py-1.5 text-sm text-right focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Running Total / Summary */}
        <div className="mb-6 rounded-lg bg-gray-50 p-3 space-y-1.5">
          {expectedAmount != null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Expected:</span>
              <span className="font-medium text-gray-700">
                ₱{fmt(expectedAmount)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">Counted:</span>
            <span className="text-lg font-bold text-gray-900">
              ₱{fmt(total)}
            </span>
          </div>
          {expectedAmount != null && (() => {
            const diff = total - expectedAmount;
            return (
              <div className="flex items-center justify-between border-t border-gray-200 pt-1.5 text-sm">
                <span className="text-gray-500">Difference:</span>
                <span className={`font-semibold ${diff === 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {diff >= 0 ? '+' : '-'}₱{fmt(Math.abs(diff))}
                </span>
              </div>
            );
          })()}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={handleCancel} className="flex-1">
            Cancel
          </Button>
          <Button variant="success" onClick={handleConfirm} className="flex-1" disabled={total === 0}>
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}

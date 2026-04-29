import type { AicProduct } from '@omnilert/shared';
import { AlertTriangle, ArrowDown, ArrowUp, Minus, Settings } from 'lucide-react';

interface AicProductsSectionProps {
  products: AicProduct[];
}

export function AicProductsSection({ products }: AicProductsSectionProps) {
  if (products.length === 0) {
    return (
      <div className="text-sm text-gray-400 italic">No flagged products.</div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">UOM</th>
              <th className="px-3 py-2">Direction</th>
              <th className="px-3 py-2">Flag</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {products.map((p) => (
            <tr key={p.id} className="bg-white">
              <td className="px-3 py-2 font-medium text-gray-800">{p.product_name}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700">{p.quantity}</td>
              <td className="px-3 py-2 text-right text-gray-500">{p.uom_name}</td>
              <td className="px-3 py-2">
                {p.discrepancy_direction === 'negative' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                    <ArrowDown className="h-3 w-3" />
                    Shortage
                  </span>
                ) : p.discrepancy_direction === 'positive' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    <ArrowUp className="h-3 w-3" />
                    Surplus
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    <Minus className="h-3 w-3" />
                    Neutral
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                {p.flag_type === 'threshold_violation' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    <AlertTriangle className="h-3 w-3" />
                    Violation
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    <Settings className="h-3 w-3" />
                    No Threshold
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

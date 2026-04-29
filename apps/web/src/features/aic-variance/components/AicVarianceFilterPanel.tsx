import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import type { AicFilters } from '../services/aicVariance.api';

interface AicVarianceFilterPanelProps {
  draft: AicFilters;
  onChange: (next: AicFilters) => void;
  onApply: () => void;
  onClear: () => void;
  onCancel: () => void;
}

export function AicVarianceFilterPanel({
  draft,
  onChange,
  onApply,
  onClear,
  onCancel,
}: AicVarianceFilterPanelProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Input
          label="Search"
          value={draft.search ?? ''}
          onChange={(e) => onChange({ ...draft, search: e.target.value })}
          placeholder="Reference, AIC number"
        />
        <Input
          label="Date From"
          type="date"
          value={draft.date_from ?? ''}
          onChange={(e) => onChange({ ...draft, date_from: e.target.value })}
        />
        <Input
          label="Date To"
          type="date"
          value={draft.date_to ?? ''}
          onChange={(e) => onChange({ ...draft, date_to: e.target.value })}
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Sort Order</label>
          <select
            value={draft.sort_order ?? 'desc'}
            onChange={(e) => onChange({ ...draft, sort_order: e.target.value as 'asc' | 'desc' })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="secondary" onClick={onClear}>Clear</Button>
        <Button onClick={onApply}>Apply</Button>
      </div>
    </div>
  );
}

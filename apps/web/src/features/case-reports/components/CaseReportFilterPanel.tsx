import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import type { CaseReportFilters } from '../services/caseReport.api';

interface CaseReportFilterPanelProps {
  draft: CaseReportFilters;
  onChange: (next: CaseReportFilters) => void;
  onApply: () => void;
  onClear: () => void;
  onCancel: () => void;
}

export function CaseReportFilterPanel({
  draft,
  onChange,
  onApply,
  onClear,
  onCancel,
}: CaseReportFilterPanelProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Input
          label="Search"
          value={draft.search ?? ''}
          onChange={(event) => onChange({ ...draft, search: event.target.value })}
          placeholder="Title, description, case number"
        />
        <Input
          label="Date From"
          type="date"
          value={draft.date_from ?? ''}
          onChange={(event) => onChange({ ...draft, date_from: event.target.value })}
        />
        <Input
          label="Date To"
          type="date"
          value={draft.date_to ?? ''}
          onChange={(event) => onChange({ ...draft, date_to: event.target.value })}
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Sort Order</label>
          <select
            value={draft.sort_order ?? 'desc'}
            onChange={(event) => onChange({ ...draft, sort_order: event.target.value as 'asc' | 'desc' })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={Boolean(draft.vn_only)}
            onChange={(event) => onChange({ ...draft, vn_only: event.target.checked })}
          />
          VN requested only
        </label>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="secondary" onClick={onClear}>Clear</Button>
          <Button onClick={onApply}>Apply</Button>
        </div>
      </div>
    </div>
  );
}

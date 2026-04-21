import { useMemo, useState } from 'react';
import { useBranchStore } from '@/shared/store/branchStore';
import { useAppToast } from '@/shared/hooks/useAppToast';

type DeductionType = 'Damages' | 'Penalties';

interface MockEmployee {
  id: string;
  name: string;
}

interface MockRecord {
  id: string;
  employeeName: string;
  branchName: string;
  type: DeductionType;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  date: string;
}

const MOCK_EMPLOYEES: MockEmployee[] = [
  { id: 'e1', name: 'Juan Dela Cruz' },
  { id: 'e2', name: 'Maria Santos' },
  { id: 'e3', name: 'Pedro Reyes' },
];

const MOCK_RECORDS: MockRecord[] = [
  { id: 'r1', employeeName: 'Juan Dela Cruz', branchName: 'Main Branch', type: 'Damages', amount: 500, reason: 'Broken equipment', status: 'pending', date: '2026-04-01' },
  { id: 'r2', employeeName: 'Maria Santos', branchName: 'Main Branch', type: 'Penalties', amount: 250, reason: 'Late submission', status: 'approved', date: '2026-04-05' },
  { id: 'r3', employeeName: 'Pedro Reyes', branchName: 'North Branch', type: 'Damages', amount: 1500, reason: 'Cash shortage', status: 'rejected', date: '2026-04-10' },
  { id: 'r4', employeeName: 'Maria Santos', branchName: 'Main Branch', type: 'Penalties', amount: 100, reason: 'Dress code violation', status: 'pending', date: '2026-04-15' },
];

function formatPHP(amount: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

function StatusBadge({ status }: { status: MockRecord['status'] }) {
  const config = {
    pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
    approved: { label: 'Approved', className: 'bg-green-50 text-green-700 ring-green-200' },
    rejected: { label: 'Rejected', className: 'bg-red-50 text-red-700 ring-red-200' },
  }[status];
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${config.className}`}>
      {config.label}
    </span>
  );
}

export function PayslipsIssuanceTab() {
  const { success: showSuccess } = useAppToast();
  const { companyBranchGroups, selectedBranchIds } = useBranchStore();

  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [type, setType] = useState<DeductionType>('Damages');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const availableBranches = useMemo(() => {
    return companyBranchGroups.flatMap((g) =>
      g.branches.filter((b) => selectedBranchIds.includes(b.id)),
    );
  }, [companyBranchGroups, selectedBranchIds]);

  const availableEmployees = useMemo(() => {
    if (!selectedBranchId) return [];
    return MOCK_EMPLOYEES;
  }, [selectedBranchId]);

  const handleBranchChange = (branchId: string) => {
    setSelectedBranchId(branchId);
    setSelectedEmployeeId('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    showSuccess('Deduction request submitted.');
    setSelectedBranchId('');
    setSelectedEmployeeId('');
    setType('Damages');
    setAmount('');
    setReason('');
  };

  const selectClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-400';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="space-y-6">
      {/* Deduction form */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Submit Deduction</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Branch */}
            <div>
              <label htmlFor="branch" className={labelClass}>Branch</label>
              <select
                id="branch"
                value={selectedBranchId}
                onChange={(e) => handleBranchChange(e.target.value)}
                className={selectClass}
                required
              >
                <option value="">Select a branch...</option>
                {availableBranches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Employee */}
            <div>
              <label htmlFor="employee" className={labelClass}>Employee</label>
              <select
                id="employee"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className={selectClass}
                disabled={!selectedBranchId}
                required
              >
                <option value="">Select an employee...</option>
                {availableEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div>
              <label htmlFor="type" className={labelClass}>Type</label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as DeductionType)}
                className={selectClass}
                required
              >
                <option value="Damages">Damages</option>
                <option value="Penalties">Penalties</option>
              </select>
            </div>

            {/* Amount */}
            <div>
              <label htmlFor="amount" className={labelClass}>Amount (₱)</label>
              <input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={selectClass}
                required
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label htmlFor="reason" className={labelClass}>Reason</label>
            <textarea
              id="reason"
              rows={3}
              placeholder="Enter reason..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={selectClass}
              required
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
            >
              Submit Deduction
            </button>
          </div>
        </form>
      </div>

      {/* Records table */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Records</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MOCK_RECORDS.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{record.employeeName}</td>
                  <td className="px-4 py-3 text-gray-600">{record.branchName}</td>
                  <td className="px-4 py-3 text-gray-600">{record.type}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">{formatPHP(record.amount)}</td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-gray-600">{record.reason}</td>
                  <td className="px-4 py-3"><StatusBadge status={record.status} /></td>
                  <td className="px-4 py-3 text-gray-500">{record.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

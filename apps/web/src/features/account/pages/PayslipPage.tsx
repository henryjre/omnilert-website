import { useEffect, useState, useRef } from 'react';
import { Card, CardHeader, CardBody } from '@/shared/components/ui/Card';
import { Spinner } from '@/shared/components/ui/Spinner';
import { Button } from '@/shared/components/ui/Button';
import { api } from '@/shared/services/api.client';
import { ChevronDown, RefreshCw } from 'lucide-react';

export function PayslipPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [allBranches, setAllBranches] = useState<any[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [cutoffDropdownOpen, setCutoffDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const cutoffDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedBranchOdooId, setSelectedBranchOdooId] = useState<string>('');

  // Calculate default cutoff based on current date
  const today = new Date().getDate();
  const [selectedCutoff, setSelectedCutoff] = useState<number>(today > 16 ? 2 : 1);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (cutoffDropdownRef.current && !cutoffDropdownRef.current.contains(e.target as Node)) {
        setCutoffDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch all branches for payslip controls (includes inactive)
  useEffect(() => {
    setBranchesLoading(true);
    api
      .get('/dashboard/payslip-branches')
      .then((res) => setAllBranches(res.data.data || []))
      .catch(() => setAllBranches([]))
      .finally(() => setBranchesLoading(false));
  }, []);

  const fetchPayslip = (isRefresh = false) => {
    if (!selectedBranchOdooId) return;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(false);
    api
      .get('/dashboard/payslip', { params: { companyId: selectedBranchOdooId, cutoff: selectedCutoff } })
      .then((res) => setData(res.data.data))
      .catch(() => {
        setData(null);
        setError(true);
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  // Initialize selected branch
  useEffect(() => {
    if (allBranches.length > 0 && !selectedBranchOdooId) {
      const firstWithOdooId = allBranches.find((b) => b.odoo_branch_id);
      if (firstWithOdooId?.odoo_branch_id) {
        setSelectedBranchOdooId(firstWithOdooId.odoo_branch_id);
      } else {
        // No selectable Odoo branch IDs; avoid perpetual loading state.
        setLoading(false);
      }
    } else if (allBranches.length === 0) {
      setLoading(false);
    }
  }, [allBranches, selectedBranchOdooId]);

  const branchOptions = allBranches
    .slice()
    .sort((a, b) => parseInt(a.odoo_branch_id || '0', 10) - parseInt(b.odoo_branch_id || '0', 10))
    .map((b) => ({ ...b, id: b.id }));

  useEffect(() => {
    if (!selectedBranchOdooId) return;
    fetchPayslip();
  }, [selectedBranchOdooId, selectedCutoff]);

  const selectedBranch = branchOptions.find((b) => b.odoo_branch_id === selectedBranchOdooId);
  const branchLabel = selectedBranch?.name ?? 'Select branch';
  const cutoffLabel = selectedCutoff === 1 ? '1st Cutoff' : '2nd Cutoff';
  const isSecondCutoffDisabled = today <= 16;

  if (branchesLoading || loading) {
    return (
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Payslip Details</h2>
        </CardHeader>
        <CardBody className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Payslip Details</h2>
          <div className="flex items-center gap-2">
            {/* Custom Branch Dropdown */}
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
              >
                {branchLabel}
                <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 z-50 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  {branchOptions.map((branch) => (
                    <button
                      key={branch.id}
                      onClick={() => {
                        setSelectedBranchOdooId(branch.odoo_branch_id);
                        setDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                        selectedBranchOdooId === branch.odoo_branch_id
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-gray-700'
                      }`}
                    >
                      {branch.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Cutoff Dropdown */}
            <div ref={cutoffDropdownRef} className="relative">
              <button
                onClick={() => setCutoffDropdownOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
              >
                {cutoffLabel}
                <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${cutoffDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {cutoffDropdownOpen && (
                <div className="absolute right-0 z-50 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <button
                    onClick={() => {
                      setSelectedCutoff(1);
                      setCutoffDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                      selectedCutoff === 1 ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    1st Cutoff
                  </button>
                  <button
                    onClick={() => {
                      if (!isSecondCutoffDisabled) {
                        setSelectedCutoff(2);
                        setCutoffDropdownOpen(false);
                      }
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                      selectedCutoff === 2 ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700'
                    } ${isSecondCutoffDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    2nd Cutoff
                  </button>
                </div>
              )}
            </div>

            {/* Refresh Button with Animation */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fetchPayslip(true)}
              disabled={refreshing || !selectedBranchOdooId}
              title="Refresh payslip"
              className={refreshing ? 'animate-pulse' : ''}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        {error || !data ? (
          <p className="text-sm text-gray-500">No payslip data available.</p>
        ) : (
          <>
            {/* Period */}
            <div className="mb-4 text-sm text-gray-600">Period: {data?.period}</div>

            {/* Attendance Computation */}
            <div className="mb-6">
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
                    {data?.attendance?.items?.map((item: any, index: number) => (
                      <tr key={index} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-700">{item.name}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{item.days?.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{item.hours?.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-700">
                          {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-medium">
                    <tr className="border-t border-gray-200">
                      <td className="px-3 py-2 text-gray-700">Total</td>
                      <td className="px-3 py-2 text-right text-gray-700">{data?.attendance?.totalDays?.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{data?.attendance?.totalHours?.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(data?.attendance?.totalAmount)}
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
                <h4 className="mb-2 text-xs font-medium text-green-700 uppercase">Taxable Salary</h4>
                {data?.salary?.taxable?.length > 0 ? (
                  <div className="space-y-1 rounded border border-gray-200 p-3">
                    {data.salary.taxable.map((item: any, index: number) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span className="text-gray-600">{item.description}</span>
                        <span className="font-medium">
                          {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No taxable earnings yet.</p>
                )}
              </div>

              {/* Non-Taxable Salary */}
              <div className="mb-4">
                <h4 className="mb-2 text-xs font-medium text-green-700 uppercase">Non-Taxable Salary</h4>
                {data?.salary?.nonTaxable?.length > 0 ? (
                  <div className="space-y-1 rounded border border-gray-200 p-3">
                    {data.salary.nonTaxable.map((item: any, index: number) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span className="text-gray-600">{item.description}</span>
                        <span className="font-medium">
                          {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No non-taxable earnings yet.</p>
                )}
              </div>

              {/* Deductions */}
              <div className="mb-4">
                <h4 className="mb-2 text-xs font-medium text-red-700 uppercase">Deductions</h4>
                {data?.salary?.deductions?.length > 0 ? (
                  <div className="space-y-1 rounded border border-gray-200 p-3">
                    {data.salary.deductions.map((item: any, index: number) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span className="text-gray-600">{item.description}</span>
                        <span className="font-medium text-red-600">
                          {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No deductions for this payslip.</p>
                )}
              </div>

              {/* Net Pay */}
              <div className="mt-4 rounded-lg bg-primary-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold text-primary-800">Net Pay</span>
                  <span className="text-2xl font-bold text-primary-700">
                    {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(data?.netPay)}
                  </span>
                </div>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="mt-6 rounded bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">
              This payslip may not be accurate. Official payslips are distributed by the Finance Department through email.
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

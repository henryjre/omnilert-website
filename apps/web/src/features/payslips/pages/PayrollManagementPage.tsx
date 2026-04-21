import { useState } from 'react';
import { FileText, LayoutGrid, Send } from 'lucide-react';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import { PayrollOverviewTab } from '../components/PayrollOverviewTab';
import { PayrollIssuanceTab } from '../components/PayrollIssuanceTab';

type TabId = 'overview' | 'issuance';

const TABS: ViewOption<TabId>[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'issuance', label: 'Issuance', icon: Send },
];

export function PayrollManagementPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
        </div>
        <p className="mt-1 hidden text-sm text-gray-500 sm:block">
          Manage employee payroll, deductions, and issuances.
        </p>
      </div>
      <ViewToggle options={TABS} activeId={activeTab} onChange={setActiveTab} layoutId="payroll-tabs" />
      {activeTab === 'overview' && <PayrollOverviewTab />}
      {activeTab === 'issuance' && <PayrollIssuanceTab />}
    </div>
  );
}

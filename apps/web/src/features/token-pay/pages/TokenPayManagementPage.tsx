import { useState } from 'react';
import { Coins, LayoutGrid, Send } from 'lucide-react';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import { TokenPayOverviewTab } from '../components/TokenPayOverviewTab';
import { TokenPayIssuanceTab } from '../components/TokenPayIssuanceTab';

type TabId = 'overview' | 'issuance';

const TABS: ViewOption<TabId>[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'issuance', label: 'Issuance', icon: Send },
];

export function TokenPayManagementPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3">
          <Coins className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Token Pay</h1>
        </div>
        <p className="mt-1 hidden text-sm text-gray-500 sm:block">
          Manage employee token pay wallets, issuances, and account status.
        </p>
      </div>
      <ViewToggle
        options={TABS}
        activeId={activeTab}
        onChange={setActiveTab}
        layoutId="token-pay-tabs"
        labelAboveOnMobile
      />
      {activeTab === 'overview' && <TokenPayOverviewTab />}
      {activeTab === 'issuance' && <TokenPayIssuanceTab />}
    </div>
  );
}

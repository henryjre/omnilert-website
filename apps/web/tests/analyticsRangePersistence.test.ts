import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { AnalyticsRangeSelection } from '../src/features/employee-analytics/utils/analyticsRangeBuckets.ts';
import {
  restorePersistedAnalyticsRange,
  persistAnalyticsRange,
} from '../src/features/employee-analytics/utils/analyticsRangePersistence.ts';

class MemorySessionStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const FALLBACK_RANGE: AnalyticsRangeSelection = {
  granularity: 'day',
  rangeStartYmd: '2026-03-23',
  rangeEndYmd: '2026-04-06',
};

test('restorePersistedAnalyticsRange returns a normalized stored selection when valid', () => {
  const storage = new MemorySessionStorage();
  storage.setItem(
    'employee-analytics.range',
    JSON.stringify({
      granularity: 'month',
      rangeStartYmd: '2026-04-30',
      rangeEndYmd: '2026-04-01',
    }),
  );

  const restored = restorePersistedAnalyticsRange(
    'employee-analytics.range',
    FALLBACK_RANGE,
    storage,
  );

  assert.deepEqual(restored, {
    granularity: 'month',
    rangeStartYmd: '2026-04-01',
    rangeEndYmd: '2026-04-30',
  });
});

test('restorePersistedAnalyticsRange falls back when stored JSON is invalid', () => {
  const storage = new MemorySessionStorage();
  storage.setItem('employee-analytics.range', '{bad json');

  const restored = restorePersistedAnalyticsRange(
    'employee-analytics.range',
    FALLBACK_RANGE,
    storage,
  );

  assert.deepEqual(restored, FALLBACK_RANGE);
});

test('restorePersistedAnalyticsRange falls back when stored shape is malformed', () => {
  const storage = new MemorySessionStorage();
  storage.setItem(
    'employee-analytics.range',
    JSON.stringify({
      granularity: 'quarter',
      rangeStartYmd: 123,
      rangeEndYmd: null,
    }),
  );

  const restored = restorePersistedAnalyticsRange(
    'employee-analytics.range',
    FALLBACK_RANGE,
    storage,
  );

  assert.deepEqual(restored, FALLBACK_RANGE);
});

test('persistAnalyticsRange stores a normalized selection', () => {
  const storage = new MemorySessionStorage();

  persistAnalyticsRange(
    'employee-analytics.range',
    {
      granularity: 'week',
      rangeStartYmd: '2026-04-06',
      rangeEndYmd: '2026-03-31',
    },
    storage,
  );

  assert.equal(
    storage.getItem('employee-analytics.range'),
    JSON.stringify({
      granularity: 'week',
      rangeStartYmd: '2026-03-31',
      rangeEndYmd: '2026-04-06',
    }),
  );
});

test('analytics pages use persisted range state with page-specific defaults', () => {
  const employeePageSource = readFileSync(
    new URL('../src/features/employee-analytics/pages/EmployeeAnalyticsPage.tsx', import.meta.url),
    'utf8',
  );
  const profitabilityPageSource = readFileSync(
    new URL(
      '../src/features/profitability-analytics/pages/ProfitabilityAnalyticsPage.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  const posPageSource = readFileSync(
    new URL('../src/features/pos-analytics/pages/PosAnalyticsPage.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    employeePageSource,
    /usePersistedAnalyticsRange\(\s*'employee-analytics\.range',\s*createTrailingDayRangeSelection\(14\)\s*\)/,
    'EmployeeAnalyticsPage should restore its range from session storage with a trailing 14-day fallback',
  );
  assert.match(
    profitabilityPageSource,
    /usePersistedAnalyticsRange\(\s*'profitability-analytics\.range',\s*createCurrentMonthToDateRangeSelection\(\)\s*\)/,
    'ProfitabilityAnalyticsPage should restore its range from session storage with a month-to-date fallback',
  );
  assert.match(
    posPageSource,
    /usePersistedAnalyticsRange\(\s*'pos-analytics\.range',\s*createCurrentMonthToDateRangeSelection\(\)\s*\)/,
    'PosAnalyticsPage should restore its range from session storage with a month-to-date fallback',
  );
  assert.match(
    posPageSource,
    /excludeGranularities=\{[^}]*['"]year['"][^}]*\}/,
    'PosAnalyticsPage should exclude the year granularity from AnalyticsRangePicker',
  );
});

test('AnalyticsRangePicker reopens on the selected range instead of defaulting to the current date', () => {
  const pickerSource = readFileSync(
    new URL('../src/features/employee-analytics/components/AnalyticsRangePicker.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    pickerSource,
    /function getSelectionFocusDate\(selection: AnalyticsRangeSelection\)/,
    'AnalyticsRangePicker should derive its visible calendar focus from the selected range',
  );
  assert.match(
    pickerSource,
    /const focusDate = getSelectionFocusDate\(draft\);/,
    'AnalyticsRangePicker should initialize month-based views from the selected range',
  );
  assert.match(
    pickerSource,
    /const \[center, setCenter\] = useState\(\(\) => getSelectionFocusYear\(draft\)\);/,
    'AnalyticsRangePicker year view should center on the selected range',
  );
  assert.doesNotMatch(
    pickerSource,
    /useState\(today\.getFullYear\(\)\)|useState\(today\.getMonth\(\)\)|useState\(now\.getFullYear\(\)\)|useState\(cy\)/,
    'AnalyticsRangePicker should not reset its visible month or year to the current date when reopened',
  );
});

test('PosAnalyticsPage keeps KPI cards and the tab toggle outside the keyed tab panel', () => {
  const posPageSource = readFileSync(
    new URL('../src/features/pos-analytics/pages/PosAnalyticsPage.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    posPageSource,
    /\{showContent \? \(\s*<div className="space-y-4 sm:space-y-6">[\s\S]*\{kpiCards\.map\(\(card, index\) => \([\s\S]*<ViewToggle[\s\S]*<AnimatePresence mode="wait">[\s\S]*<motion\.div\s+key=\{activeView\}/,
    'PosAnalyticsPage should keep the KPI cards and tab switcher mounted while only the active tab panel is keyed',
  );
  assert.doesNotMatch(
    posPageSource,
    /<motion\.div\s+key=\{activeView\}[\s\S]*\{kpiCards\.map\(\(card, index\) => \(/,
    'PosAnalyticsPage should not remount the KPI cards when the active tab changes',
  );
  assert.doesNotMatch(
    posPageSource,
    /<motion\.div\s+key=\{activeView\}[\s\S]*<ViewToggle/,
    'PosAnalyticsPage should not remount the tab switcher when the active tab changes',
  );
});

test('PosAnalyticsPage uses the same animated loading-card pattern as profitability analytics', () => {
  const posPageSource = readFileSync(
    new URL('../src/features/pos-analytics/pages/PosAnalyticsPage.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    posPageSource,
    /function LoadingState\(\{ periodLabel \}: \{ periodLabel: string \}\)/,
    'PosAnalyticsPage should define a dedicated animated loading state',
  );
  assert.match(
    posPageSource,
    /Loading POS analytics data\.\.\./,
    'PosAnalyticsPage should show a loading message inside the animated loading card',
  );
  assert.match(
    posPageSource,
    /animate=\{\{ scaleY: \[0\.3, 1, 0\.3\] \}\}/,
    'PosAnalyticsPage should use animated vertical bars in the loading card',
  );
  assert.match(
    posPageSource,
    /<LoadingState periodLabel=\{periodLabel\} \/>/,
    'PosAnalyticsPage should render the shared loading card while the initial request is pending',
  );
  assert.doesNotMatch(
    posPageSource,
    /function LoadingSkeleton\(\)/,
    'PosAnalyticsPage should no longer use the older pulse-skeleton loading layout',
  );
});

test('ProfitabilityAnalyticsPage charts use full currency values instead of compact formatting', () => {
  const profitabilityPageSource = readFileSync(
    new URL('../src/features/profitability-analytics/pages/ProfitabilityAnalyticsPage.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    profitabilityPageSource,
    /function formatTooltipCurrencyValue[\s\S]*formatCurrency\(Number\.isFinite\(numericValue\) \? numericValue : 0\)/,
    'ProfitabilityAnalyticsPage chart tooltips should use full currency values',
  );
  assert.match(
    profitabilityPageSource,
    /tickFormatter=\{\(v\) => formatCurrency\(v\)\}/,
    'ProfitabilityAnalyticsPage chart axes should use full currency values',
  );
  assert.match(
    profitabilityPageSource,
    /formatCurrency\(p\.value\)/,
    'ProfitabilityAnalyticsPage trend tooltip should show full currency values',
  );
  assert.match(
    profitabilityPageSource,
    /formatCurrency\(d\.value\)/,
    'ProfitabilityAnalyticsPage cost breakdown legend should show full currency values',
  );
  assert.match(
    profitabilityPageSource,
    /formatCurrency\(total\)/,
    'ProfitabilityAnalyticsPage cost breakdown total should show full currency values',
  );
  assert.doesNotMatch(
    profitabilityPageSource,
    /tickFormatter=\{\(v\) => formatCurrency\(v,\s*true\)\}|formatCurrency\((p\.value|d\.value|total|Number\.isFinite\(numericValue\) \? numericValue : 0),\s*true\)/,
    'ProfitabilityAnalyticsPage chart displays should not use compact currency formatting',
  );
});

test('PosAnalyticsPage table view keeps a compact session overview with slide-in session details', () => {
  const posPageSource = readFileSync(
    new URL('../src/features/pos-analytics/pages/PosAnalyticsPage.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    posPageSource,
    /const SESSION_TABLE_HEADERS = \['Session', 'Branch', 'Date'\] as const;/,
    'PosAnalyticsPage should limit the table overview to Session, Branch, and Date columns',
  );
  assert.match(
    posPageSource,
    /const SESSION_TABLE_DESKTOP_HEADERS = \['Gross Sales', 'Discounts', 'Refunds', 'Net Sales'\] as const;/,
    'PosAnalyticsPage should expose Gross Sales, Discounts, Refunds, and Net Sales as desktop-only overview columns',
  );
  assert.match(
    posPageSource,
    /formatSessionDate\(session\.startAt\)/,
    'PosAnalyticsPage should format the session date for desktop rows',
  );
  assert.match(
    posPageSource,
    /formatSessionDate\(session\.startAt,\s*true\)/,
    'PosAnalyticsPage should format the session date for mobile rows',
  );
  assert.match(
    posPageSource,
    /const \[selectedSession, setSelectedSession\] = useState<PosSessionDetail \| null>\(null\);/,
    'PosAnalyticsPage should track the selected session for the detail panel',
  );
  assert.match(
    posPageSource,
    /key=\{`detail-\$\{selectedSession\.sessionName\}`\}/,
    'PosAnalyticsPage should render a keyed slide-in detail panel for the selected session',
  );
  assert.match(
    posPageSource,
    /className="hidden whitespace-nowrap px-4 py-3 text-gray-600 lg:table-cell"/,
    'PosAnalyticsPage should hide the extra financial overview columns on mobile while showing them on desktop',
  );
  assert.match(
    posPageSource,
    /formatCurrency\(session\.grossSales\)/,
    'PosAnalyticsPage should show full Gross Sales values in the desktop overview',
  );
  assert.match(
    posPageSource,
    /formatCurrency\(session\.discounts\)/,
    'PosAnalyticsPage should show full Discounts values in the desktop overview',
  );
  assert.match(
    posPageSource,
    /formatCurrency\(session\.refunds\)/,
    'PosAnalyticsPage should show full Refunds values in the desktop overview',
  );
  assert.match(
    posPageSource,
    /formatCurrency\(session\.netSales\)/,
    'PosAnalyticsPage should show full Net Sales values in the desktop overview',
  );
  assert.doesNotMatch(
    posPageSource,
    /formatCurrency\(session\.(grossSales|discounts|refunds|netSales),\s*true\)/,
    'PosAnalyticsPage should not use compact currency formatting in the desktop overview cells',
  );
  assert.match(
    posPageSource,
    /tone=\{selectedSession\.state === 'opened' \? 'positive' : 'negative'\}/,
    'PosAnalyticsPage should style opened sessions green and closed sessions red in the detail panel',
  );
});

test('PosAnalyticsPage shows refund counts and full summary currency values', () => {
  const posPageSource = readFileSync(
    new URL('../src/features/pos-analytics/pages/PosAnalyticsPage.tsx', import.meta.url),
    'utf8',
  );
  const posApiSource = readFileSync(
    new URL('../src/features/pos-analytics/services/posAnalytics.api.ts', import.meta.url),
    'utf8',
  );

  assert.match(
    posPageSource,
    /item\.count\.toLocaleString\('en-PH'\)}/,
    'PosAnalyticsPage should show the refund count beside each refunded product',
  );
  assert.match(
    posApiSource,
    /topRefundedProducts: Array<\{ product: string; total: number; count: number \}>/,
    'PosAnalyticsPage should expect refund counts from the POS analytics API',
  );
  assert.match(
    posPageSource,
    /formatCurrency\(snapshot\.openingCash\)/,
    'PosAnalyticsPage should show full Opening Cash in the session summary',
  );
  assert.match(
    posPageSource,
    /formatCurrency\(snapshot\.expectedClosingCash\)/,
    'PosAnalyticsPage should show full Expected Cash in the session summary',
  );
  assert.match(
    posPageSource,
    /formatCurrency\(snapshot\.actualClosingCash\)/,
    'PosAnalyticsPage should show full Actual Cash in the session summary',
  );
  assert.match(
    posPageSource,
    /formatCurrency\(snapshot\.cashVariance\)/,
    'PosAnalyticsPage should show full Cash Variance in the session summary',
  );
  assert.match(
    posPageSource,
    /formatCurrency\(snapshot\.discounts\)/,
    'PosAnalyticsPage should show full Discounts in the session summary',
  );
  assert.match(
    posPageSource,
    /formatCurrency\(snapshot\.refunds\)/,
    'PosAnalyticsPage should show full Refunds in the session summary',
  );
  assert.doesNotMatch(
    posPageSource,
    /formatCurrency\(snapshot\.(openingCash|expectedClosingCash|actualClosingCash|cashVariance|discounts|refunds),\s*true\)/,
    'PosAnalyticsPage should not use compact currency formatting in the session summary',
  );
});

test('PosAnalyticsPage charts use full currency values instead of compact formatting', () => {
  const posPageSource = readFileSync(
    new URL('../src/features/pos-analytics/pages/PosAnalyticsPage.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    posPageSource,
    /function formatTooltipCurrency[\s\S]*formatCurrency\(Number\.isFinite\(numericValue\) \? numericValue : 0\)/,
    'PosAnalyticsPage chart tooltips should use full currency values',
  );
  assert.match(
    posPageSource,
    /function formatAxisCurrency\(value: number, _compact = false\): string {\s+return formatCurrency\(value\);\s+}/,
    'PosAnalyticsPage currency chart axes should use full values',
  );
  assert.match(
    posPageSource,
    /formatCurrency\(item\.amount\)/,
    'PosAnalyticsPage payment method chart should show full values',
  );
  assert.match(
    posPageSource,
    /formatCurrency\(item\.total\)/,
    'PosAnalyticsPage refunded product chart should show full values',
  );
  assert.doesNotMatch(
    posPageSource,
    /formatCurrency\((value|item\.(amount|total)),\s*true\)/,
    'PosAnalyticsPage chart displays should not use compact currency formatting',
  );
});

test('PosAnalyticsPage ranks refunded products by refund count and uses a list instead of a progress bar', () => {
  const posPageSource = readFileSync(
    new URL('../src/features/pos-analytics/pages/PosAnalyticsPage.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    posPageSource,
    /description="Top (?:3 )?refunded products by refund count across all matching sessions"/,
    'PosAnalyticsPage should describe the refunded products card as count-based',
  );
  assert.match(
    posPageSource,
    /break-words text-sm font-medium[\s\S]*sm:truncate/,
    'PosAnalyticsPage should let refunded product names breathe on mobile before truncating on larger screens',
  );
  assert.match(
    posPageSource,
    /sm:flex sm:items-center sm:justify-between sm:gap-5/,
    'PosAnalyticsPage should switch refunded product rows into a tighter desktop summary layout',
  );
  assert.match(
    posPageSource,
    /hidden text-\[10px\] font-semibold uppercase tracking-wide text-gray-400 sm:block">Refunds<\/span>/,
    'PosAnalyticsPage should label the desktop refund-count summary tile',
  );
  assert.match(
    posPageSource,
    /hidden text-\[10px\] font-semibold uppercase tracking-wide text-gray-400 sm:block">Value<\/span>/,
    'PosAnalyticsPage should label the desktop refund-value summary tile',
  );
  assert.doesNotMatch(
    posPageSource,
    /item\.total \/ maxValue/,
    'PosAnalyticsPage should no longer render refunded-product progress bars',
  );
  assert.doesNotMatch(
    posPageSource,
    /Ranked by refund count across the selected sessions/,
    'PosAnalyticsPage should not repeat the refund-count ranking note inside each refunded product row',
  );
});

test('PosAnalyticsPage shows the desktop payment legend without a scroll container', () => {
  const posPageSource = readFileSync(
    new URL('../src/features/pos-analytics/pages/PosAnalyticsPage.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    posPageSource,
    /className="mt-3 grid gap-1\.5 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-2"/,
    'PosAnalyticsPage should render the payment legend as a desktop grid so all legend items stay visible',
  );
  assert.doesNotMatch(
    posPageSource,
    /mt-2 space-y-1\.5 overflow-y-auto/,
    'PosAnalyticsPage should not make the payment legend scroll on desktop',
  );
});

test('analytics sidebar orders POS Analytics directly below Employee Analytics', () => {
  const sidebarSource = readFileSync(
    new URL('../src/features/dashboard/components/Sidebar.tsx', import.meta.url),
    'utf8',
  );

  const employeeIndex = sidebarSource.indexOf('Employee Analytics');
  const posIndex = sidebarSource.indexOf('POS Analytics');
  const profitabilityIndex = sidebarSource.indexOf('Profitability Analytics');

  assert.notEqual(employeeIndex, -1, 'Sidebar should include Employee Analytics');
  assert.notEqual(posIndex, -1, 'Sidebar should include POS Analytics');
  assert.notEqual(profitabilityIndex, -1, 'Sidebar should include Profitability Analytics');
  assert.equal(
    employeeIndex < posIndex && posIndex < profitabilityIndex,
    true,
    'Sidebar should place POS Analytics between Employee Analytics and Profitability Analytics',
  );
});

// --- Date / currency formatters ---

export function fmtOdooDate(dateStr: string): string {
  // Odoo sends "YYYY-MM-DD HH:MM:SS" without timezone — treat as UTC
  const utcStr = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(utcStr));
}

export function fmtDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const datePart = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
  const timePart = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  return `${datePart} at ${timePart}`;
}

export const fmt = (n: number | undefined | null): string =>
  n != null
    ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)
    : '—';

// --- Breakdown helpers ---

export function parseBreakdown(raw: unknown): { denomination: number; quantity: number }[] {
  if (!raw) return [];
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const items: { denomination: number; quantity: number }[] = [];
  for (const entry of value) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      'denomination' in entry &&
      'quantity' in entry
    ) {
      const denom = (entry as { denomination: unknown }).denomination;
      const qty = (entry as { quantity: unknown }).quantity;
      if (typeof denom === 'number' && typeof qty === 'number' && qty >= 0) {
        items.push({ denomination: denom, quantity: qty });
      }
    }
  }
  return items;
}

export function breakdownTotal(items: { denomination: number; quantity: number }[]): number {
  return items.filter((i) => i.quantity > 0).reduce((sum, i) => sum + i.denomination * i.quantity, 0);
}

// --- Status badge variants ---

export function statusVariant(status: string): 'success' | 'default' | 'info' {
  switch (status) {
    case 'audit_complete':
      return 'success';
    case 'closed':
      return 'default';
    default:
      return 'info';
  }
}

export function verStatusVariant(status: string): 'success' | 'danger' | 'warning' {
  switch (status) {
    case 'confirmed':
      return 'success';
    case 'rejected':
      return 'danger';
    default:
      return 'warning';
  }
}

// --- Verification type config ---

export interface VerificationTypeConfig {
  label: string;
  badgeClass: string;
  headerClass: string;
}

export const VERIFICATION_TYPE_CONFIG: Record<string, VerificationTypeConfig> = {
  cf_breakdown: {
    label: 'CF Breakdown',
    badgeClass: 'bg-blue-200 text-blue-800',
    headerClass: 'bg-blue-100 border-blue-300',
  },
  pcf_breakdown: {
    label: 'PCF Breakdown',
    badgeClass: 'bg-violet-200 text-violet-800',
    headerClass: 'bg-violet-100 border-violet-300',
  },
  closing_pcf_breakdown: {
    label: 'Closing PCF Report',
    badgeClass: 'bg-cyan-200 text-cyan-800',
    headerClass: 'bg-cyan-100 border-cyan-300',
  },
  discount_order: {
    label: 'Discount Order',
    badgeClass: 'bg-orange-200 text-orange-800',
    headerClass: 'bg-orange-100 border-orange-300',
  },
  refund_order: {
    label: 'Refund Order',
    badgeClass: 'bg-purple-200 text-purple-800',
    headerClass: 'bg-purple-100 border-purple-300',
  },
  non_cash_order: {
    label: 'Non-Cash Order',
    badgeClass: 'bg-teal-200 text-teal-800',
    headerClass: 'bg-teal-100 border-teal-300',
  },
  token_pay_order: {
    label: 'Token Pay Order',
    badgeClass: 'bg-indigo-200 text-indigo-800',
    headerClass: 'bg-indigo-100 border-indigo-300',
  },
  ispe_purchase_order: {
    label: 'ISPE Purchase Order',
    badgeClass: 'bg-amber-200 text-amber-800',
    headerClass: 'bg-amber-100 border-amber-300',
  },
  register_cash_out: {
    label: 'Register Cash Out',
    badgeClass: 'bg-red-200 text-red-800',
    headerClass: 'bg-red-100 border-red-300',
  },
  register_cash_in: {
    label: 'Register Cash In',
    badgeClass: 'bg-green-200 text-green-800',
    headerClass: 'bg-green-100 border-green-300',
  },
};

export function getVerificationTypeConfig(type: string): VerificationTypeConfig {
  return (
    VERIFICATION_TYPE_CONFIG[type] ?? {
      label: type,
      badgeClass: 'bg-gray-200 text-gray-700',
      headerClass: 'bg-gray-50 border-gray-200',
    }
  );
}

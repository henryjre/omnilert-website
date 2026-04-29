import { api } from '@/shared/services/api.client';

export type BankOption = {
  id: number;
  name: string;
  bic: string | null;
};

export async function getBankOptions(): Promise<BankOption[]> {
  const response = await api.get('/account/banks');
  const rows = response.data.data;
  return Array.isArray(rows) ? rows : [];
}

export function getBankLabel(bankOptions: BankOption[], bankId: number | string | null | undefined): string {
  const id = Number(bankId);
  if (!Number.isInteger(id) || id <= 0) {
    return 'Bank ID unknown';
  }
  return bankOptions.find((bank) => bank.id === id)?.name ?? `Bank ID ${id}`;
}

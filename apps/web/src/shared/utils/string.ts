export function normalizeAuditedEmployeeName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const parts = trimmed.split('-');
  if (parts.length < 2) return trimmed;

  const prefix = parts[0]?.trim() ?? '';
  const normalizedName = parts.slice(1).join('-').trim();
  if (!normalizedName) return trimmed;

  return /\d/.test(prefix) ? normalizedName : trimmed;
}

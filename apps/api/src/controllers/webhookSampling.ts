const DEFAULT_CSS_AUDIT_SAMPLE_RATE = 0.1;

export function resolveCssAuditSampleRate(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CSS_AUDIT_SAMPLE_RATE?.trim();
  if (!raw) return DEFAULT_CSS_AUDIT_SAMPLE_RATE;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_CSS_AUDIT_SAMPLE_RATE;

  return Math.min(Math.max(parsed, 0), 1);
}

export const CSS_AUDIT_SAMPLE_RATE = resolveCssAuditSampleRate();

export function shouldCreateCssAudit(
  randomValue: number = Math.random(),
  sampleRate: number = CSS_AUDIT_SAMPLE_RATE,
): boolean {
  return randomValue <= sampleRate;
}

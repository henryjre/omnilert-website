export const CSS_AUDIT_SAMPLE_RATE = 0.10;

export function shouldCreateCssAudit(randomValue: number = Math.random()): boolean {
  return randomValue <= CSS_AUDIT_SAMPLE_RATE;
}

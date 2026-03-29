export const CSS_AUDIT_SAMPLE_RATE = 1;

export function shouldCreateCssAudit(randomValue: number = Math.random()): boolean {
  return randomValue <= CSS_AUDIT_SAMPLE_RATE;
}

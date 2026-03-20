export const CSS_AUDIT_SAMPLE_RATE = 0.25;

export function shouldCreateCssAudit(randomValue: number = Math.random()): boolean {
  return randomValue <= CSS_AUDIT_SAMPLE_RATE;
}

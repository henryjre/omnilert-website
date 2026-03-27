<<<<<<< HEAD
export const CSS_AUDIT_SAMPLE_RATE = 0.1;
=======
export const CSS_AUDIT_SAMPLE_RATE = 0.10;
>>>>>>> 95b4b9a20873710ae73d237b532bc345c90a2917

export function shouldCreateCssAudit(randomValue: number = Math.random()): boolean {
  return randomValue <= CSS_AUDIT_SAMPLE_RATE;
}

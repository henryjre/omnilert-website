import { describe, expect, it } from 'vitest';

process.env.JWT_SECRET ??= 'test-jwt-secret-12345';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.SUPER_ADMIN_BOOTSTRAP_SECRET ??= 'test-bootstrap-secret-1234567890';
process.env.SUPER_ADMIN_JWT_SECRET ??= 'test-super-admin-jwt-secret-123456';
process.env.ODOO_DB ??= 'test-odoo-db';
process.env.ODOO_URL ??= 'http://localhost:8069';
process.env.ODOO_USERNAME ??= 'test-odoo-user@example.com';
process.env.ODOO_PASSWORD ??= 'test-odoo-password';
process.env.OPENAI_API_KEY ??= 'test-openai-key';
process.env.OPENAI_ORGANIZATION_ID ??= 'test-openai-org';
process.env.OPENAI_PROJECT_ID ??= 'test-openai-project';

const { applyGlobalAverageEpiBand } = await import('../epiCalculation.service.js');
const { calculateWeeklyEligibleGlobalAverageEpi } = await import('../epiSnapshotCron.service.js');

describe('applyGlobalAverageEpiBand', () => {
  it('clamps positive movement at the upper band from inside the band', () => {
    expect(applyGlobalAverageEpiBand({
      epiBefore: 108,
      rawDelta: 5,
      globalAverageEpi: 100,
    })).toEqual({
      epiAfter: 110,
      delta: 2,
      raw_delta: 5,
      capped: true,
      lowerBound: 90,
      upperBound: 110,
    });
  });

  it('clamps negative movement at the lower band from inside the band', () => {
    expect(applyGlobalAverageEpiBand({
      epiBefore: 92,
      rawDelta: -5,
      globalAverageEpi: 100,
    })).toEqual({
      epiAfter: 90,
      delta: -2,
      raw_delta: -5,
      capped: true,
      lowerBound: 90,
      upperBound: 110,
    });
  });

  it('leaves normal in-band movement unchanged', () => {
    expect(applyGlobalAverageEpiBand({
      epiBefore: 100,
      rawDelta: 4.246,
      globalAverageEpi: 100,
    })).toEqual({
      epiAfter: 104.25,
      delta: 4.25,
      raw_delta: 4.246,
      capped: false,
      lowerBound: 90,
      upperBound: 110,
    });
  });

  it('blocks positive movement above the upper band', () => {
    expect(applyGlobalAverageEpiBand({
      epiBefore: 115,
      rawDelta: 3,
      globalAverageEpi: 100,
    })).toEqual({
      epiAfter: 115,
      delta: 0,
      raw_delta: 3,
      capped: true,
      lowerBound: 90,
      upperBound: 110,
    });
  });

  it('allows negative movement above the upper band', () => {
    expect(applyGlobalAverageEpiBand({
      epiBefore: 115,
      rawDelta: -3,
      globalAverageEpi: 100,
    })).toEqual({
      epiAfter: 112,
      delta: -3,
      raw_delta: -3,
      capped: false,
      lowerBound: 90,
      upperBound: 110,
    });
  });

  it('blocks negative movement below the lower band', () => {
    expect(applyGlobalAverageEpiBand({
      epiBefore: 85,
      rawDelta: -3,
      globalAverageEpi: 100,
    })).toEqual({
      epiAfter: 85,
      delta: 0,
      raw_delta: -3,
      capped: true,
      lowerBound: 90,
      upperBound: 110,
    });
  });

  it('allows positive movement below the lower band', () => {
    expect(applyGlobalAverageEpiBand({
      epiBefore: 85,
      rawDelta: 3,
      globalAverageEpi: 100,
    })).toEqual({
      epiAfter: 88,
      delta: 3,
      raw_delta: 3,
      capped: false,
      lowerBound: 90,
      upperBound: 110,
    });
  });
});

describe('calculateWeeklyEligibleGlobalAverageEpi', () => {
  it('averages the weekly eligible cohort before movement', () => {
    expect(calculateWeeklyEligibleGlobalAverageEpi([
      { epi_score: 80 },
      { epi_score: '100.5' },
      { epi_score: 120 },
    ])).toBe(100.17);
  });
});

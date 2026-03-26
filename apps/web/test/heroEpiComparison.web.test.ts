import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FALLBACK_HERO_NEUTRAL_AT,
  getHeroZoneLabel,
  resolveHeroEpiComparison,
} from '../src/features/dashboard/components/epi/heroEpiComparison';

test('resolveHeroEpiComparison applies red/amber/green/blue boundaries by percentage change', () => {
  assert.equal(resolveHeroEpiComparison({ userEpiScore: 75, globalAverageEpi: 100 }).zone, 'red'); // -25%
  assert.equal(resolveHeroEpiComparison({ userEpiScore: 99.9, globalAverageEpi: 100 }).zone, 'amber'); // just below 0%
  assert.equal(resolveHeroEpiComparison({ userEpiScore: 100, globalAverageEpi: 100 }).zone, 'green'); // 0%
  assert.equal(resolveHeroEpiComparison({ userEpiScore: 150, globalAverageEpi: 100 }).zone, 'green'); // +50%
  assert.equal(resolveHeroEpiComparison({ userEpiScore: 150.1, globalAverageEpi: 100 }).zone, 'blue'); // > +50%
});

test('resolveHeroEpiComparison falls back to baseline 100 and static score zones when global average is missing/zero', () => {
  assert.deepEqual(resolveHeroEpiComparison({ userEpiScore: 90, globalAverageEpi: null }), {
    zone: 'amber',
    neutralAt: FALLBACK_HERO_NEUTRAL_AT,
    percentChange: null,
    usedFallback: true,
  });

  assert.deepEqual(resolveHeroEpiComparison({ userEpiScore: 70, globalAverageEpi: 0 }), {
    zone: 'red',
    neutralAt: FALLBACK_HERO_NEUTRAL_AT,
    percentChange: null,
    usedFallback: true,
  });
});

test('getHeroZoneLabel returns the requested status copy', () => {
  assert.equal(getHeroZoneLabel('red'), 'Critical Deficit — Immediate action required');
  assert.equal(getHeroZoneLabel('amber'), 'Underperforming — Needs monitoring');
  assert.equal(getHeroZoneLabel('green'), 'On Target — Performing as expected');
  assert.equal(getHeroZoneLabel('blue'), 'Exceptional — Significantly exceeding goals');
});

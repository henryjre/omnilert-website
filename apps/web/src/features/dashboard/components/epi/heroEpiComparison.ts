import { getEpiZone } from './epiUtils';

export type HeroEpiZone = 'red' | 'amber' | 'green' | 'blue';

export const FALLBACK_HERO_NEUTRAL_AT = 100;

function isUsableGlobalAverage(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function getHeroZoneLabel(zone: HeroEpiZone): string {
  switch (zone) {
    case 'red':
      return 'Critical Deficit — Immediate action required';
    case 'amber':
      return 'Underperforming — Needs monitoring';
    case 'green':
      return 'On Target — Performing as expected';
    case 'blue':
      return 'Exceptional — Significantly exceeding goals';
  }
}

function getHeroZoneByPercentChange(percentChange: number): HeroEpiZone {
  if (percentChange <= -25) return 'red';
  if (percentChange < 0) return 'amber';
  if (percentChange > 50) return 'blue';
  return 'green';
}

export function resolveHeroEpiComparison(input: {
  userEpiScore: number;
  globalAverageEpi: number | null | undefined;
}): {
  zone: HeroEpiZone;
  neutralAt: number;
  percentChange: number | null;
  usedFallback: boolean;
} {
  const { userEpiScore, globalAverageEpi } = input;

  if (!isUsableGlobalAverage(globalAverageEpi)) {
    return {
      zone: getEpiZone(userEpiScore),
      neutralAt: FALLBACK_HERO_NEUTRAL_AT,
      percentChange: null,
      usedFallback: true,
    };
  }

  const percentChange = ((userEpiScore - globalAverageEpi) / globalAverageEpi) * 100;

  return {
    zone: getHeroZoneByPercentChange(percentChange),
    neutralAt: globalAverageEpi,
    percentChange,
    usedFallback: false,
  };
}

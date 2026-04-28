import type { EpiZone } from './types';

export function getEpiZone(score: number): EpiZone {
  if (score >= 100) return 'green';
  if (score >= 75) return 'amber';
  return 'red';
}

export function getScoreZone(score: number): EpiZone {
  if (score >= 4) return 'green';
  if (score >= 3) return 'amber';
  return 'red';
}

export function getRateZone(rate: number): EpiZone {
  if (rate >= 85) return 'green';
  if (rate >= 70) return 'amber';
  return 'red';
}

/**
 * Formats a percentage rate, removing trailing .00 for whole numbers
 * e.g. 100.00 -> 100%, 98.30 -> 98.3%, 57.15 -> 57.15%
 */
export function formatRate(v: number): string {
  return parseFloat(v.toFixed(2)).toString() + '%';
}

/**
 * Formats a score or threshold, removing trailing .00
 * e.g. 4.00 -> 4, 4.75 -> 4.75
 */
export function formatThreshold(v: number): string {
  return parseFloat(v.toFixed(2)).toString();
}

export function getAovZone(yours: number, branchAvg: number): EpiZone {
  if (branchAvg === 0) return 'amber';
  const ratio = yours / branchAvg;
  if (ratio >= 1.05) return 'green';
  if (ratio >= 0.95) return 'amber';
  return 'red';
}

export interface ZoneColors {
  text: string;
  darkText: string;
  bg: string;
  darkBg: string;
  border: string;
  darkBorder: string;
  stroke: string;
  fill: string;
}

export function getZoneColors(zone: EpiZone): ZoneColors {
  switch (zone) {
    case 'green':
      return {
        text: 'text-green-600',
        darkText: 'dark:text-green-400',
        bg: 'bg-green-50',
        darkBg: 'dark:bg-green-900/20',
        border: 'border-green-200',
        darkBorder: 'dark:border-green-800',
        stroke: '#16a34a',
        fill: '#16a34a33',
      };
    case 'amber':
      return {
        text: 'text-amber-600',
        darkText: 'dark:text-amber-400',
        bg: 'bg-amber-50',
        darkBg: 'dark:bg-amber-900/20',
        border: 'border-amber-200',
        darkBorder: 'dark:border-amber-800',
        stroke: '#d97706',
        fill: '#d9770633',
      };
    case 'red':
      return {
        text: 'text-red-600',
        darkText: 'dark:text-red-400',
        bg: 'bg-red-50',
        darkBg: 'dark:bg-red-900/20',
        border: 'border-red-200',
        darkBorder: 'dark:border-red-800',
        stroke: '#dc2626',
        fill: '#dc262633',
      };
  }
}

export function getZoneLabel(zone: EpiZone): string {
  switch (zone) {
    case 'green': return "Green Zone — keep it up!";
    case 'amber': return "Amber Zone — almost there!";
    case 'red': return "Red Zone — let's improve!";
  }
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// ─── EPI Impact Calculations (Matching Backend epiCalculation.service.ts) ──────

export function getWrsImpact(score: number): number {
  if (score >= 4.70) return 0.25;
  if (score >= 4.45) return 0.20;
  if (score >= 4.20) return 0.15;
  if (score >= 3.95) return 0.10;
  if (score >= 3.70) return 0.05;
  if (score >= 3.40) return 0.00;
  if (score >= 3.10) return -0.05;
  if (score >= 2.80) return -0.10;
  if (score >= 2.50) return -0.15;
  return -0.25;
}

export function getPcsImpact(score: number): number {
  if (score >= 4.75) return 0.35;
  if (score >= 4.50) return 0.28;
  if (score >= 4.25) return 0.21;
  if (score >= 4.00) return 0.14;
  if (score >= 3.75) return 0.07;
  if (score >= 3.45) return 0.00;
  if (score >= 3.15) return -0.07;
  if (score >= 2.85) return -0.14;
  if (score >= 2.55) return -0.21;
  return -0.35;
}

export function getAttendanceImpact(rate: number): number {
  if (rate >= 99.50) return 0.40;
  if (rate >= 98.50) return 0.32;
  if (rate >= 97.50) return 0.24;
  if (rate >= 96.50) return 0.16;
  if (rate >= 95.50) return 0.08;
  if (rate >= 94.00) return 0.00;
  if (rate >= 92.00) return -0.08;
  if (rate >= 89.00) return -0.16;
  if (rate >= 85.00) return -0.24;
  return -0.40;
}

export function getPunctualityImpact(rate: number): number {
  if (rate >= 99.50) return 0.30;
  if (rate >= 98.50) return 0.24;
  if (rate >= 97.50) return 0.18;
  if (rate >= 96.50) return 0.12;
  if (rate >= 95.50) return 0.06;
  if (rate >= 94.00) return 0.00;
  if (rate >= 92.00) return -0.06;
  if (rate >= 89.00) return -0.12;
  if (rate >= 85.00) return -0.18;
  return -0.30;
}

export function getProductivityImpact(rate: number): number {
  if (rate >= 98.00) return 0.40;
  if (rate >= 96.00) return 0.32;
  if (rate >= 94.00) return 0.24;
  if (rate >= 92.00) return 0.16;
  if (rate >= 90.00) return 0.08;
  if (rate >= 88.00) return 0.00;
  if (rate >= 85.00) return -0.08;
  if (rate >= 81.00) return -0.16;
  if (rate >= 76.00) return -0.24;
  return -0.40;
}

export function getAovImpact(pct: number): number {
  if (pct >= 20.00) return 0.30;
  if (pct >= 15.00) return 0.24;
  if (pct >= 10.00) return 0.18;
  if (pct >= 6.00) return 0.12;
  if (pct >= 2.00) return 0.06;
  if (pct > -2.00) return 0.00;
  if (pct >= -6.00) return -0.06;
  if (pct >= -10.00) return -0.12;
  if (pct >= -15.00) return -0.18;
  return -0.30;
}

export function getUniformImpact(rate: number): number {
  if (rate >= 99.50) return 0.20;
  if (rate >= 98.50) return 0.16;
  if (rate >= 97.50) return 0.12;
  if (rate >= 96.50) return 0.08;
  if (rate >= 95.50) return 0.04;
  if (rate >= 94.00) return 0.00;
  if (rate >= 91.00) return -0.04;
  if (rate >= 87.00) return -0.08;
  if (rate >= 82.00) return -0.12;
  return -0.20;
}

export function getHygieneImpact(rate: number): number {
  if (rate >= 99.50) return 0.40;
  if (rate >= 98.50) return 0.32;
  if (rate >= 97.50) return 0.24;
  if (rate >= 96.50) return 0.16;
  if (rate >= 95.50) return 0.08;
  if (rate >= 94.00) return 0.00;
  if (rate >= 92.00) return -0.08;
  if (rate >= 89.00) return -0.16;
  if (rate >= 85.00) return -0.24;
  return -0.40;
}

export function getSopImpact(rate: number): number {
  return getUniformImpact(rate); // Same table (±0.20)
}

export function getCustomerInteractionImpact(score: number): number {
  if (score >= 4.70) return 0.70;
  if (score >= 4.45) return 0.56;
  if (score >= 4.20) return 0.42;
  if (score >= 3.95) return 0.28;
  if (score >= 3.70) return 0.14;
  if (score >= 3.40) return 0.00;
  if (score >= 3.10) return -0.14;
  if (score >= 2.80) return -0.28;
  if (score >= 2.50) return -0.42;
  return -0.70;
}

export function getCashieringImpact(score: number): number {
  if (score >= 4.75) return 0.60;
  if (score >= 4.50) return 0.48;
  if (score >= 4.25) return 0.36;
  if (score >= 4.00) return 0.24;
  if (score >= 3.75) return 0.12;
  if (score >= 3.45) return 0.00;
  if (score >= 3.15) return -0.12;
  if (score >= 2.85) return -0.24;
  if (score >= 2.55) return -0.36;
  return -0.60;
}

export function getSuggestiveSellingImpact(score: number): number {
  if (score >= 4.70) return 0.40;
  if (score >= 4.45) return 0.32;
  if (score >= 4.20) return 0.24;
  if (score >= 3.95) return 0.16;
  if (score >= 3.70) return 0.08;
  if (score >= 3.40) return 0.00;
  if (score >= 3.10) return -0.08;
  if (score >= 2.80) return -0.16;
  if (score >= 2.50) return -0.24;
  return -0.40;
}

export function getServiceEfficiencyImpact(score: number): number {
  if (score >= 4.75) return 0.50;
  if (score >= 4.50) return 0.40;
  if (score >= 4.25) return 0.30;
  if (score >= 4.00) return 0.20;
  if (score >= 3.75) return 0.10;
  if (score >= 3.45) return 0.00;
  if (score >= 3.15) return -0.10;
  if (score >= 2.85) return -0.20;
  if (score >= 2.55) return -0.30;
  return -0.50;
}

export interface RenderedImpact {
  text: string;
  className: string;
  value: number;
}

export function renderEpiImpact(impact: number | null): RenderedImpact {
  if (impact === null) {
    return {
      text: 'No data',
      className: 'text-gray-400 italic',
      value: 0,
    };
  }

  if (impact === 0) {
    return {
      text: 'No EPI change',
      className: 'text-gray-400',
      value: 0,
    };
  }

  const sign = impact > 0 ? '+' : '';
  const colorClass = impact > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  return {
    text: `${sign}${impact.toFixed(2)} EPI points`,
    className: colorClass,
    value: impact,
  };
}

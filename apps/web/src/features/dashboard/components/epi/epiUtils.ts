import type { EpiZone } from './types';
export const VIOLATION_DEDUCTION = 5;
export const AWARD_BONUS = 5;

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
  if (score >= 4.5) return 1;
  if (score >= 4.0) return 0.5;
  if (score >= 3.7) return 0;
  if (score >= 3.3) return -0.5;
  return -1;
}

export function getAttendanceImpact(rate: number): number {
  if (rate >= 99) return 2;
  if (rate >= 98) return 1;
  if (rate >= 95) return 0;
  if (rate >= 90) return -1;
  if (rate >= 85) return -2;
  if (rate >= 80) return -3;
  if (rate >= 70) return -4;
  return -5;
}

export function getPunctualityImpact(rate: number): number {
  if (rate >= 98) return 1;
  if (rate >= 95) return 0;
  if (rate >= 90) return -1;
  if (rate >= 85) return -2;
  return -3;
}

export function getProductivityImpact(rate: number): number {
  if (rate >= 95) return 1;
  if (rate >= 90) return 0;
  if (rate >= 85) return -0.5;
  if (rate >= 80) return -1;
  return -2;
}

export function getAovImpact(pct: number): number {
  if (pct >= 10) return 2;
  if (pct > 0) return 1;
  if (pct >= -5) return 0;
  if (pct >= -10) return -1;
  return -2;
}

export function getUniformImpact(rate: number): number {
  if (rate >= 95) return 1;
  if (rate >= 90) return 0;
  if (rate >= 85) return -0.5;
  if (rate >= 80) return -1;
  return -2;
}

export function getHygieneImpact(rate: number): number {
  return getUniformImpact(rate);
}

export function getSopImpact(rate: number): number {
  return getUniformImpact(rate);
}

export function getCustomerInteractionImpact(score: number): number {
  if (score >= 4.60) return 3;
  if (score >= 4.30) return 2;
  if (score >= 4.00) return 1;
  if (score >= 3.70) return 0;
  if (score >= 3.40) return -2;
  return -3;
}

export function getCashieringImpact(score: number): number {
  if (score >= 4.60) return 2;
  if (score >= 4.30) return 1;
  if (score >= 4.00) return 0;
  if (score >= 3.70) return -1;
  if (score >= 3.40) return -2;
  return -3;
}

export function getSuggestiveSellingImpact(score: number): number {
  if (score >= 4.50) return 2;
  if (score >= 4.20) return 1;
  if (score >= 3.80) return 0;
  if (score >= 3.50) return -1;
  if (score >= 3.20) return -2;
  return -3;
}

export function getServiceEfficiencyImpact(score: number): number {
  if (score >= 4.5) return 2;
  if (score >= 4.2) return 1;
  if (score >= 3.9) return 0;
  if (score >= 3.6) return -1;
  if (score >= 3.3) return -2;
  return -3;
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
    text: `${sign}${impact} EPI points`,
    className: colorClass,
    value: impact,
  };
}

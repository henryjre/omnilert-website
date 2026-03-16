import React from 'react';
import type { EpiZone } from './types';

export function getEpiZone(score: number): EpiZone {
  if (score >= 100) return 'green';
  if (score >= 80) return 'amber';
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

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
      {children}
    </p>
  );
}

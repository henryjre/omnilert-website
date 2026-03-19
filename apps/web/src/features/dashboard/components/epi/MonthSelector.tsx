import { useRef, useEffect } from 'react';
import type { EpiMonthEntry } from './types';
import { getEpiZone, getZoneColors } from './epiUtils';

interface MonthSelectorProps {
  history: EpiMonthEntry[];
  selectedMonthKey: string;
  onSelect: (monthKey: string) => void;
  currentMonthKey: string;
}

export function MonthSelector({ history, selectedMonthKey, onSelect, currentMonthKey }: MonthSelectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pillRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const pill = pillRefs.current[currentMonthKey];
    if (pill && scrollRef.current) {
      const container = scrollRef.current;
      const target = pill.offsetLeft - container.offsetWidth / 2 + pill.offsetWidth / 2;
      container.scrollLeft = target;
    }
  }, [currentMonthKey]);

  useEffect(() => {
    const pill = pillRefs.current[selectedMonthKey];
    if (pill && scrollRef.current) {
      const container = scrollRef.current;
      const pillLeft = pill.offsetLeft;
      const pillRight = pillLeft + pill.offsetWidth;
      const containerLeft = container.scrollLeft;
      const containerRight = containerLeft + container.offsetWidth;

      if (pillLeft < containerLeft + 16) {
        container.scrollTo({ left: pillLeft - 16, behavior: 'smooth' });
      } else if (pillRight > containerRight - 16) {
        container.scrollTo({ left: pillRight - container.offsetWidth + 16, behavior: 'smooth' });
      }
    }
  }, [selectedMonthKey]);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-white to-transparent dark:from-gray-950" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 bg-gradient-to-l from-white to-transparent dark:from-gray-950 w-6" />

      <div
        ref={scrollRef}
        className="flex justify-center gap-2 overflow-x-auto px-6 py-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {history.map((entry, index) => {
          const zone = getEpiZone(entry.score);
          const colors = getZoneColors(zone);
          const isSelected = entry.monthKey === selectedMonthKey;
          const isCurrent = entry.monthKey === currentMonthKey;

          return (
            <button
              key={entry.monthKey}
              ref={(element) => {
                pillRefs.current[entry.monthKey] = element;
              }}
              onClick={() => onSelect(entry.monthKey)}
              className="relative flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              style={
                isSelected
                  ? {
                    backgroundColor: colors.stroke,
                    color: '#fff',
                    boxShadow: `0 0 0 3px ${colors.stroke}30`,
                  }
                  : {
                    backgroundColor: `${colors.stroke}12`,
                    color: colors.stroke,
                  }
              }
            >
              {isCurrent && !isSelected && (
                <span
                  className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-white dark:border-gray-950"
                  style={{ backgroundColor: colors.stroke }}
                />
              )}
              {isCurrent && isSelected && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-white/70 border-2 border-white/40" />
              )}

              <span>{entry.month}</span>
              {(index === 0 || history[index - 1].year !== entry.year) && (
                <span className="ml-1 opacity-60">{entry.year}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

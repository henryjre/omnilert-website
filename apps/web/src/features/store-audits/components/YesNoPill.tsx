import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export type YesNoPillValue = boolean | 'not_auditable' | null;

interface YesNoPillProps {
  value: YesNoPillValue;
  onChange: (value: YesNoPillValue) => void;
  disabled?: boolean;
  showNotAuditable?: boolean;
}

export function YesNoPill({
  value,
  onChange,
  disabled = false,
  showNotAuditable = false,
}: YesNoPillProps) {
  const shouldReduceMotion = useReducedMotion();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [thumbPosition, setThumbPosition] = useState({ x: 0, width: 0 });
  const options: Array<{
    value: Exclude<YesNoPillValue, null>;
    label: string;
    activeClassName: string;
    inactiveClassName: string;
  }> = [
    {
      value: true,
      label: 'Yes',
      activeClassName: 'bg-green-600 shadow-[0_6px_18px_rgba(22,163,74,0.28)]',
      inactiveClassName: 'text-green-700 hover:bg-green-50',
    },
    {
      value: false,
      label: 'No',
      activeClassName: 'bg-red-600 shadow-[0_6px_18px_rgba(220,38,38,0.24)]',
      inactiveClassName: 'text-red-700 hover:bg-red-50',
    },
    {
      value: 'not_auditable',
      label: 'Not Auditable',
      activeClassName: 'bg-gray-600 shadow-[0_6px_18px_rgba(75,85,99,0.22)]',
      inactiveClassName: 'text-gray-600 hover:bg-gray-100',
    },
  ];
  const visibleOptions = showNotAuditable ? options : options.slice(0, 2);
  const selectedIndex = visibleOptions.findIndex((option) => option.value === value);
  const hasSelection = selectedIndex >= 0;
  const safeSelectedIndex = hasSelection ? selectedIndex : 0;
  const activeTransition = shouldReduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 520, damping: 34, mass: 0.72 };
  const updateThumbPosition = useCallback(() => {
    if (selectedIndex < 0) return;

    const track = trackRef.current;
    const button = buttonRefs.current[selectedIndex];
    if (!track || !button) return;

    const trackRect = track.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    setThumbPosition({
      x: buttonRect.left - trackRect.left,
      width: buttonRect.width,
    });
  }, [selectedIndex]);

  useLayoutEffect(() => {
    updateThumbPosition();
  }, [updateThumbPosition, visibleOptions.length]);

  useEffect(() => {
    if (typeof window === 'undefined' || selectedIndex < 0) return;

    let frame = 0;
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateThumbPosition);
    };

    scheduleMeasure();
    window.addEventListener('resize', scheduleMeasure);

    const ResizeObserverCtor = window.ResizeObserver;
    const observer = ResizeObserverCtor ? new ResizeObserverCtor(scheduleMeasure) : null;
    if (observer) {
      if (trackRef.current) observer.observe(trackRef.current);
      buttonRefs.current.forEach((button) => {
        if (button) observer.observe(button);
      });
    }

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', scheduleMeasure);
      observer?.disconnect();
    };
  }, [selectedIndex, updateThumbPosition, visibleOptions.length]);

  return (
    <div className="w-full rounded-2xl border border-gray-200 bg-gradient-to-r from-white to-gray-50/80 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:inline-flex sm:w-auto sm:flex-nowrap">
      <div
        ref={trackRef}
        className="relative flex w-full items-center gap-1 sm:inline-flex sm:w-auto"
      >
        {hasSelection && (
          <motion.span
            aria-hidden="true"
            animate={{ x: thumbPosition.x, width: thumbPosition.width }}
            transition={activeTransition}
            className={`pointer-events-none absolute inset-y-0 left-0 rounded-xl ${
              visibleOptions[safeSelectedIndex]?.activeClassName ?? options[0].activeClassName
            }`}
          />
        )}

      {visibleOptions.map((option) => {
        const selected = value === option.value;

        return (
          <motion.button
            key={option.label}
            ref={(node) => {
              buttonRefs.current[visibleOptions.indexOf(option)] = node;
            }}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            whileTap={disabled || shouldReduceMotion ? undefined : { scale: 0.97 }}
            whileHover={disabled || shouldReduceMotion || selected ? undefined : { y: -1 }}
            transition={activeTransition}
            className={`relative flex-1 overflow-hidden rounded-xl px-2.5 py-2 text-[11px] font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none sm:px-3.5 sm:py-1.5 sm:text-xs ${
              selected ? 'text-white' : option.inactiveClassName
            }`}
          >
            <span className="relative z-10">{option.label}</span>
          </motion.button>
        );
      })}
      </div>
    </div>
  );
}

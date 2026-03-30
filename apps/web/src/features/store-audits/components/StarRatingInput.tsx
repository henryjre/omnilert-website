import { motion, useReducedMotion } from 'framer-motion';
import { Star } from 'lucide-react';

interface StarRatingInputProps {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function StarRatingInput({ value, onChange, disabled = false }: StarRatingInputProps) {
  const shouldReduceMotion = useReducedMotion();
  const starTransition = shouldReduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 320, damping: 24, mass: 0.8 };

  return (
    <div className="flex w-full items-center justify-between rounded-xl border border-amber-100/60 bg-amber-50/45 px-2 py-1.5 sm:w-auto sm:justify-start sm:gap-1.5 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
      {[1, 2, 3, 4, 5].map((star) => {
        const selected = (value ?? 0) >= star;
        const current = value === star;
        return (
          <motion.button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            disabled={disabled}
            whileTap={disabled || shouldReduceMotion ? undefined : { scale: 0.94 }}
            whileHover={disabled || shouldReduceMotion ? undefined : { y: -1 }}
            animate={{
              y: selected && !shouldReduceMotion ? -0.5 : 0,
              scale: current && !shouldReduceMotion ? 1.03 : 1,
            }}
            transition={{
              ...starTransition,
              delay: shouldReduceMotion ? 0 : (star - 1) * 0.02,
            }}
            className={`group relative min-w-[2.15rem] rounded-lg border px-1.5 py-1.5 transition-[background-color,border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[1.95rem] sm:px-1.5 sm:py-1.5 ${
              selected
                ? 'border-amber-200/85 bg-amber-50/95 shadow-[0_3px_10px_rgba(245,158,11,0.14)]'
                : 'border-amber-100/70 bg-white/72 hover:border-amber-200/70 hover:bg-amber-50/80'
            } ${current ? 'border-amber-300/90' : ''}`}
            aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
          >
            <motion.span
              className="relative z-10 flex items-center justify-center"
              animate={{
                scale: selected ? 1.02 : 0.95,
              }}
              transition={{
                ...starTransition,
                delay: shouldReduceMotion ? 0 : (star - 1) * 0.015,
              }}
            >
              <Star
                className={`h-5 w-5 transition-colors duration-200 ${
                  selected ? 'fill-amber-400 text-amber-500' : 'text-amber-200'
                }`}
              />
            </motion.span>
          </motion.button>
        );
      })}
    </div>
  );
}

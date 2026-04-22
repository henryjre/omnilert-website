import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

export interface ViewOption<T extends string = string> {
  id: T;
  label: React.ReactNode;
  icon?: LucideIcon;
  activeClassName?: string;
  activeIndicatorClassName?: string;
  inactiveClassName?: string;
  disabled?: boolean;
  badge?: React.ReactNode;
}

interface ViewToggleProps<T extends string = string> {
  options: ViewOption<T>[];
  activeId: T;
  onChange: (id: T) => void;
  layoutId?: string;
  className?: string;
  labelAboveOnMobile?: boolean;
  showLabelOnMobile?: boolean;
  showIcons?: boolean;
  size?: 'default' | 'compact';
}

export function ViewToggle<T extends string = string>({ 
  options, 
  activeId, 
  onChange, 
  layoutId = 'active-view-underline',
  className = '',
  labelAboveOnMobile = false,
  showLabelOnMobile = false,
  showIcons = true,
  size = 'default',
}: ViewToggleProps<T>) {
  return (
    <div className={`flex w-full gap-1 border-b border-gray-100 ${className}`}>
      {options.map((option) => {
        const isActive = activeId === option.id;
        const Icon = option.icon;
        const activeClassName = option.activeClassName ?? 'text-primary-600';
        const activeIndicatorClassName = option.activeIndicatorClassName ?? 'bg-primary-600';
        const inactiveClassName = option.inactiveClassName ?? 'text-gray-500 hover:text-gray-700';
        const isDisabled = option.disabled;
        const paddingClassName =
          size === 'compact'
            ? 'px-3 py-1.5 sm:py-2 text-xs sm:text-sm'
            : 'px-4 py-2 sm:py-2.5 text-sm';
        const showMobileLabel = !showIcons || showLabelOnMobile;
        return (
          <button
            key={option.id}
            type="button"
            disabled={isDisabled}
            onClick={() => onChange(option.id)}
            className={`relative flex flex-1 items-center justify-center transition-colors sm:flex-none ${
              labelAboveOnMobile ? 'flex-col gap-1.5 sm:flex-row sm:gap-2' : 'gap-2'
            } ${paddingClassName} font-medium ${
              isActive ? activeClassName : inactiveClassName
            } ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            {labelAboveOnMobile && !showMobileLabel && (
              <div className="relative h-[11px] w-full sm:hidden">
                <AnimatePresence initial={false}>
                  {isActive && (
                    <motion.span
                      key={String(option.id)}
                      initial={{ y: 8, opacity: 0, scale: 0.8 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      exit={{ y: 8, opacity: 0, scale: 0.8 }}
                      transition={{ type: 'spring', bounce: 0.4, duration: 0.4 }}
                      className="absolute inset-x-0 top-0 flex justify-center text-[11px] leading-none whitespace-nowrap"
                    >
                      {option.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              {showIcons && Icon ? <Icon className="h-4 w-4" /> : null}
              <span className={`${showMobileLabel ? 'inline' : 'hidden sm:inline'} whitespace-nowrap`}>
                {option.label}
              </span>
              {option.badge}
            </div>
            {isActive && (
              <motion.div
                layoutId={layoutId}
                className={`absolute bottom-0 left-0 right-0 h-0.5 ${activeIndicatorClassName}`}
                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

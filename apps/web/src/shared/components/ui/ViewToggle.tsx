import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

export interface ViewOption<T extends string = string> {
  id: T;
  label: React.ReactNode;
  icon: LucideIcon;
}

interface ViewToggleProps<T extends string = string> {
  options: ViewOption<T>[];
  activeId: T;
  onChange: (id: T) => void;
  layoutId?: string;
  className?: string;
}

export function ViewToggle<T extends string = string>({ 
  options, 
  activeId, 
  onChange, 
  layoutId = 'active-view-underline',
  className = ''
}: ViewToggleProps<T>) {
  return (
    <div className={`flex w-full gap-1 border-b border-gray-100 ${className}`}>
      {options.map((option) => {
        const isActive = activeId === option.id;
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`relative flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors sm:flex-none ${
              isActive ? 'text-primary-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline whitespace-nowrap">{option.label}</span>
            {isActive && (
              <motion.div
                layoutId={layoutId}
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"
                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

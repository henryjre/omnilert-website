import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';

export const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-primary-50 text-primary-700 shadow-sm'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
  }`;

export function AnimatedNavLink({
  to,
  children,
  className,
  end,
  onClick,
}: {
  to: string;
  children: ReactNode;
  className?: string | ((props: { isActive: boolean }) => string | undefined);
  end?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.div whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }} className="block">
      <NavLink to={to} className={className} end={end} onClick={onClick}>
        {children}
      </NavLink>
    </motion.div>
  );
}

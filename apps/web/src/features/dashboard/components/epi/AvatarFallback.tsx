interface AvatarFallbackProps {
  firstName: string;
  lastName: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
};

export function AvatarFallback({
  firstName,
  lastName,
  size = 'md',
  className = '',
}: AvatarFallbackProps) {
  const initials = `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase().trim();

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-gray-200 font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300 ${sizeClasses[size]} ${className}`}
    >
      {initials || '?'}
    </div>
  );
}

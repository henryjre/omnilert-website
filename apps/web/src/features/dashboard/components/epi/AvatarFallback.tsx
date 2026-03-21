import { useEffect, useState } from 'react';
import { resolveAvatarDisplay } from './avatarDisplay';

interface AvatarFallbackProps {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
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
  avatarUrl,
  size = 'md',
  className = '',
}: AvatarFallbackProps) {
  const { imageUrl, initials } = resolveAvatarDisplay({ firstName, lastName, avatarUrl });
  const [imageFailed, setImageFailed] = useState(false);
  const alt = `${firstName.trim()} ${lastName.trim()}`.trim() || 'Profile photo';
  const classes = `flex items-center justify-center overflow-hidden rounded-full bg-gray-200 font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300 ${sizeClasses[size]} ${className}`;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  if (imageUrl && !imageFailed) {
    return (
      <div className={classes}>
        <img
          src={imageUrl}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={classes}>
      {initials || '?'}
    </div>
  );
}

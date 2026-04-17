import { useState } from 'react';

interface CompanyAvatarProps {
  name: string;
  logoUrl: string | null | undefined;
  themeColor: string;
  size: number;
  className?: string;
}

export function CompanyAvatar({ name, logoUrl, themeColor, size, className = '' }: CompanyAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initial = name.trim()[0]?.toUpperCase() ?? '?';
  const fontSize = Math.max(8, Math.round(size * 0.45));

  if (logoUrl && !imgError) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size, backgroundColor: themeColor }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <span
      className={`flex items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{ width: size, height: size, backgroundColor: themeColor, fontSize }}
    >
      {initial}
    </span>
  );
}

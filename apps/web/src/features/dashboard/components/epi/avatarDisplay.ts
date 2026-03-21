interface ResolveAvatarDisplayInput {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}

interface ResolvedAvatarDisplay {
  imageUrl: string | null;
  initials: string;
}

export function resolveAvatarDisplay({
  firstName,
  lastName,
  avatarUrl,
}: ResolveAvatarDisplayInput): ResolvedAvatarDisplay {
  const trimmedFirstName = firstName.trim();
  const trimmedLastName = lastName.trim();
  const initials = `${trimmedFirstName.charAt(0)}${trimmedLastName.charAt(0)}`.toUpperCase().trim() || '?';
  const trimmedAvatarUrl = avatarUrl?.trim() ?? '';

  return {
    imageUrl: trimmedAvatarUrl.length > 0 ? trimmedAvatarUrl : null,
    initials,
  };
}

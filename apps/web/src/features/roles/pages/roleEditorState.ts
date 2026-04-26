export interface RoleEditorSeed {
  id: string;
  name: string;
  color: string | null;
  priority: number;
  discord_id?: string | null;
}

export interface RoleEditorDraft {
  name: string;
  color: string;
  priority: number;
  discord_id: string;
  permissionIds: string[];
}

function normalizePermissionIds(permissionIds: string[]): string[] {
  return [...permissionIds].sort((a, b) => a.localeCompare(b));
}

export function createRoleEditorDraft(role: RoleEditorSeed, permissionIds: string[]): RoleEditorDraft {
  return {
    name: role.name,
    color: role.color ?? '#3498db',
    priority: role.priority,
    discord_id: role.discord_id ?? '',
    permissionIds: normalizePermissionIds(permissionIds),
  };
}

export function hasRoleEditorChanges(original: RoleEditorDraft, draft: RoleEditorDraft): boolean {
  return original.name !== draft.name
    || original.color !== draft.color
    || original.priority !== draft.priority
    || original.discord_id !== draft.discord_id.trim()
    || JSON.stringify(normalizePermissionIds(original.permissionIds))
      !== JSON.stringify(normalizePermissionIds(draft.permissionIds));
}

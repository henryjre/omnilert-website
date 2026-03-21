export interface RoleUpdateInput {
  name?: string;
  description?: string | null;
  color?: string | null;
  priority?: number;
}

export function buildRoleUpdates(input: RoleUpdateInput): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    updated_at: new Date(),
  };

  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.color !== undefined) updates.color = input.color;
  if (input.priority !== undefined) updates.priority = input.priority;

  return updates;
}

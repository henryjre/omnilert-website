export interface Role {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isSystem: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

export interface Permission {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  color?: string;
  priority: number;
  permissionIds: string[];
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  color?: string;
  priority?: number;
}

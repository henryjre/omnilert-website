export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  validIdUrl?: string | null;
  employeeNumber: number | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserWithRoles extends User {
  roles: RoleSummary[];
  permissions: string[];
  branchIds: string[];
}

export interface RoleSummary {
  id: string;
  name: string;
  color: string | null;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  employeeNumber?: number;
  roleIds: string[];
  branchIds: string[];
}

export interface UpdateUserRequest {
  email?: string;
  firstName?: string;
  lastName?: string;
  employeeNumber?: number;
  isActive?: boolean;
}

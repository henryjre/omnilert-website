export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
  companySlug: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  companyThemeColor?: string;
  companyName?: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: { id: string; name: string; color: string | null }[];
    permissions: string[];
    branchIds: string[];
  };
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface SuperAdminLoginRequest {
  email: string;
  password: string;
}

export interface SuperAdminLoginResponse {
  accessToken: string;
}

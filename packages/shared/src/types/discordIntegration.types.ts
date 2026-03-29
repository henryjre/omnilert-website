export interface DiscordIntegrationRole {
  id: string;
  name: string;
  color: string | null;
}

export interface DiscordIntegrationCompany {
  company_id: string;
  company_name: string;
  company_slug: string;
}

export interface DiscordIntegrationCompanyBranch {
  company_id: string;
  company_name: string;
  branch_id: string;
  branch_name: string;
  assignment_type: string;
}

export interface DiscordIntegrationUser {
  id: string;
  user_key: string | null;
  discord_user_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  employee_number: number | null;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  roles: DiscordIntegrationRole[];
  companies: DiscordIntegrationCompany[];
  company_branches: DiscordIntegrationCompanyBranch[];
}

export interface DiscordIntegrationPagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface DiscordIntegrationUsersListData {
  users: DiscordIntegrationUser[];
  pagination: DiscordIntegrationPagination;
}

export interface DiscordIntegrationUserLookupData {
  user: DiscordIntegrationUser;
}

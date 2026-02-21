export interface Company {
  id: string;
  name: string;
  slug: string;
  dbName: string;
  dbHost: string;
  dbPort: number;
  isActive: boolean;
  odooApiKey: string | null;
  themeColor: string;
  companyCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCompanyRequest {
  name: string;
  odooApiKey?: string;
  companyCode?: string;
}

export interface UpdateCompanyRequest {
  name?: string;
  isActive?: boolean;
  odooApiKey?: string;
  themeColor?: string;
  companyCode?: string;
}

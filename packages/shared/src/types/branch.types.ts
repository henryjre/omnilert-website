export interface Branch {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
  odooBranchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBranchRequest {
  name: string;
  address?: string;
  odooBranchId?: string;
}

export interface UpdateBranchRequest {
  name?: string;
  address?: string;
  isActive?: boolean;
  odooBranchId?: string;
}

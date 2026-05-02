import type {
  PayrollAdjustmentEmployeeItem,
  PayrollAdjustmentEmployeeListResponse,
  PayrollAdjustmentEmployeeStatus,
  PayrollAdjustmentManagerStatus,
  PayrollAdjustmentRequestDetail,
  PayrollAdjustmentRequestListResponse,
  PayrollAdjustmentRequestSummary,
  PayrollAdjustmentTarget,
  PayrollAdjustmentType,
} from '@omnilert/shared';
import { canReviewSubmittedRequest } from '@omnilert/shared';
import type { Knex } from 'knex';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAndDispatchNotification } from './notification.service.js';
import {
  createPayrollAdjustmentSalaryAttachment,
  getEmployeeByWebsiteUserKey,
} from './odoo.service.js';

interface BranchScopeRow {
  id: string;
  company_id: string;
  company_name: string;
  name: string;
  odoo_branch_id: string | null;
}

interface RequestRow {
  id: string;
  company_id: string;
  company_name: string;
  branch_id: string;
  branch_name: string;
  type: PayrollAdjustmentType;
  reason: string;
  total_amount: string;
  payroll_periods: number;
  status: PayrollAdjustmentManagerStatus;
  created_by_user_id: string | null;
  created_by_name: string | null;
  processing_owner_user_id: string | null;
  processing_owner_name: string | null;
  approved_by_user_id: string | null;
  approved_by_name: string | null;
  rejected_by_user_id: string | null;
  rejected_by_name: string | null;
  rejection_reason: string | null;
  confirmed_at: Date | null;
  approved_at: Date | null;
  rejected_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface TargetRow {
  id: string;
  request_id: string;
  user_id: string;
  employee_name: string;
  employee_avatar_url: string | null;
  allocated_total_amount: string;
  allocated_monthly_amount: string;
  status: PayrollAdjustmentEmployeeStatus;
  authorized_at: Date | null;
  completed_at: Date | null;
  odoo_salary_attachment_id: number | null;
}

interface EmployeeListRow {
  id: string;
  request_id: string;
  company_id: string;
  company_name: string;
  branch_id: string;
  branch_name: string;
  type: PayrollAdjustmentType;
  status: PayrollAdjustmentEmployeeStatus;
  allocated_total_amount: string;
  allocated_monthly_amount: string;
  payroll_periods: number;
  reason: string;
  issuer_name: string;
  authorized_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  odoo_salary_attachment_id: number | null;
}

interface UserInfo {
  id: string;
  name: string;
  avatarUrl: string | null;
  userKey: string | null;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toAmount(value: string | number): number {
  return Number.parseFloat(String(value));
}

function normalizeName(value: string | null | undefined): string {
  return String(value ?? '').trim() || 'Unknown User';
}

function parseDate(value: Date | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function splitPayrollAdjustmentAllocations(
  totalAmount: number,
  targetUserIds: string[],
  payrollPeriods: number,
): Array<{
  userId: string;
  allocatedTotalAmount: number;
  allocatedMonthlyAmount: number;
}> {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new AppError(400, 'Total amount must be greater than 0');
  }
  if (targetUserIds.length === 0) {
    throw new AppError(400, 'At least one target employee is required');
  }
  if (!Number.isInteger(payrollPeriods) || payrollPeriods <= 0) {
    throw new AppError(400, 'Payroll periods must be a positive integer');
  }

  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / targetUserIds.length);
  const remainderCents = totalCents - baseCents * targetUserIds.length;

  return targetUserIds.map((userId, index) => {
    const allocatedTotalCents = baseCents + (index === targetUserIds.length - 1 ? remainderCents : 0);
    const allocatedMonthlyCents =
      payrollPeriods > 1
        ? Math.round(allocatedTotalCents / payrollPeriods)
        : allocatedTotalCents;

    return {
      userId,
      allocatedTotalAmount: Number((allocatedTotalCents / 100).toFixed(2)),
      allocatedMonthlyAmount: Number((allocatedMonthlyCents / 100).toFixed(2)),
    };
  });
}

export function derivePayrollAdjustmentParentStatus(
  targetStatuses: PayrollAdjustmentEmployeeStatus[],
): PayrollAdjustmentManagerStatus {
  if (targetStatuses.length === 0) return 'employee_approval';
  if (targetStatuses.every((status) => status === 'completed')) return 'completed';
  if (targetStatuses.every((status) => status !== 'pending')) return 'in_progress';
  return 'employee_approval';
}

async function loadBranchScope(
  trx: Knex.Transaction,
  companyId: string,
  branchId: string,
): Promise<BranchScopeRow> {
  const row = await trx('branches as branch')
    .join('companies as company', 'branch.company_id', 'company.id')
    .where({
      'branch.id': branchId,
      'branch.company_id': companyId,
      'branch.is_active': true,
    })
    .select<BranchScopeRow[]>(
      'branch.id',
      'branch.company_id',
      'branch.name',
      'branch.odoo_branch_id',
      'company.name as company_name',
    )
    .first();

  if (!row) {
    throw new AppError(404, 'Branch not found');
  }

  return row;
}

async function loadAssignableUsers(
  trx: Knex.Transaction,
  companyId: string,
  branchId: string,
): Promise<Map<string, UserInfo>> {
  const [companyAssignments, legacyAssignments] = await Promise.all([
    trx('user_company_branches')
      .where({ company_id: companyId, branch_id: branchId })
      .select('user_id'),
    trx('user_branches')
      .where({ company_id: companyId, branch_id: branchId })
      .select('user_id'),
  ]);

  const assignedUserIds = Array.from(new Set([
    ...companyAssignments.map((row: { user_id: string }) => String(row.user_id)),
    ...legacyAssignments.map((row: { user_id: string }) => String(row.user_id)),
  ]));

  if (assignedUserIds.length === 0) {
    return new Map();
  }

  const rows = await trx('users as users')
    .join('user_company_access as uca', function joinUserCompanyAccess() {
      this.on('uca.user_id', '=', 'users.id')
        .andOn('uca.company_id', '=', trx.raw('?', [companyId]))
        .andOn('uca.is_active', '=', trx.raw('true'));
    })
    .whereIn('users.id', assignedUserIds)
    .andWhere('users.is_active', true)
    .select(
      'users.id',
      'users.first_name',
      'users.last_name',
      'users.avatar_url',
      'users.user_key',
    );

  return new Map(
    rows.map((row: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
      user_key: string | null;
    }) => [
      String(row.id),
      {
        id: String(row.id),
        name: normalizeName(`${row.first_name ?? ''} ${row.last_name ?? ''}`),
        avatarUrl: row.avatar_url ?? null,
        userKey: row.user_key ?? null,
      },
    ]),
  );
}

async function loadManagerTargets(
  trx: Knex.Transaction,
  requestIds: string[],
): Promise<Map<string, PayrollAdjustmentTarget[]>> {
  if (requestIds.length === 0) return new Map();

  const rows = await trx('payroll_adjustment_request_targets as target')
    .join('users as employee', 'target.user_id', 'employee.id')
    .whereIn('target.request_id', requestIds)
    .select<TargetRow[]>(
      'target.id',
      'target.request_id',
      'target.user_id',
      trx.raw(`COALESCE(employee.first_name, '') || ' ' || COALESCE(employee.last_name, '') as employee_name`),
      'employee.avatar_url as employee_avatar_url',
      'target.allocated_total_amount',
      'target.allocated_monthly_amount',
      'target.status',
      'target.authorized_at',
      'target.completed_at',
      'target.odoo_salary_attachment_id',
    )
    .orderBy('target.created_at', 'asc');

  const byRequestId = new Map<string, PayrollAdjustmentTarget[]>();

  for (const row of rows) {
    const requestTargets = byRequestId.get(String(row.request_id)) ?? [];
    requestTargets.push({
      id: String(row.id),
      userId: String(row.user_id),
      employeeName: normalizeName(row.employee_name),
      employeeAvatarUrl: row.employee_avatar_url ?? null,
      allocatedTotalAmount: toAmount(row.allocated_total_amount),
      allocatedMonthlyAmount: toAmount(row.allocated_monthly_amount),
      status: row.status,
      authorizedAt: parseDate(row.authorized_at),
      completedAt: parseDate(row.completed_at),
      odooSalaryAttachmentId: row.odoo_salary_attachment_id ?? null,
    });
    byRequestId.set(String(row.request_id), requestTargets);
  }

  return byRequestId;
}

function mapRequestSummary(
  row: RequestRow,
  targets: PayrollAdjustmentTarget[],
): PayrollAdjustmentRequestSummary {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    companyName: String(row.company_name),
    branchId: String(row.branch_id),
    branchName: String(row.branch_name),
    type: row.type,
    totalAmount: toAmount(row.total_amount),
    payrollPeriods: Number(row.payroll_periods),
    status: row.status,
    reason: row.reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : null,
    createdByName: row.created_by_user_id ? normalizeName(row.created_by_name) : 'Omnilert System',
    processingOwnerUserId: row.processing_owner_user_id ? String(row.processing_owner_user_id) : null,
    processingOwnerName: row.processing_owner_user_id
      ? normalizeName(row.processing_owner_name)
      : row.confirmed_at && !row.processing_owner_user_id
        ? 'Omnilert System'
        : null,
    approvedByUserId: row.approved_by_user_id ? String(row.approved_by_user_id) : null,
    approvedByName: row.approved_by_user_id
      ? normalizeName(row.approved_by_name)
      : row.approved_at && !row.approved_by_user_id
        ? 'Omnilert System'
        : null,
    rejectedByUserId: row.rejected_by_user_id ? String(row.rejected_by_user_id) : null,
    rejectedByName: row.rejected_by_user_id ? normalizeName(row.rejected_by_name) : null,
    rejectionReason: row.rejection_reason ?? null,
    confirmedAt: toIso(row.confirmed_at),
    approvedAt: toIso(row.approved_at),
    rejectedAt: toIso(row.rejected_at),
    targets,
  };
}

async function loadManagerRequestRow(
  trx: Knex.Transaction,
  requestId: string,
  companyId: string,
  forUpdate = false,
): Promise<RequestRow> {
  if (forUpdate) {
    // Lock the base request row first. PostgreSQL does not allow FOR UPDATE
    // against the nullable side of the left joins used in the decorated read
    // below, so we acquire the row lock separately inside the same transaction.
    const lockedRow = await trx('payroll_adjustment_requests as request')
      .where({
        'request.id': requestId,
        'request.company_id': companyId,
      })
      .select('request.id')
      .first()
      .forUpdate();

    if (!lockedRow) {
      throw new AppError(404, 'Payroll adjustment request not found');
    }
  }

  const row = await trx('payroll_adjustment_requests as request')
    .join('companies as company', 'request.company_id', 'company.id')
    .join('branches as branch', 'request.branch_id', 'branch.id')
    .leftJoin('users as creator', 'request.created_by_user_id', 'creator.id')
    .leftJoin('users as processing_owner', 'request.processing_owner_user_id', 'processing_owner.id')
    .leftJoin('users as approver', 'request.approved_by_user_id', 'approver.id')
    .leftJoin('users as rejector', 'request.rejected_by_user_id', 'rejector.id')
    .where({
      'request.id': requestId,
      'request.company_id': companyId,
    })
    .select<RequestRow[]>(
      'request.id',
      'request.company_id',
      'company.name as company_name',
      'request.branch_id',
      'branch.name as branch_name',
      'request.type',
      'request.reason',
      'request.total_amount',
      'request.payroll_periods',
      'request.status',
      'request.created_by_user_id',
      trx.raw(`COALESCE(creator.first_name, '') || ' ' || COALESCE(creator.last_name, '') as created_by_name`),
      'request.processing_owner_user_id',
      trx.raw(`COALESCE(processing_owner.first_name, '') || ' ' || COALESCE(processing_owner.last_name, '') as processing_owner_name`),
      'request.approved_by_user_id',
      trx.raw(`COALESCE(approver.first_name, '') || ' ' || COALESCE(approver.last_name, '') as approved_by_name`),
      'request.rejected_by_user_id',
      trx.raw(`COALESCE(rejector.first_name, '') || ' ' || COALESCE(rejector.last_name, '') as rejected_by_name`),
      'request.rejection_reason',
      'request.confirmed_at',
      'request.approved_at',
      'request.rejected_at',
      'request.created_at',
      'request.updated_at',
    )
    .first();

  if (!row) {
    throw new AppError(404, 'Payroll adjustment request not found');
  }

  return row;
}

async function loadTargetRowForEmployee(
  trx: Knex.Transaction,
  targetId: string,
  userId: string,
  companyId?: string,
  forUpdate = false,
): Promise<{
  targetId: string;
  requestId: string;
  companyId: string;
  branchId: string;
  branchName: string;
  branchOdooCompanyId: string | null;
  type: PayrollAdjustmentType;
  status: PayrollAdjustmentEmployeeStatus;
  requestStatus: PayrollAdjustmentManagerStatus;
  payrollPeriods: number;
  reason: string;
  issuerName: string;
  createdAt: Date;
  authorizedAt: Date | null;
  completedAt: Date | null;
  allocatedTotalAmount: string;
  allocatedMonthlyAmount: string;
  odooSalaryAttachmentId: number | null;
}> {
  if (forUpdate) {
    const lockedTarget = await trx('payroll_adjustment_request_targets as target')
      .join('payroll_adjustment_requests as request', 'target.request_id', 'request.id')
      .where({
        'target.id': targetId,
        'target.user_id': userId,
      })
      .modify((builder) => {
        if (companyId) {
          builder.andWhere('request.company_id', companyId);
        }
      })
      .whereIn('request.status', ['employee_approval', 'in_progress', 'completed'])
      .select('target.id')
      .first()
      .forUpdate();

    if (!lockedTarget) {
      throw new AppError(404, 'Payroll adjustment not found');
    }

    await trx('payroll_adjustment_requests as request')
      .join('payroll_adjustment_request_targets as target', 'target.request_id', 'request.id')
      .where({
        'target.id': targetId,
        'target.user_id': userId,
      })
      .select('request.id')
      .first()
      .forUpdate();
  }

  let query = trx('payroll_adjustment_request_targets as target')
    .join('payroll_adjustment_requests as request', 'target.request_id', 'request.id')
    .join('branches as branch', 'request.branch_id', 'branch.id')
    .leftJoin('users as creator', 'request.created_by_user_id', 'creator.id')
    .where({
      'target.id': targetId,
      'target.user_id': userId,
    })
    .whereIn('request.status', ['employee_approval', 'in_progress', 'completed'])
    .select(
      'target.id as target_id',
      'target.request_id',
      'request.company_id',
      'request.branch_id',
      'branch.name as branch_name',
      'branch.odoo_branch_id as branch_odoo_company_id',
      'request.type',
      'target.status',
      'request.status as request_status',
      'request.payroll_periods',
      'request.reason',
      trx.raw(`CASE WHEN creator.id IS NULL THEN 'Omnilert System' ELSE COALESCE(creator.first_name, '') || ' ' || COALESCE(creator.last_name, '') END as issuer_name`),
      'request.created_at',
      'target.authorized_at',
      'target.completed_at',
      'target.allocated_total_amount',
      'target.allocated_monthly_amount',
      'target.odoo_salary_attachment_id',
    )
    .first();

  if (companyId) {
    query = query.andWhere('request.company_id', companyId);
  }

  const row = await query as any;

  if (!row) {
    throw new AppError(404, 'Payroll adjustment not found');
  }

  return {
    targetId: String(row.target_id),
    requestId: String(row.request_id),
    companyId: String(row.company_id),
    branchId: String(row.branch_id),
    branchName: String(row.branch_name),
    branchOdooCompanyId: row.branch_odoo_company_id ? String(row.branch_odoo_company_id) : null,
    type: row.type as PayrollAdjustmentType,
    status: row.status as PayrollAdjustmentEmployeeStatus,
    requestStatus: row.request_status as PayrollAdjustmentManagerStatus,
    payrollPeriods: Number(row.payroll_periods),
    reason: String(row.reason),
    issuerName: normalizeName(row.issuer_name),
    createdAt: row.created_at as Date,
    authorizedAt: row.authorized_at as Date | null,
    completedAt: row.completed_at as Date | null,
    allocatedTotalAmount: String(row.allocated_total_amount),
    allocatedMonthlyAmount: String(row.allocated_monthly_amount),
    odooSalaryAttachmentId: row.odoo_salary_attachment_id
      ? Number(row.odoo_salary_attachment_id)
      : null,
  };
}

async function replaceRequestTargets(
  trx: Knex.Transaction,
  requestId: string,
  allocations: Array<{
    userId: string;
    allocatedTotalAmount: number;
    allocatedMonthlyAmount: number;
  }>,
): Promise<void> {
  await trx('payroll_adjustment_request_targets')
    .where({ request_id: requestId })
    .delete();

  await trx('payroll_adjustment_request_targets').insert(
    allocations.map((allocation) => ({
      request_id: requestId,
      user_id: allocation.userId,
      allocated_total_amount: allocation.allocatedTotalAmount,
      allocated_monthly_amount: allocation.allocatedMonthlyAmount,
      status: 'pending',
      authorized_at: null,
      completed_at: null,
      odoo_salary_attachment_id: null,
    })),
  );
}

async function recomputeRequestStatus(
  trx: Knex.Transaction,
  requestId: string,
): Promise<PayrollAdjustmentManagerStatus> {
  const rows = await trx('payroll_adjustment_request_targets')
    .where({ request_id: requestId })
    .select<Array<{ status: PayrollAdjustmentEmployeeStatus }>>('status');

  const nextStatus = derivePayrollAdjustmentParentStatus(rows.map((row) => row.status));

  await trx('payroll_adjustment_requests')
    .where({ id: requestId })
    .update({
      status: nextStatus,
      updated_at: trx.fn.now(),
    });

  return nextStatus;
}

export async function listPayrollAdjustmentRequests(params: {
  companyId: string;
  status?: PayrollAdjustmentManagerStatus;
  branchIds?: string[];
  page: number;
  limit: number;
}): Promise<PayrollAdjustmentRequestListResponse> {
  const knex = db.getDb();
  const sanitizedBranchIds = Array.from(new Set(params.branchIds ?? []));

  const baseQuery = () => {
    let query = knex('payroll_adjustment_requests as request')
      .where('request.company_id', params.companyId);

    if (params.status) {
      query = query.andWhere('request.status', params.status);
    }

    if (sanitizedBranchIds.length > 0) {
      query = query.whereIn('request.branch_id', sanitizedBranchIds);
    }

    return query;
  };

  const countRow = await baseQuery().count<{ count: string }>('* as count').first();
  const total = Number(countRow?.count ?? 0);

  const rows = await baseQuery()
    .join('companies as company', 'request.company_id', 'company.id')
    .join('branches as branch', 'request.branch_id', 'branch.id')
    .leftJoin('users as creator', 'request.created_by_user_id', 'creator.id')
    .leftJoin('users as processing_owner', 'request.processing_owner_user_id', 'processing_owner.id')
    .leftJoin('users as approver', 'request.approved_by_user_id', 'approver.id')
    .leftJoin('users as rejector', 'request.rejected_by_user_id', 'rejector.id')
    .select<RequestRow[]>(
      'request.id',
      'request.company_id',
      'company.name as company_name',
      'request.branch_id',
      'branch.name as branch_name',
      'request.type',
      'request.reason',
      'request.total_amount',
      'request.payroll_periods',
      'request.status',
      'request.created_by_user_id',
      knex.raw(`COALESCE(creator.first_name, '') || ' ' || COALESCE(creator.last_name, '') as created_by_name`),
      'request.processing_owner_user_id',
      knex.raw(`COALESCE(processing_owner.first_name, '') || ' ' || COALESCE(processing_owner.last_name, '') as processing_owner_name`),
      'request.approved_by_user_id',
      knex.raw(`COALESCE(approver.first_name, '') || ' ' || COALESCE(approver.last_name, '') as approved_by_name`),
      'request.rejected_by_user_id',
      knex.raw(`COALESCE(rejector.first_name, '') || ' ' || COALESCE(rejector.last_name, '') as rejected_by_name`),
      'request.rejection_reason',
      'request.confirmed_at',
      'request.approved_at',
      'request.rejected_at',
      'request.created_at',
      'request.updated_at',
    )
    .orderBy('request.created_at', 'desc')
    .offset((params.page - 1) * params.limit)
    .limit(params.limit);

  const targetsByRequestId = await knex.transaction((trx) =>
    loadManagerTargets(trx, rows.map((row) => String(row.id))),
  );

  return {
    items: rows.map((row) => mapRequestSummary(row, targetsByRequestId.get(String(row.id)) ?? [])),
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / Math.max(1, params.limit)),
    },
  };
}

export async function createPayrollAdjustmentRequest(params: {
  companyId: string;
  branchId: string;
  createdByUserId: string;
  type: PayrollAdjustmentType;
  totalAmount: number;
  reason: string;
  payrollPeriods: number;
  targetUserIds: string[];
}): Promise<{ id: string }> {
  const knex = db.getDb();

  return knex.transaction(async (trx) => {
    await loadBranchScope(trx, params.companyId, params.branchId);
    const assignableUsers = await loadAssignableUsers(trx, params.companyId, params.branchId);
    const uniqueTargetUserIds = Array.from(new Set(params.targetUserIds));

    for (const userId of uniqueTargetUserIds) {
      if (!assignableUsers.has(userId)) {
        throw new AppError(400, 'One or more selected employees are not assigned to the branch');
      }
    }

    const [requestRow] = await trx('payroll_adjustment_requests')
      .insert({
        company_id: params.companyId,
        branch_id: params.branchId,
        type: params.type,
        reason: params.reason,
        total_amount: params.totalAmount,
        payroll_periods: params.payrollPeriods,
        status: 'pending',
        created_by_user_id: params.createdByUserId,
      })
      .returning('id');

    const requestId = String(requestRow.id);
    const allocations = splitPayrollAdjustmentAllocations(
      params.totalAmount,
      uniqueTargetUserIds,
      params.payrollPeriods,
    );

    await replaceRequestTargets(trx, requestId, allocations);
    return { id: requestId };
  });
}

export async function getPayrollAdjustmentRequestDetail(
  requestId: string,
  companyId: string,
): Promise<PayrollAdjustmentRequestDetail> {
  const knex = db.getDb();

  return knex.transaction(async (trx) => {
    const row = await loadManagerRequestRow(trx, requestId, companyId);
    const targetsByRequestId = await loadManagerTargets(trx, [requestId]);
    return mapRequestSummary(row, targetsByRequestId.get(requestId) ?? []);
  });
}

export async function confirmPayrollAdjustmentRequest(
  requestId: string,
  companyId: string,
  actingUserId: string,
): Promise<void> {
  const knex = db.getDb();

  await knex.transaction(async (trx) => {
    const row = await loadManagerRequestRow(trx, requestId, companyId, true);

    if (row.status !== 'pending') {
      throw new AppError(400, 'Only pending requests can be confirmed');
    }
    if (!canReviewSubmittedRequest({ actingUserId, requestUserId: row.created_by_user_id })) {
      throw new AppError(403, 'You cannot confirm your own request');
    }

    await trx('payroll_adjustment_requests')
      .where({ id: requestId })
      .update({
        status: 'processing',
        processing_owner_user_id: actingUserId,
        confirmed_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
  });
}

export async function updatePayrollAdjustmentProcessing(params: {
  requestId: string;
  companyId: string;
  actingUserId: string;
  totalAmount: number;
  payrollPeriods: number;
  targetUserIds: string[];
}): Promise<void> {
  const knex = db.getDb();

  await knex.transaction(async (trx) => {
    const row = await loadManagerRequestRow(trx, params.requestId, params.companyId, true);

    if (row.status !== 'processing') {
      throw new AppError(400, 'Only processing requests can be updated');
    }
    if (row.processing_owner_user_id !== params.actingUserId) {
      throw new AppError(403, 'Only the processing owner can update this request');
    }

    const assignableUsers = await loadAssignableUsers(trx, params.companyId, row.branch_id);
    const uniqueTargetUserIds = Array.from(new Set(params.targetUserIds));

    for (const userId of uniqueTargetUserIds) {
      if (!assignableUsers.has(userId)) {
        throw new AppError(400, 'One or more selected employees are not assigned to the branch');
      }
    }

    const allocations = splitPayrollAdjustmentAllocations(
      params.totalAmount,
      uniqueTargetUserIds,
      params.payrollPeriods,
    );

    await trx('payroll_adjustment_requests')
      .where({ id: params.requestId })
      .update({
        total_amount: params.totalAmount,
        payroll_periods: params.payrollPeriods,
        updated_at: trx.fn.now(),
      });

    await replaceRequestTargets(trx, params.requestId, allocations);
  });
}

export async function rejectPayrollAdjustmentRequest(params: {
  requestId: string;
  companyId: string;
  actingUserId: string;
  reason: string;
}): Promise<void> {
  const knex = db.getDb();

  await knex.transaction(async (trx) => {
    const row = await loadManagerRequestRow(trx, params.requestId, params.companyId, true);

    if (!['pending', 'processing'].includes(row.status)) {
      throw new AppError(400, 'Only pending or processing requests can be rejected');
    }

    if (row.status === 'pending') {
      if (!canReviewSubmittedRequest({ actingUserId: params.actingUserId, requestUserId: row.created_by_user_id })) {
        throw new AppError(403, 'You cannot reject your own request');
      }
    } else if (row.processing_owner_user_id !== params.actingUserId) {
      throw new AppError(403, 'Only the processing owner can reject this request');
    }

    await trx('payroll_adjustment_requests')
      .where({ id: params.requestId })
      .update({
        status: 'rejected',
        rejected_by_user_id: params.actingUserId,
        rejection_reason: params.reason,
        rejected_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
  });
}

export async function approvePayrollAdjustmentRequest(params: {
  requestId: string;
  companyId: string;
  actingUserId: string;
}): Promise<void> {
  const knex = db.getDb();

  const targetNotifications = await knex.transaction(async (trx) => {
    const row = await loadManagerRequestRow(trx, params.requestId, params.companyId, true);

    if (row.status !== 'processing') {
      throw new AppError(400, 'Only processing requests can be approved');
    }
    if (row.processing_owner_user_id !== params.actingUserId) {
      throw new AppError(403, 'Only the processing owner can approve this request');
    }
    if (!canReviewSubmittedRequest({ actingUserId: params.actingUserId, requestUserId: row.created_by_user_id })) {
      throw new AppError(403, 'You cannot approve your own request');
    }

    const targets = await trx('payroll_adjustment_request_targets')
      .where({ request_id: params.requestId })
      .select<Array<{ id: string; user_id: string }>>('id', 'user_id');

    await trx('payroll_adjustment_requests')
      .where({ id: params.requestId })
      .update({
        status: 'employee_approval',
        approved_by_user_id: params.actingUserId,
        approved_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

    return targets.map((target) => ({
      targetId: String(target.id),
      userId: String(target.user_id),
      companyId: row.company_id,
    }));
  });

  await Promise.allSettled(
    targetNotifications.map((target) =>
      createAndDispatchNotification({
        userId: target.userId,
        companyId: target.companyId,
        title: 'Payroll Adjustment Authorization Required',
        message: 'A payroll adjustment is awaiting your authorization.',
        type: 'info',
        linkUrl: `/account/payslip?tab=adjustments&adjustmentId=${target.targetId}`,
      }),
    ),
  );
}

export async function listPayrollAdjustmentEmployeeItems(params: {
  companyId: string;
  userId: string;
  status?: PayrollAdjustmentEmployeeStatus;
  branchIds?: string[];
  page: number;
  limit: number;
}): Promise<PayrollAdjustmentEmployeeListResponse> {
  const knex = db.getDb();
  const sanitizedBranchIds = Array.from(new Set(params.branchIds ?? []));

  const baseQuery = () => {
    let query = knex('payroll_adjustment_request_targets as target')
      .join('payroll_adjustment_requests as request', 'target.request_id', 'request.id')
      .where('request.company_id', params.companyId)
      .andWhere('target.user_id', params.userId)
      .whereIn('request.status', ['employee_approval', 'in_progress', 'completed']);

    if (params.status) {
      query = query.andWhere('target.status', params.status);
    }
    if (sanitizedBranchIds.length > 0) {
      query = query.whereIn('request.branch_id', sanitizedBranchIds);
    }

    return query;
  };

  const countRow = await baseQuery().count<{ count: string }>('* as count').first();
  const total = Number(countRow?.count ?? 0);

  const rows = await baseQuery()
    .join('companies as company', 'request.company_id', 'company.id')
    .join('branches as branch', 'request.branch_id', 'branch.id')
    .leftJoin('users as creator', 'request.created_by_user_id', 'creator.id')
    .select<EmployeeListRow[]>(
      'target.id',
      'target.request_id',
      'request.company_id',
      'company.name as company_name',
      'request.branch_id',
      'branch.name as branch_name',
      'request.type',
      'target.status',
      'target.allocated_total_amount',
      'target.allocated_monthly_amount',
      'request.payroll_periods',
      'request.reason',
      trxRawName(knex, 'creator', 'issuer_name'),
      'target.authorized_at',
      'target.completed_at',
      'request.created_at',
      'target.odoo_salary_attachment_id',
    )
    .orderBy('request.created_at', 'desc')
    .offset((params.page - 1) * params.limit)
    .limit(params.limit);

  return {
    items: rows.map((row) => ({
      id: String(row.id),
      requestId: String(row.request_id),
      companyId: String(row.company_id),
      companyName: String(row.company_name),
      branchId: String(row.branch_id),
      branchName: String(row.branch_name),
      type: row.type,
      status: row.status,
      amount: toAmount(row.allocated_total_amount),
      monthlyAmount: toAmount(row.allocated_monthly_amount),
      payrollPeriods: Number(row.payroll_periods),
      reason: String(row.reason),
      issuerName: normalizeName(row.issuer_name),
      submittedAt: row.created_at.toISOString(),
      authorizedAt: parseDate(row.authorized_at),
      completedAt: parseDate(row.completed_at),
      odooSalaryAttachmentId: row.odoo_salary_attachment_id ?? null,
    })),
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / Math.max(1, params.limit)),
    },
  };
}

function trxRawName(knexLike: Knex | Knex.Transaction, alias: string, output: string) {
  return knexLike.raw(
    `CASE WHEN ${alias}.id IS NULL THEN 'Omnilert System' ELSE COALESCE(${alias}.first_name, '') || ' ' || COALESCE(${alias}.last_name, '') END as ${output}`,
  );
}

export async function getPayrollAdjustmentEmployeeDetail(params: {
  targetId: string;
  userId: string;
  companyId: string;
}): Promise<PayrollAdjustmentEmployeeItem> {
  const knex = db.getDb();

  const row = await knex('payroll_adjustment_request_targets as target')
    .join('payroll_adjustment_requests as request', 'target.request_id', 'request.id')
    .join('companies as company', 'request.company_id', 'company.id')
    .join('branches as branch', 'request.branch_id', 'branch.id')
    .leftJoin('users as creator', 'request.created_by_user_id', 'creator.id')
    .where({
      'target.id': params.targetId,
      'target.user_id': params.userId,
      'request.company_id': params.companyId,
    })
    .whereIn('request.status', ['employee_approval', 'in_progress', 'completed'])
    .select<EmployeeListRow[]>(
      'target.id',
      'target.request_id',
      'request.company_id',
      'company.name as company_name',
      'request.branch_id',
      'branch.name as branch_name',
      'request.type',
      'target.status',
      'target.allocated_total_amount',
      'target.allocated_monthly_amount',
      'request.payroll_periods',
      'request.reason',
      trxRawName(knex, 'creator', 'issuer_name'),
      'target.authorized_at',
      'target.completed_at',
      'request.created_at',
      'target.odoo_salary_attachment_id',
    )
    .first();

  if (!row) {
    throw new AppError(404, 'Payroll adjustment not found');
  }

  return {
    id: String(row.id),
    requestId: String(row.request_id),
    companyId: String(row.company_id),
    companyName: String(row.company_name),
    branchId: String(row.branch_id),
    branchName: String(row.branch_name),
    type: row.type,
    status: row.status,
    amount: toAmount(row.allocated_total_amount),
    monthlyAmount: toAmount(row.allocated_monthly_amount),
    payrollPeriods: Number(row.payroll_periods),
    reason: String(row.reason),
    issuerName: normalizeName(row.issuer_name),
    submittedAt: row.created_at.toISOString(),
    authorizedAt: parseDate(row.authorized_at),
    completedAt: parseDate(row.completed_at),
    odooSalaryAttachmentId: row.odoo_salary_attachment_id ?? null,
  };
}

export async function authorizePayrollAdjustment(params: {
  targetId: string;
  userId: string;
  companyId: string;
}): Promise<void> {
  const knex = db.getDb();

  await knex.transaction(async (trx) => {
    const target = await loadTargetRowForEmployee(
      trx,
      params.targetId,
      params.userId,
      params.companyId,
      true,
    );

    if (target.status !== 'pending') {
      throw new AppError(400, 'Only pending payroll adjustments can be authorized');
    }
    if (target.requestStatus !== 'employee_approval') {
      throw new AppError(400, 'This payroll adjustment is not awaiting employee approval');
    }
    if (!target.branchOdooCompanyId) {
      throw new AppError(400, 'Selected branch is not linked to an Odoo company');
    }

    const user = await trx('users')
      .where({ id: params.userId })
      .select<Array<{ user_key: string | null }>>('user_key')
      .first();

    if (!user?.user_key) {
      throw new AppError(400, 'User has no linked Odoo account');
    }

    const employee = await getEmployeeByWebsiteUserKey(
      user.user_key,
      Number.parseInt(target.branchOdooCompanyId, 10),
    );

    if (!employee) {
      throw new AppError(400, 'Could not find the employee record in Odoo for this branch');
    }

    const odooSalaryAttachmentId = await createPayrollAdjustmentSalaryAttachment({
      employeeId: employee.id,
      type: target.type,
      totalAmount: toAmount(target.allocatedTotalAmount),
      monthlyAmount:
        target.payrollPeriods > 1
          ? toAmount(target.allocatedMonthlyAmount)
          : toAmount(target.allocatedTotalAmount),
      payrollPeriods: target.payrollPeriods,
      description: target.reason,
    });

    await trx('payroll_adjustment_request_targets')
      .where({ id: params.targetId })
      .update({
        status: 'in_progress',
        authorized_at: trx.fn.now(),
        odoo_salary_attachment_id: odooSalaryAttachmentId,
        updated_at: trx.fn.now(),
      });

    await recomputeRequestStatus(trx, target.requestId);
  });
}

export async function completePayrollAdjustmentFromWebhook(
  odooSalaryAttachmentId: number,
): Promise<void> {
  const knex = db.getDb();

  await knex.transaction(async (trx) => {
    const target = await trx('payroll_adjustment_request_targets')
      .where({ odoo_salary_attachment_id: odooSalaryAttachmentId })
      .select<Array<{
        id: string;
        request_id: string;
        status: PayrollAdjustmentEmployeeStatus;
      }>>('id', 'request_id', 'status')
      .first()
      .forUpdate();

    if (!target) {
      return;
    }
    if (target.status === 'completed') {
      return;
    }

    await trx('payroll_adjustment_request_targets')
      .where({ id: target.id })
      .update({
        status: 'completed',
        completed_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

    await recomputeRequestStatus(trx, String(target.request_id));
  });
}

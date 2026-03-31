import type { AuditResultsWebhookPayload, StoreAudit } from '@omnilert/shared';
import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { getEmployeeWebsiteKeyByEmployeeId } from './odoo.service.js';

const AUDIT_RESULTS_WEBHOOK_URL = 'https://n8n.omnilert.app/webhook/audit_results';
const AUDIT_RESULTS_WEBHOOK_TIMEOUT_MS = 5000;

type LoggerLike = {
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

type StoreAuditWebhookAudit = Pick<
  StoreAudit,
  | 'id'
  | 'type'
  | 'status'
  | 'branch_id'
  | 'completed_at'
  | 'created_at'
  | 'css_date_order'
  | 'css_pos_reference'
  | 'css_odoo_order_id'
  | 'css_company_name'
  | 'css_cashier_name'
  | 'audited_user_id'
  | 'audited_user_key'
  | 'css_cashier_user_key'
  | 'css_star_rating'
  | 'scc_odoo_employee_id'
  | 'scc_employee_name'
  | 'scc_productivity_rate'
  | 'scc_uniform_compliance'
  | 'scc_hygiene_compliance'
  | 'scc_sop_compliance'
  | 'scc_customer_interaction'
  | 'scc_cashiering'
  | 'scc_suggestive_selling_and_upselling'
  | 'scc_service_efficiency'
> & {
  branch_name?: string | null;
};

type AuditResultsRecipient = AuditResultsWebhookPayload['recipient'];
type AuditResultsCompany = AuditResultsWebhookPayload['company'];

type NotifyCompletedStoreAuditInput = {
  companyId: string;
  audit: StoreAuditWebhookAudit;
};

type StoreAuditResultsWebhookNotifierDeps = {
  webhookUrl: string;
  resolveServiceCrewCctvWebsiteUserKey: (odooEmployeeId: number) => Promise<string | null>;
  findUserById: (
    userId: string,
    audit: StoreAuditWebhookAudit,
  ) => Promise<AuditResultsRecipient | null>;
  findUserByUserKey: (
    userKey: string,
    audit: StoreAuditWebhookAudit,
  ) => Promise<AuditResultsRecipient | null>;
  findCompanyById: (
    companyId: string,
    audit: StoreAuditWebhookAudit,
  ) => Promise<AuditResultsCompany>;
  sendWebhook: (payload: AuditResultsWebhookPayload) => Promise<void>;
  log: LoggerLike;
};

function formatAuditTypeLabel(type: StoreAudit['type']): AuditResultsWebhookPayload['audit']['type_label'] {
  return type === 'customer_service' ? 'Customer Service Audit' : 'Service Crew CCTV Audit';
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(2).replace(/\.?0+$/, '');
}

export function buildAuditResultsWebhookPayload(input: {
  audit: StoreAuditWebhookAudit;
  recipient: AuditResultsRecipient;
  company: AuditResultsCompany;
}): AuditResultsWebhookPayload {
  const { audit } = input;

  if (audit.type === 'customer_service') {
    const overallValue = Number(audit.css_star_rating ?? 0);

    return {
      event: 'store_audit.completed',
      version: 1,
      recipient: input.recipient,
      company: input.company,
      branch: {
        id: audit.branch_id,
        name: audit.branch_name ?? 'Unknown Branch',
      },
      audit: {
        id: audit.id,
        type: audit.type,
        type_label: formatAuditTypeLabel(audit.type),
        completed_at: audit.completed_at ? new Date(audit.completed_at).toISOString() : '',
        observed_at: audit.css_date_order,
        source_type: 'pos_order',
        source_reference:
          audit.css_pos_reference
          ?? (audit.css_odoo_order_id !== null ? `order:${audit.css_odoo_order_id}` : `audit:${audit.id}`),
      },
      summary: {
        result_line: `Overall score: ${formatCompactNumber(overallValue)} / 5`,
        overall_value: overallValue,
        overall_max: 5,
        overall_unit: 'rating',
      },
    };
  }

  return {
    event: 'store_audit.completed',
    version: 1,
    recipient: input.recipient,
    company: input.company,
    branch: {
      id: audit.branch_id,
      name: audit.branch_name ?? 'Unknown Branch',
    },
    audit: {
      id: audit.id,
      type: audit.type,
      type_label: formatAuditTypeLabel(audit.type),
      completed_at: audit.completed_at ? new Date(audit.completed_at).toISOString() : '',
      observed_at: audit.created_at,
      source_type: 'attendance',
      source_reference: 'CCTV Observation',
    },
    summary: {
      result_line: 'Status: Completed. Includes compliance checks and customer service ratings.',
      overall_value: null,
      overall_max: null,
      overall_unit: 'text',
    },
  };
}

async function defaultFindUserByUserKey(
  userKey: string,
  audit: StoreAuditWebhookAudit,
): Promise<AuditResultsRecipient | null> {
  const row = await db.getDb()('users')
    .where({ user_key: userKey })
    .first('id', 'user_key', 'email', 'first_name', 'last_name');

  const email = String(row?.email ?? '').trim();
  if (!row || !email) {
    return null;
  }

  const fullName = `${String(row.first_name ?? '').trim()} ${String(row.last_name ?? '').trim()}`.trim()
    || audit.css_cashier_name
    || audit.scc_employee_name
    || email;

  return {
    user_id: String(row.id),
    user_key: String(row.user_key),
    email,
    full_name: fullName,
  };
}

async function defaultFindUserById(
  userId: string,
  audit: StoreAuditWebhookAudit,
): Promise<AuditResultsRecipient | null> {
  const row = await db.getDb()('users')
    .where({ id: userId })
    .first('id', 'user_key', 'email', 'first_name', 'last_name');

  const email = String(row?.email ?? '').trim();
  const userKey = String(row?.user_key ?? '').trim();
  if (!row || !email || !userKey) {
    return null;
  }

  const fullName = `${String(row.first_name ?? '').trim()} ${String(row.last_name ?? '').trim()}`.trim()
    || audit.css_cashier_name
    || audit.scc_employee_name
    || email;

  return {
    user_id: String(row.id),
    user_key: userKey,
    email,
    full_name: fullName,
  };
}

async function defaultFindCompanyById(
  companyId: string,
  audit: StoreAuditWebhookAudit,
): Promise<AuditResultsCompany> {
  const row = await db.getDb()('companies').where({ id: companyId }).first('id', 'name');

  return {
    id: String(row?.id ?? companyId),
    name: String(row?.name ?? audit.css_company_name ?? 'Unknown Company'),
  };
}

async function defaultSendWebhook(payload: AuditResultsWebhookPayload): Promise<void> {
  const response = await fetch(AUDIT_RESULTS_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(AUDIT_RESULTS_WEBHOOK_TIMEOUT_MS),
  });

  if (response.ok) {
    return;
  }

  const responseText = await response.text();
  throw new Error(
    `Audit results webhook failed with ${response.status}: ${responseText.slice(0, 500)}`,
  );
}

export function createStoreAuditResultsWebhookNotifier(
  overrides: Partial<StoreAuditResultsWebhookNotifierDeps> = {},
) {
  const deps: StoreAuditResultsWebhookNotifierDeps = {
    webhookUrl: overrides.webhookUrl ?? AUDIT_RESULTS_WEBHOOK_URL,
    resolveServiceCrewCctvWebsiteUserKey:
      overrides.resolveServiceCrewCctvWebsiteUserKey ?? getEmployeeWebsiteKeyByEmployeeId,
    findUserById: overrides.findUserById ?? defaultFindUserById,
    findUserByUserKey: overrides.findUserByUserKey ?? defaultFindUserByUserKey,
    findCompanyById: overrides.findCompanyById ?? defaultFindCompanyById,
    sendWebhook: overrides.sendWebhook ?? defaultSendWebhook,
    log: overrides.log ?? logger,
  };

  return async function notifyCompletedStoreAudit(input: NotifyCompletedStoreAuditInput) {
    const auditedUserId = String(input.audit.audited_user_id ?? '').trim() || null;
    const canonicalAuditedUserKey = String(input.audit.audited_user_key ?? '').trim() || null;
    let recipient: AuditResultsRecipient | null = null;

    if (auditedUserId) {
      recipient = await deps.findUserById(auditedUserId, input.audit);
    }

    if (!recipient && canonicalAuditedUserKey) {
      recipient = await deps.findUserByUserKey(canonicalAuditedUserKey, input.audit);
    }

    // Temporary fallback path while old rows are still being backfilled.
    if (!recipient) {
      const legacyAuditedUserKey = input.audit.type === 'customer_service'
        ? String(input.audit.css_cashier_user_key ?? '').trim() || null
        : input.audit.scc_odoo_employee_id !== null
          ? await deps.resolveServiceCrewCctvWebsiteUserKey(Number(input.audit.scc_odoo_employee_id))
          : null;

      if (legacyAuditedUserKey) {
        recipient = await deps.findUserByUserKey(legacyAuditedUserKey, input.audit);
      }
    }

    if (!recipient) {
      deps.log.warn(
        { auditId: input.audit.id, auditType: input.audit.type },
        'Skipping audit results webhook because the audited user could not be resolved',
      );
      return {
        status: 'skipped' as const,
        reason: 'recipient_not_found' as const,
      };
    }

    const company = await deps.findCompanyById(input.companyId, input.audit);
    const payload = buildAuditResultsWebhookPayload({
      audit: input.audit,
      recipient,
      company,
    });

    try {
      if (deps.sendWebhook === defaultSendWebhook && deps.webhookUrl !== AUDIT_RESULTS_WEBHOOK_URL) {
        const response = await fetch(deps.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(AUDIT_RESULTS_WEBHOOK_TIMEOUT_MS),
        });

        if (!response.ok) {
          const responseText = await response.text();
          throw new Error(
            `Audit results webhook failed with ${response.status}: ${responseText.slice(0, 500)}`,
          );
        }
      } else {
        await deps.sendWebhook(payload);
      }

      return {
        status: 'sent' as const,
      };
    } catch (error) {
      deps.log.error(
        { err: error, auditId: input.audit.id, auditType: input.audit.type },
        'Failed to deliver audit results webhook',
      );
      return {
        status: 'skipped' as const,
        reason: 'webhook_failed' as const,
      };
    }
  };
}

export const notifyCompletedStoreAudit = createStoreAuditResultsWebhookNotifier();

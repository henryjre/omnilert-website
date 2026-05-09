import type { Knex } from 'knex';
import { PERMISSIONS } from '@omnilert/shared';
import { db } from '../config/database.js';
import { getIO } from '../config/socket.js';
import { logger } from '../utils/logger.js';
import { createAndDispatchNotification } from './notification.service.js';
import { resolveCompanyUsersWithPermission } from './globalUser.service.js';

const DEBOUNCE_MS = 5000;
const INVENTORY_ADJUSTMENT_LOCATION = 'virtual locations/inventory adjustment';

type ProductLine = {
  odoo_product_tmpl_id: number;
  product_name: string;
  quantity: number;
  uom_name: string;
  flag_type: 'threshold_violation' | 'invalid_threshold';
  discrepancy_direction: 'negative' | 'positive' | 'neutral';
  threshold_value: string;
  aic_date: Date;
  create_date: string;
};

type BatchEntry = {
  odoo_company_id: number;
  products: ProductLine[];
};

const batchMap = new Map<string, BatchEntry>();
const timerMap = new Map<string, NodeJS.Timeout>();

export type OdooAicPayload = {
  company_id: number;
  create_date: string;
  quantity: number | string;
  reference: string;
  x_aic_threshold: number | string | false;
  x_product_name: string;
  x_product_tmpl_id: number;
  x_uom_name: string;
  x_destination_name?: string | false | null;
  x_source_name?: string | false | null;
};

type ClassifyResult =
  | { kind: 'normal'; threshold_value: string }
  | { kind: 'flagged'; flag_type: 'threshold_violation' | 'invalid_threshold'; threshold_value: string };

function toDisplayValue(value: unknown, fallback = 'N/A'): string {
  if (value === false || value === null || value === undefined) return fallback;

  const stringValue = String(value).trim();
  if (stringValue.length === 0) return fallback;
  if (stringValue.toLowerCase() === 'false') return fallback;

  return stringValue;
}

function toThresholdDisplayValue(value: unknown): string {
  return toDisplayValue(value, '0');
}

function parseThreshold(threshold: unknown):
  | { status: 'valid'; mode: 'symmetric' | 'positive' | 'negative'; numericValue: number; displayValue: string }
  | { status: 'invalid_threshold'; displayValue: string } {
  const normalizedThreshold = toThresholdDisplayValue(threshold);

  if (/^\d+(?:\.\d+)?$/.test(normalizedThreshold)) {
    return {
      status: 'valid',
      mode: 'symmetric',
      numericValue: Number(normalizedThreshold),
      displayValue: normalizedThreshold,
    };
  }

  if (/^\+\d+(?:\.\d+)?$/.test(normalizedThreshold)) {
    return {
      status: 'valid',
      mode: 'positive',
      numericValue: Number(normalizedThreshold.slice(1)),
      displayValue: normalizedThreshold,
    };
  }

  if (/^-\d+(?:\.\d+)?$/.test(normalizedThreshold)) {
    return {
      status: 'valid',
      mode: 'negative',
      numericValue: Number(normalizedThreshold.slice(1)),
      displayValue: normalizedThreshold,
    };
  }

  return {
    status: 'invalid_threshold',
    displayValue: normalizedThreshold,
  };
}

function classifyProduct(payload: OdooAicPayload): ClassifyResult {
  const parsedThreshold = parseThreshold(payload.x_aic_threshold);
  if (parsedThreshold.status === 'invalid_threshold') {
    return {
      kind: 'flagged',
      flag_type: 'invalid_threshold',
      threshold_value: parsedThreshold.displayValue,
    };
  }

  const numericValue = Number(payload.quantity);
  if (!Number.isFinite(numericValue)) {
    return {
      kind: 'normal',
      threshold_value: toThresholdDisplayValue(payload.x_aic_threshold),
    };
  }

  let isViolation: boolean;

  if (parsedThreshold.mode === 'positive') {
    isViolation = numericValue < 0 || numericValue > parsedThreshold.numericValue;
  } else if (parsedThreshold.mode === 'negative') {
    isViolation = numericValue < -parsedThreshold.numericValue || numericValue > 0;
  } else {
    isViolation = Math.abs(numericValue) > parsedThreshold.numericValue;
  }

  return isViolation
    ? { kind: 'flagged', flag_type: 'threshold_violation', threshold_value: parsedThreshold.displayValue }
    : { kind: 'normal', threshold_value: parsedThreshold.displayValue };
}

function isInventoryAdjustmentLocation(locationName: unknown): boolean {
  return toDisplayValue(locationName, '').toLowerCase() === INVENTORY_ADJUSTMENT_LOCATION;
}

function resolveDiscrepancyDirection(payload: OdooAicPayload): 'negative' | 'positive' | 'neutral' {
  if (isInventoryAdjustmentLocation(payload.x_destination_name)) return 'negative';
  if (isInventoryAdjustmentLocation(payload.x_source_name)) return 'positive';

  const numericQuantity = Number(payload.quantity);
  if (Number.isFinite(numericQuantity)) {
    if (numericQuantity < 0) return 'negative';
    if (numericQuantity > 0) return 'positive';
  }

  return 'neutral';
}

function buildDedupKey(product: ProductLine): string {
  return [
    product.create_date,
    product.odoo_product_tmpl_id,
    product.quantity,
    product.discrepancy_direction,
    product.flag_type,
    product.threshold_value,
  ].join('|');
}

function dedupeProducts(products: ProductLine[]): ProductLine[] {
  const uniqueProducts = new Map<string, ProductLine>();

  for (const product of products) {
    const dedupKey = buildDedupKey(product);
    if (uniqueProducts.has(dedupKey)) continue;
    uniqueProducts.set(dedupKey, product);
  }

  return Array.from(uniqueProducts.values());
}

export function handleAicWebhookPayload(payload: OdooAicPayload): void {
  if (typeof payload.reference !== 'string') {
    logger.warn({ reference: payload.reference }, 'AIC webhook: invalid reference');
    return;
  }

  if (payload.reference.startsWith('UB/')) return;

  const classification = classifyProduct(payload);
  if (classification.kind === 'normal') return;

  const batchKey = `${payload.company_id}:${payload.reference}`;

  const existing = batchMap.get(batchKey) ?? { odoo_company_id: payload.company_id, products: [] };
  existing.products.push({
    odoo_product_tmpl_id: payload.x_product_tmpl_id,
    product_name: payload.x_product_name,
    quantity: Number(payload.quantity),
    uom_name: payload.x_uom_name,
    flag_type: classification.flag_type,
    discrepancy_direction: resolveDiscrepancyDirection(payload),
    threshold_value: classification.threshold_value,
    aic_date: new Date(payload.create_date),
    create_date: payload.create_date,
  });
  batchMap.set(batchKey, existing);

  const existingTimer = timerMap.get(batchKey);
  if (existingTimer) clearTimeout(existingTimer);

  timerMap.set(
    batchKey,
    setTimeout(() => {
      void processBatch(payload.reference, batchKey);
    }, DEBOUNCE_MS),
  );
}

async function processBatch(reference: string, batchKey: string): Promise<void> {
  const batch = batchMap.get(batchKey);
  batchMap.delete(batchKey);
  timerMap.delete(batchKey);

  if (!batch || batch.products.length === 0) return;
  const products = dedupeProducts(batch.products);
  if (products.length === 0) return;

  try {
    const branchRow = await db
      .getDb()('branches')
      .where({ odoo_branch_id: String(batch.odoo_company_id) })
      .first('id', 'company_id');

    if (!branchRow) {
      logger.warn({ odoo_company_id: batch.odoo_company_id }, 'AIC webhook: no branch found');
      return;
    }

    const company = await db
      .getDb()('companies')
      .where({ id: branchRow.company_id, is_active: true })
      .first('id');

    if (!company) {
      logger.warn({ company_id: branchRow.company_id }, 'AIC webhook: company not active');
      return;
    }

    const companyId = String(company.id);
    const branchId = String(branchRow.id);
    const aic_date = products[0]!.aic_date;

    const record = await db.getDb().transaction(async (trx: Knex.Transaction) => {
      const aicNumber = await getNextAicNumber(trx, companyId);

      const [created] = await trx('aic_records')
        .insert({
          company_id: companyId,
          aic_number: aicNumber,
          reference,
          branch_id: branchId,
          aic_date: aic_date.toISOString().split('T')[0],
          status: 'open',
        })
        .returning('*');

      await trx('aic_products').insert(
        products.map((p) => ({
          aic_record_id: created.id,
          odoo_product_tmpl_id: p.odoo_product_tmpl_id,
          product_name: p.product_name,
          quantity: p.quantity,
          uom_name: p.uom_name,
          flag_type: p.flag_type,
          discrepancy_direction: p.discrepancy_direction,
        })),
      );

      return created;
    });

    const manageUsers = await resolveCompanyUsersWithPermission(companyId, PERMISSIONS.AIC_VARIANCE_MANAGE);

    if (manageUsers.length > 0) {
      await db.getDb().transaction(async (trx: Knex.Transaction) => {
        await trx('aic_participants').insert(
          manageUsers.map((u: { id: string }) => ({
            aic_record_id: record.id,
            user_id: u.id,
            is_joined: true,
            last_read_at: null,
          })),
        );
      });

      const branchNameRow = await db.getDb()('branches').where({ id: branchId }).first('name');
      const branchName = branchNameRow?.name ?? 'Unknown Branch';

      await Promise.all(
        manageUsers.map((u: { id: string }) =>
          createAndDispatchNotification({
            userId: u.id,
            companyId,
            title: 'AIC Variance Detected',
            message: `${reference} — ${products.length} product${products.length !== 1 ? 's' : ''} flagged at ${branchName}`,
            type: 'warning',
            linkUrl: `/aic-variance?aicId=${record.id}`,
          }),
        ),
      );
    }

    emitAicEvent('aic-variance:created', companyId, {
      id: record.id,
      aicNumber: record.aic_number,
      reference,
    });

    logger.info({ reference, companyId, aicId: record.id }, 'AIC record created');
  } catch (err) {
    logger.error({ err, reference }, 'AIC webhook: failed to process batch');
  }
}

async function getNextAicNumber(trx: Knex.Transaction, companyId: string): Promise<number> {
  await trx('company_sequences')
    .insert({ company_id: companyId, sequence_name: 'aic_number', current_value: 0 })
    .onConflict(['company_id', 'sequence_name'])
    .ignore();

  const row = (await trx('company_sequences')
    .where({ company_id: companyId, sequence_name: 'aic_number' })
    .forUpdate()
    .first('id', 'current_value')) as { id: string; current_value: number } | undefined;

  if (!row) throw new Error('Failed to allocate aic_number sequence');

  const next = Number(row.current_value) + 1;
  await trx('company_sequences').where({ id: row.id }).update({ current_value: next, updated_at: new Date() });
  return next;
}

export function emitAicEvent(event: string, companyId: string, payload: unknown): void {
  try {
    (getIO().of('/aic-variance').to(`company:${companyId}`) as any).emit(event, payload);
  } catch {
    logger.warn({ companyId, event }, 'Socket.IO not available for AIC variance event');
  }
}

import type {
  CssCriteriaScores,
  StoreAudit,
  StoreAuditAttachment,
  StoreAuditMessage,
  StoreAuditStatus,
  StoreAuditType,
} from '@omnilert/shared';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { emitStoreAuditEvent } from './storeAuditRealtime.service.js';
import { hydrateUsersByIds } from './globalUser.service.js';
import { createAuditSalaryAttachment, getEmployeeWebsiteKeyByEmployeeId } from './odoo.service.js';
import { buildTenantStoragePrefix, deleteFile, uploadFile } from './storage.service.js';
import { notifyCompletedStoreAudit } from './storeAuditWebhook.service.js';
import {
  buildCompletedStoreAuditTimestamps,
  buildProcessStoreAuditClaimUpdate,
} from './storeAuditTiming.service.js';

type StoreAuditRow = StoreAudit & {
  branch_name?: string | null;
  auditor_name?: string | null;
};

type StoreAuditMessageRow = {
  id: string;
  store_audit_id: string;
  user_id: string;
  content: string;
  is_deleted: boolean;
  deleted_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type StoreAuditAttachmentRow = {
  id: string;
  store_audit_id: string;
  message_id: string | null;
  uploaded_by: string;
  file_url: string;
  file_name: string;
  file_size: number;
  content_type: string;
  created_at: Date | string;
};

type AuditReportSections = {
  criteria_summary: string[];
  audit_trail_findings: string[];
  strengths: string[];
  risks: string[];
  coaching_recommendations: string[];
};

const EMPTY_AUDIT_REPORT_SECTIONS: AuditReportSections = {
  criteria_summary: ['Insufficient evidence from provided criteria.'],
  audit_trail_findings: ['Insufficient evidence from provided audit trail.'],
  strengths: ['No clear strengths evidenced in the provided data.'],
  risks: ['No material risks evidenced in the provided data.'],
  coaching_recommendations: ['No coaching recommendation can be made without stronger evidence.'],
};

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function formatDescriptionTimestamp(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 || 12;
  const minute = String(date.getMinutes()).padStart(2, '0');
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  return `${month}/${day}/${year} ${hours12}:${minute} ${meridiem}`;
}

function normalizeRow(row: any): StoreAuditRow {
  return {
    ...row,
    css_order_lines: parseJsonField(row.css_order_lines, null),
    css_payments: parseJsonField(row.css_payments, null),
    css_criteria_scores: parseJsonField(row.css_criteria_scores, null),
    comp_extra_fields: parseJsonField(row.comp_extra_fields, null),
  };
}

async function enrichAuditRows(rows: any[]): Promise<StoreAuditRow[]> {
  if (rows.length === 0) return [];

  const branchIds = [...new Set(rows.map((row) => row.branch_id).filter(Boolean))] as string[];
  const auditorIds = [
    ...new Set(rows.map((row) => row.auditor_user_id).filter(Boolean)),
  ] as string[];
  const auditIds = rows.map((row) => row.id) as string[];

  const [branches, auditors, linkedVns] = await Promise.all([
    branchIds.length > 0
      ? db.getDb()('branches').whereIn('id', branchIds).select('id', 'name')
      : Promise.resolve([]),
    auditorIds.length > 0
      ? db.getDb()('users').whereIn('id', auditorIds).select('id', 'first_name', 'last_name')
      : Promise.resolve([]),
    db.getDb()('violation_notices')
      .whereIn('source_store_audit_id', auditIds)
      .whereNotNull('source_store_audit_id')
      .select('id', 'source_store_audit_id'),
  ]);

  const branchMap = new Map(
    branches.map((branch: any) => [branch.id as string, branch.name as string]),
  );
  const auditorMap = new Map(
    auditors.map((auditor: any) => [
      auditor.id as string,
      `${auditor.first_name} ${auditor.last_name}`.trim(),
    ]),
  );
  const vnMap = new Map(
    linkedVns.map((vn: any) => [vn.source_store_audit_id as string, vn.id as string]),
  );

  return rows.map((row) => {
    const normalized = normalizeRow(row);
    return {
      ...normalized,
      branch_name: normalized.branch_name ?? branchMap.get(normalized.branch_id) ?? null,
      auditor_name:
        normalized.auditor_name ??
        (normalized.auditor_user_id ? (auditorMap.get(normalized.auditor_user_id) ?? null) : null),
      linked_vn_id: vnMap.get(normalized.id) ?? null,
    };
  });
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === '23505';
}

async function analyzeCssAudit(
  auditLog: string,
  criteriaScores: CssCriteriaScores,
): Promise<string> {
  const criteriaLabels: Record<keyof CssCriteriaScores, string> = {
    greeting: 'Greeting & First Impression',
    order_accuracy: 'Order Accuracy & Confirmation',
    suggestive_selling: 'Suggestive Selling / Revenue Initiative',
    service_efficiency: 'Service Efficiency & Flow',
    professionalism: 'Professionalism & Closing Experience',
  };

  const scoresPreamble = (Object.keys(criteriaLabels) as Array<keyof CssCriteriaScores>)
    .map((key) => `- ${criteriaLabels[key]}: ${criteriaScores[key]}/5`)
    .join('\n');

  const userContent = `Criteria Scores:\n${scoresPreamble}\n\nAudit Log:\n${auditLog}`;
  return analyzeAuditWithAI({
    systemPrompt:
      'You summarize cashier performance audits. Return concise actionable findings, strengths, risks, and coaching recommendations.',
    userContent,
  });
}

async function analyzeComplianceAudit(
  auditLog: string,
  answers: {
    productivity_rate: boolean;
    uniform: boolean;
    hygiene: boolean;
    sop: boolean;
  },
): Promise<string> {
  const labels: Array<{ key: keyof typeof answers; label: string }> = [
    { key: 'productivity_rate', label: 'Productivity Rate' },
    { key: 'uniform', label: 'Uniform Compliance' },
    { key: 'hygiene', label: 'Hygiene Compliance' },
    { key: 'sop', label: 'SOP Compliance' },
  ];

  const answersPreamble = labels
    .map(({ key, label }) => `- ${label}: ${answers[key] ? 'Yes' : 'No'}`)
    .join('\n');

  const userContent = `Compliance Answers:\n${answersPreamble}\n\nAudit Log:\n${auditLog}`;
  return analyzeAuditWithAI({
    systemPrompt:
      'You summarize compliance audits for retail/food-service operations. Return concise actionable findings, strengths, risks, and coaching recommendations.',
    userContent,
  });
}

async function analyzeAuditWithAI(input: {
  systemPrompt: string;
  userContent: string;
}): Promise<string> {
  const systemPrompt = [
    input.systemPrompt,
    '',
    'You are a neutral, data-driven audit analyst for a retail/food-service operation.',
    'Audit notes may be written in English, Filipino, Tagalog, Taglish, shorthand, or contain typos.',
    'Interpret these conservatively and faithfully — do not assume intent beyond what is stated.',
    'If audit notes contradict the provided scores, surface the discrepancy explicitly.',
    'If evidence is weak, ambiguous, or missing, state "Insufficient evidence" rather than speculating.',
    '',
    'Return STRICT JSON only with these exact keys:',
    '- criteria_summary (array of strings)',
    '- audit_trail_findings (array of strings)',
    '- strengths (array of strings)',
    '- risks (array of strings)',
    '- coaching_recommendations (array of strings)',
    '',
    'Rules:',
    '- Every item must be directly supported by the provided data.',
    '- Tone must be unbiased, factual, and professional.',
    '- No markdown, no extra keys, no preamble or wrapper text.',
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'OpenAI-Organization': env.OPENAI_ORGANIZATION_ID,
      'OpenAI-Project': env.OPENAI_PROJECT_ID,
    },
    body: JSON.stringify({
      model: 'gpt-4.1',
      max_output_tokens: 1500,
      input: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: input.userContent,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new AppError(502, `AI report generation failed: ${text}`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  const rawText = extractAIOutputText(payload);
  const parsed = parseAuditReportSections(rawText);
  return formatAuditReportSections(parsed);
}

function extractAIOutputText(payload: {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const textFromOutput = payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text' || item.type === 'text')
    .map((item) => String(item.text ?? '').trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  if (textFromOutput) return textFromOutput;
  throw new AppError(502, 'AI report generation returned an empty response');
}

function parseAuditReportSections(rawText: string): AuditReportSections {
  const parsed = parseJsonObject(rawText);
  if (!parsed || typeof parsed !== 'object') {
    return {
      ...EMPTY_AUDIT_REPORT_SECTIONS,
      audit_trail_findings: [rawText.trim() || EMPTY_AUDIT_REPORT_SECTIONS.audit_trail_findings[0]],
    };
  }

  const obj = parsed as Record<string, unknown>;
  return {
    criteria_summary: sanitizeStringArray(
      obj.criteria_summary,
      EMPTY_AUDIT_REPORT_SECTIONS.criteria_summary[0],
    ),
    audit_trail_findings: sanitizeStringArray(
      obj.audit_trail_findings,
      EMPTY_AUDIT_REPORT_SECTIONS.audit_trail_findings[0],
    ),
    strengths: sanitizeStringArray(obj.strengths, EMPTY_AUDIT_REPORT_SECTIONS.strengths[0]),
    risks: sanitizeStringArray(obj.risks, EMPTY_AUDIT_REPORT_SECTIONS.risks[0]),
    coaching_recommendations: sanitizeStringArray(
      obj.coaching_recommendations,
      EMPTY_AUDIT_REPORT_SECTIONS.coaching_recommendations[0],
    ),
  };
}

function parseJsonObject(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch {
    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const candidate = rawText.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

function sanitizeStringArray(value: unknown, fallback: string): string[] {
  if (!Array.isArray(value)) return [fallback];
  const cleaned = value.map((item) => String(item ?? '').trim()).filter(Boolean);
  if (cleaned.length === 0) return [fallback];
  return cleaned;
}

function formatAuditReportSections(sections: AuditReportSections): string {
  const toLines = (title: string, items: string[]) =>
    [`**${title}**`, ...items.map((item) => `- ${item}`), ''].join('\n');

  return [
    toLines('Criteria Summary', sections.criteria_summary),
    toLines('Audit Trail Findings', sections.audit_trail_findings),
    toLines('Strengths', sections.strengths),
    toLines('Risks', sections.risks),
    toLines('Coaching Recommendations', sections.coaching_recommendations),
  ]
    .join('\n')
    .trim();
}

async function appendCssAuditResult(
  userKey: string,
  payload: {
    audit_id: string;
    star_rating: number;
    criteria_scores: CssCriteriaScores;
    audited_at: string;
  },
): Promise<void> {
  const masterDb = db.getDb();
  const targetUser = await masterDb('users').where({ user_key: userKey }).first('id');
  if (!targetUser) return;

  await masterDb('users')
    .where({ id: targetUser.id })
    .update({
      css_audits: masterDb.raw(`COALESCE(css_audits, '[]'::jsonb) || ?::jsonb`, [
        JSON.stringify([payload]),
      ]),
      updated_at: new Date(),
    });
}

async function updateComplianceAuditResult(
  odooEmployeeId: number,
  payload: {
    audit_id: string;
    answers: {
      productivity_rate: boolean;
      uniform: boolean;
      hygiene: boolean;
      sop: boolean;
    };
    audited_at: string;
  },
): Promise<void> {
  const websiteKey = await getEmployeeWebsiteKeyByEmployeeId(odooEmployeeId);
  if (!websiteKey) return;

  const masterDb = db.getDb();
  const targetUser = await masterDb('users').where({ user_key: websiteKey }).first('id');
  if (!targetUser) return;

  await masterDb('users')
    .where({ id: targetUser.id })
    .update({
      compliance_audit: masterDb.raw(`COALESCE(compliance_audit, '[]'::jsonb) || ?::jsonb`, [
        JSON.stringify([payload]),
      ]),
      updated_at: new Date(),
    });
}

async function getWebsiteKeyByUserId(userId: string): Promise<string | null> {
  const row = await db.getDb()('users').where({ id: userId }).first('user_key');

  const key = String(row?.user_key ?? '').trim();
  return key || null;
}

function isAllowedStoreAuditMessageAttachment(contentType: string): boolean {
  return contentType.startsWith('image/') || contentType.startsWith('video/');
}

async function getStoreAuditOrThrow(auditId: string): Promise<any> {
  const audit = await db.getDb()('store_audits').where({ id: auditId }).first();
  if (!audit) throw new AppError(404, 'Store audit not found');
  return audit;
}

function assertStoreAuditMessagesSupported(audit: any): void {
  if (audit.type !== 'customer_service' && audit.type !== 'compliance') {
    throw new AppError(409, 'Audit messages are not supported for this store audit type');
  }
}

async function getMutableStoreAuditForMessages(input: {
  auditId: string;
  userId: string;
}): Promise<any> {
  const audit = await getStoreAuditOrThrow(input.auditId);
  assertStoreAuditMessagesSupported(audit);
  if (audit.status !== 'processing') {
    throw new AppError(409, 'Store audit must be in processing status');
  }
  if (audit.auditor_user_id !== input.userId) {
    throw new AppError(403, 'Only the assigned auditor can update this audit trail');
  }
  return audit;
}

async function buildStoreAuditMessageList(
  auditId: string,
): Promise<StoreAuditMessage[]> {
  const messageRows = (await db.getDb()('store_audit_messages')
    .where({ store_audit_id: auditId })
    .orderBy('created_at', 'asc')
    .select('*')) as StoreAuditMessageRow[];

  if (messageRows.length === 0) return [];

  const messageIds = messageRows.map((row) => row.id);
  const [attachmentRows, userMap] = await Promise.all([
    db.getDb()('store_audit_attachments')
      .whereIn('message_id', messageIds)
      .orderBy('created_at', 'asc')
      .select('*') as Promise<StoreAuditAttachmentRow[]>,
    hydrateUsersByIds(
      messageRows.map((row) => row.user_id),
      ['id', 'first_name', 'last_name', 'avatar_url'],
    ),
  ]);

  const attachmentsByMessage = new Map<string, StoreAuditAttachment[]>();
  for (const row of attachmentRows) {
    if (!row.message_id) continue;
    const list = attachmentsByMessage.get(row.message_id) ?? [];
    list.push({
      id: row.id,
      store_audit_id: row.store_audit_id,
      message_id: row.message_id,
      uploaded_by: row.uploaded_by,
      file_url: row.file_url,
      file_name: row.file_name,
      file_size: row.file_size,
      content_type: row.content_type,
      created_at: new Date(row.created_at).toISOString(),
    });
    attachmentsByMessage.set(row.message_id, list);
  }

  return messageRows.map((row) => {
    const user = userMap[row.user_id];
    return {
      id: row.id,
      store_audit_id: row.store_audit_id,
      user_id: row.user_id,
      user_name: `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim() || 'Unknown User',
      user_avatar: typeof user?.avatar_url === 'string' ? user.avatar_url : undefined,
      content: row.content,
      is_deleted: Boolean(row.is_deleted),
      deleted_by: row.deleted_by,
      attachments: attachmentsByMessage.get(row.id) ?? [],
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
      is_edited:
        !row.is_deleted && new Date(row.updated_at).getTime() > new Date(row.created_at).getTime(),
    };
  });
}

function buildAuditMessageTranscript(messages: StoreAuditMessage[]): string {
  return messages
    .filter((message) => !message.is_deleted)
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export async function listStoreAudits(input: {
  userId: string;
  type?: StoreAuditType | 'all';
  status?: StoreAuditStatus;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, Number(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));

  const query = db.getDb()('store_audits');
  if (input.type && input.type !== 'all') {
    query.where({ type: input.type });
  }
  if (input.status) {
    query.where({ status: input.status });
  }

  const sortOrder = (() => {
    if (input.status === 'completed') {
      return [
        { column: 'completed_at', order: 'desc' as const, nulls: 'last' as const },
        { column: 'created_at', order: 'desc' as const },
      ];
    }

    if (input.status === 'processing') {
      return [
        { column: 'updated_at', order: 'desc' as const },
        { column: 'created_at', order: 'desc' as const },
      ];
    }

    return [{ column: 'created_at', order: 'desc' as const }];
  })();

  const [countRow, rows, processingAudit] = await Promise.all([
    query.clone().count<{ count: string }>({ count: '*' }).first(),
    query
      .clone()
      .orderBy(
        sortOrder as Array<{ column: string; order: 'asc' | 'desc'; nulls?: 'first' | 'last' }>,
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.getDb()('store_audits')
      .where({ status: 'processing', auditor_user_id: input.userId })
      .first('id'),
  ]);

  const items = await enrichAuditRows(rows);

  return {
    items,
    page,
    pageSize,
    total: Number(countRow?.count ?? 0),
    processingAuditId: (processingAudit?.id as string | undefined) ?? null,
  };
}

export async function getStoreAuditById(input: {
  id: string;
}): Promise<StoreAuditRow> {
  const row = await db.getDb()('store_audits').where({ id: input.id }).first();
  if (!row) throw new AppError(404, 'Store audit not found');
  const [enriched] = await enrichAuditRows([row]);
  return enriched;
}

export async function listStoreAuditMessages(input: {
  auditId: string;
}): Promise<StoreAuditMessage[]> {
  const audit = await getStoreAuditOrThrow(input.auditId);
  assertStoreAuditMessagesSupported(audit);
  return buildStoreAuditMessageList(input.auditId);
}

export async function sendStoreAuditMessage(input: {
  companyId: string;
  companyStorageRoot: string;
  auditId: string;
  userId: string;
  content: string;
  files: Array<{ buffer: Buffer; originalname: string; mimetype: string; size: number }>;
}): Promise<StoreAuditMessage> {
  await getMutableStoreAuditForMessages({
    auditId: input.auditId,
    userId: input.userId,
  });

  const trimmedContent = input.content.trim();
  if (!trimmedContent && input.files.length === 0) {
    throw new AppError(400, 'Message must have content or at least one attachment');
  }
  if (input.files.length > 10) {
    throw new AppError(400, 'Maximum of 10 attachments is allowed per message');
  }
  if (input.files.some((file) => file.size > 50 * 1024 * 1024)) {
    throw new AppError(400, 'Attachment exceeds 50MB limit');
  }
  if (input.files.some((file) => !isAllowedStoreAuditMessageAttachment(file.mimetype))) {
    throw new AppError(400, 'Only image and video attachments are allowed');
  }

  let messageId = '';
  await db.getDb().transaction(async (trx) => {
    const [created] = await trx('store_audit_messages')
      .insert({
        store_audit_id: input.auditId,
        user_id: input.userId,
        content: trimmedContent,
      })
      .returning('*');
    messageId = String(created.id);

    if (input.files.length > 0) {
      const folder = buildTenantStoragePrefix(
        input.companyStorageRoot,
        'Store Audits',
        `AUDIT-${input.auditId}`,
      );

      for (const file of input.files) {
        const fileUrl = await uploadFile(file.buffer, file.originalname, file.mimetype, folder);
        if (!fileUrl) throw new AppError(500, 'Failed to upload audit media attachment');

        await trx('store_audit_attachments').insert({
          store_audit_id: input.auditId,
          message_id: messageId,
          uploaded_by: input.userId,
          file_url: fileUrl,
          file_name: file.originalname,
          file_size: file.size,
          content_type: file.mimetype,
        });
      }
    }
  });

  const messages = await buildStoreAuditMessageList(input.auditId);
  const found = messages.find((message) => message.id === messageId);
  if (!found) throw new AppError(500, 'Failed to load saved audit message');

  emitStoreAuditEvent(input.companyId, 'store-audit:updated', { id: input.auditId });
  return found;
}

export async function editStoreAuditMessage(input: {
  companyId: string;
  auditId: string;
  messageId: string;
  userId: string;
  content: string;
}): Promise<StoreAuditMessage> {
  await getMutableStoreAuditForMessages({
    auditId: input.auditId,
    userId: input.userId,
  });

  const nextContent = input.content.trim();
  if (!nextContent) throw new AppError(400, 'Message content is required');

  const message = (await db.getDb()('store_audit_messages')
    .where({ id: input.messageId, store_audit_id: input.auditId })
    .first()) as StoreAuditMessageRow | undefined;
  if (!message) throw new AppError(404, 'Audit message not found');
  if (message.user_id !== input.userId) {
    throw new AppError(403, 'You can only edit your own audit messages');
  }
  if (message.is_deleted) {
    throw new AppError(409, 'Deleted messages cannot be edited');
  }

  await db.getDb()('store_audit_messages').where({ id: input.messageId }).update({
    content: nextContent,
    updated_at: new Date(),
  });

  const messages = await buildStoreAuditMessageList(input.auditId);
  const updated = messages.find((item) => item.id === input.messageId);
  if (!updated) throw new AppError(500, 'Failed to load updated audit message');

  emitStoreAuditEvent(input.companyId, 'store-audit:updated', { id: input.auditId });
  return updated;
}

export async function deleteStoreAuditMessage(input: {
  companyId: string;
  auditId: string;
  messageId: string;
  userId: string;
}): Promise<void> {
  await getMutableStoreAuditForMessages({
    auditId: input.auditId,
    userId: input.userId,
  });

  const message = (await db.getDb()('store_audit_messages')
    .where({ id: input.messageId, store_audit_id: input.auditId })
    .first()) as StoreAuditMessageRow | undefined;
  if (!message) throw new AppError(404, 'Audit message not found');
  if (message.user_id !== input.userId) {
    throw new AppError(403, 'You can only delete your own audit messages');
  }
  if (message.is_deleted) {
    throw new AppError(409, 'Message is already deleted');
  }

  const attachments = (await db.getDb()('store_audit_attachments')
    .where({ message_id: input.messageId })
    .select('file_url')) as Array<{ file_url: string }>;

  const users = await hydrateUsersByIds([input.userId], ['id', 'first_name', 'last_name']);
  const deleter = users[input.userId];
  const deleterName =
    `${deleter?.first_name ?? ''} ${deleter?.last_name ?? ''}`.trim() || 'Someone';

  await db.getDb().transaction(async (trx) => {
    await trx('store_audit_messages')
      .where({ id: input.messageId })
      .update({
        content: `${deleterName} deleted this message`,
        is_deleted: true,
        deleted_by: input.userId,
        updated_at: new Date(),
      });

    await trx('store_audit_attachments').where({ message_id: input.messageId }).delete();
  });

  await Promise.all(
    attachments.map((attachment) => deleteFile(attachment.file_url).catch(() => undefined)),
  );
  emitStoreAuditEvent(input.companyId, 'store-audit:updated', { id: input.auditId });
}

export async function processStoreAudit(input: {
  auditId: string;
  userId: string;
  companyId: string;
}): Promise<StoreAuditRow> {
  const existing = await db.getDb()('store_audits').where({ id: input.auditId }).first();
  if (!existing || existing.status !== 'pending') {
    throw new AppError(404, 'Store audit not found');
  }

  const activeAudit = await db.getDb()('store_audits')
    .where({ status: 'processing', auditor_user_id: input.userId })
    .first('id');
  if (activeAudit) {
    throw new AppError(409, 'You already have an active audit in progress');
  }

  let updated: any;
  try {
    const claimUpdate = buildProcessStoreAuditClaimUpdate({
      userId: input.userId,
    });
    [updated] = await db.getDb()('store_audits')
      .where({ id: input.auditId, status: 'pending' })
      .update(claimUpdate)
      .returning('*');
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'You already have an active audit in progress');
    }
    throw error;
  }

  if (!updated) {
    throw new AppError(409, 'Audit was already claimed');
  }

  const [enriched] = await enrichAuditRows([updated]);
  emitStoreAuditEvent(input.companyId, 'store-audit:claimed', {
    id: enriched.id,
    auditor_user_id: input.userId,
    auditor_name: enriched.auditor_name ?? null,
  });
  return enriched;
}

export async function completeStoreAudit(input: {
  auditId: string;
  userId: string;
  companyId: string;
  payload:
    | {
        criteria_scores: CssCriteriaScores;
      }
    | {
        productivity_rate: boolean;
        uniform: boolean;
        hygiene: boolean;
        sop: boolean;
      };
}): Promise<StoreAuditRow> {
  const audit = await db.getDb()('store_audits').where({ id: input.auditId }).first();
  if (!audit) throw new AppError(404, 'Store audit not found');
  if (audit.status !== 'processing' || audit.auditor_user_id !== input.userId) {
    throw new AppError(403, 'You can only complete your own processing audit');
  }

  const createSalaryAttachmentForAuditor = async (
    description: string,
    totalAmount: number,
  ): Promise<void> => {
    if (totalAmount <= 0) return;

    const auditorWebsiteKey = await getWebsiteKeyByUserId(input.userId);
    if (!auditorWebsiteKey) {
      logger.warn(
        { auditId: input.auditId, userId: input.userId },
        'completeStoreAudit: auditor has no website key, skipping salary attachment',
      );
      return;
    }

    void createAuditSalaryAttachment({
      websiteUserKey: auditorWebsiteKey,
      description,
      totalAmount,
    });
  };

  const completedAt = new Date();
  const completedTimestamps = buildCompletedStoreAuditTimestamps(completedAt);
  let updated: any;

  if (audit.type === 'customer_service') {
    const cssPayload = input.payload as { criteria_scores: CssCriteriaScores };
    const { criteria_scores } = cssPayload;
    const messages = await buildStoreAuditMessageList(input.auditId);
    const visibleMessages = messages.filter((message) => !message.is_deleted);
    if (visibleMessages.length === 0) {
      throw new AppError(
        400,
        'At least one audit message is required before completing this CSS audit',
      );
    }
    const generatedAuditLog = buildAuditMessageTranscript(visibleMessages);
    const starRating =
      Math.round(
        ((criteria_scores.greeting +
          criteria_scores.order_accuracy +
          criteria_scores.suggestive_selling +
          criteria_scores.service_efficiency +
          criteria_scores.professionalism) /
          5) *
          100,
      ) / 100;
    const aiReport = await analyzeCssAudit(generatedAuditLog, criteria_scores);
    [updated] = await db.getDb()('store_audits')
      .where({ id: input.auditId })
      .update({
        status: 'completed',
        css_criteria_scores: JSON.stringify(criteria_scores),
        css_star_rating: starRating,
        css_audit_log: generatedAuditLog,
        css_ai_report: aiReport,
        ...completedTimestamps,
      })
      .returning('*');

    if (audit.css_cashier_user_key) {
      await appendCssAuditResult(String(audit.css_cashier_user_key), {
        audit_id: input.auditId,
        star_rating: starRating,
        criteria_scores,
        audited_at: completedAt.toISOString(),
      });

      const monetaryReward = Number(audit.monetary_reward ?? 0);
      if (monetaryReward > 0) {
        const description = `CSS Audit ${input.auditId} - ${formatDescriptionTimestamp(completedAt)}`;
        await createSalaryAttachmentForAuditor(description, monetaryReward);
      }
    }
  } else {
    const compPayload = input.payload as {
      productivity_rate: boolean;
      uniform: boolean;
      hygiene: boolean;
      sop: boolean;
    };
    const messages = await buildStoreAuditMessageList(input.auditId);
    const visibleMessages = messages.filter((message) => !message.is_deleted);
    if (visibleMessages.length === 0) {
      throw new AppError(
        400,
        'At least one audit message is required before completing this compliance audit',
      );
    }
    const generatedAuditLog = buildAuditMessageTranscript(visibleMessages);
    const aiReport = await analyzeComplianceAudit(generatedAuditLog, compPayload);
    [updated] = await db.getDb()('store_audits')
      .where({ id: input.auditId })
      .update({
        status: 'completed',
        comp_productivity_rate: compPayload.productivity_rate,
        comp_uniform: compPayload.uniform,
        comp_hygiene: compPayload.hygiene,
        comp_sop: compPayload.sop,
        comp_ai_report: aiReport,
        ...completedTimestamps,
      })
      .returning('*');

    if (audit.comp_odoo_employee_id) {
      await updateComplianceAuditResult(Number(audit.comp_odoo_employee_id), {
        audit_id: input.auditId,
        answers: {
          productivity_rate: compPayload.productivity_rate,
          uniform: compPayload.uniform,
          hygiene: compPayload.hygiene,
          sop: compPayload.sop,
        },
        audited_at: completedAt.toISOString(),
      });

      const monetaryReward = Number(audit.monetary_reward ?? 0);
      if (monetaryReward > 0) {
        const description = `Compliance Audit ${input.auditId} - ${formatDescriptionTimestamp(completedAt)}`;
        await createSalaryAttachmentForAuditor(description, monetaryReward);
      }
    }
  }

  const [enriched] = await enrichAuditRows([updated]);
  await notifyCompletedStoreAudit({
    companyId: input.companyId,
    audit: enriched,
  });
  emitStoreAuditEvent(input.companyId, 'store-audit:completed', { id: input.auditId });
  return enriched;
}

import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const MAIL_WEBHOOK_URL = 'https://n8n.omnilert.app/webhook/omnilert_mail';
const FORGOT_PASSWORD_WEBHOOK_URL = 'https://n8n.omnilert.app/webhook-test/forgot-password';
const MAIL_WEBHOOK_TIMEOUT_MS = 15000;

/**
 * Dispatches a secure, authenticated webhook to n8n for email processing.
 */
async function sendMailWebhook(input: {
  type: string;
  to: string;
  subject: string;
  data: Record<string, unknown>;
}): Promise<void> {
  const token = jwt.sign({ iss: 'omnilert-api' }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
  });

  try {
    const response = await fetch(MAIL_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: input.type,
        to: input.to,
        subject: input.subject,
        data: input.data,
      }),
      signal: AbortSignal.timeout(MAIL_WEBHOOK_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mail webhook failed with status ${response.status}: ${errorText.slice(0, 500)}`);
    }
  } catch (error) {
    logger.error({ 
      err: error, 
      type: input.type, 
      recipient: input.to 
    }, 'Failed to dispatch email webhook');
    throw error;
  }
}

// ─── Registration & Onboarding ───────────────────────────────────────────────

export async function sendRegistrationApprovedEmail(input: {
  to: string;
  fullName: string;
  email: string;
  password: string;
  companySlug?: string;
}): Promise<void> {
  const discordLink = env.DISCORD_INVITE_URL;
  const employmentAccessLink = buildEmploymentAccessLink(input.companySlug);
  
  await sendMailWebhook({
    type: 'registration_approved',
    to: input.to,
    subject: 'Omnilert Registration Approved',
    data: {
      fullName: input.fullName,
      email: input.email,
      password: input.password,
      discordLink,
      employmentAccessLink,
    },
  });
}

export async function sendForgotPasswordEmail(input: {
  to: string;
  fullName: string;
  email: string;
  resetLink: string;
  expiresInMinutes: number;
}): Promise<void> {
  const token = jwt.sign({ iss: 'omnilert-api' }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
  });
;
  const response = await fetch(FORGOT_PASSWORD_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      type: 'forgot_password',
      to: input.to,
      subject: 'Reset your Omnilert password',
      data: {
        fullName: input.fullName,
        email: input.email,
        resetLink: input.resetLink,
        expiresInMinutes: input.expiresInMinutes,
      },
    }),
    signal: AbortSignal.timeout(MAIL_WEBHOOK_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Forgot password webhook failed with status ${response.status}: ${errorText.slice(0, 500)}`);
  }
}

// ─── Weekly EPI Reports (Employees) ──────────────────────────────────────────

export async function sendWeeklyEpiEmail(
  to: string,
  employeeName: string,
  epiBefore: number,
  epiAfter: number,
  delta: number,
  reportDate: string,
  pdfBuffer: Buffer,
): Promise<void> {
  await sendMailWebhook({
    type: 'weekly_epi_report',
    to,
    subject: `Your Weekly EPI Performance Report - ${reportDate}`,
    data: {
      employeeName,
      epiBefore,
      epiAfter,
      delta,
      reportDate,
      attachment: {
        content: pdfBuffer.toString('base64'),
        filename: `EPI_Report_${employeeName.replace(/\s+/g, '_')}_${reportDate}.pdf`,
        contentType: 'application/pdf',
      },
    },
  });
}

// ─── Manager EPI Summary Reports ─────────────────────────────────────────────

export async function sendManagerEpiSummaryEmail(
  to: string,
  managerName: string,
  companyName: string,
  totalEmployees: number,
  avgDelta: number,
  reportDate: string,
  pdfBuffer: Buffer,
): Promise<void> {
  await sendMailWebhook({
    type: 'epi_manager_summary',
    to,
    subject: `EPI Weekly Summary: ${companyName} - ${reportDate}`,
    data: {
      managerName,
      companyName,
      totalEmployees,
      avgDelta,
      reportDate,
      attachment: {
        content: pdfBuffer.toString('base64'),
        filename: `Manager_EPI_Summary_${companyName.replace(/\s+/g, '_')}_${reportDate}.pdf`,
        contentType: 'application/pdf',
      },
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildEmploymentAccessLink(companySlug?: string): string {
  const base = env.CLIENT_URL?.trim() || 'http://localhost:5173';
  let loginUrl: URL;
  try {
    loginUrl = new URL('/login', base);
  } catch {
    loginUrl = new URL('/login', 'http://localhost:5173');
  }

  loginUrl.searchParams.set('redirect', '/account/profile');
  if (companySlug) {
    loginUrl.searchParams.set('companySlug', companySlug);
  }
  return loginUrl.toString();
}

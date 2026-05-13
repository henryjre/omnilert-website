import { Resend } from 'resend';
import type { AuditResultsWebhookPayload } from '@omnilert/shared';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
  renderForgotPasswordEmail,
  renderRegistrationApprovedEmail,
} from './emailTemplates/authTemplates.js';
import { renderAuditResultsEmail } from './emailTemplates/auditTemplates.js';
import {
  renderManagerEpiSummaryEmail,
  renderWeeklyEpiEmail,
} from './emailTemplates/epiTemplates.js';

type ResendAttachment = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
};

type SendResendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: ResendAttachment[];
  tags?: Array<{ name: string; value: string }>;
};

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is required to send email');
  }

  resendClient ??= new Resend(env.RESEND_API_KEY);
  return resendClient;
}

function getResendFromEmail(): string {
  if (!env.RESEND_FROM_EMAIL) {
    throw new Error('RESEND_FROM_EMAIL is required to send email');
  }
  return env.RESEND_FROM_EMAIL;
}

export async function sendResendEmail(input: SendResendEmailInput): Promise<void> {
  try {
    const { error } = await getResendClient().emails.send({
      from: getResendFromEmail(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments,
      tags: input.tags,
    });

    if (error) {
      throw new Error(`Resend email failed: ${error.message}`);
    }
  } catch (error) {
    logger.error(
      {
        err: error,
        recipient: input.to,
        subject: input.subject,
      },
      'Failed to send Resend email',
    );
    throw error;
  }
}

export async function sendRegistrationApprovedEmail(input: {
  to: string;
  fullName: string;
  email: string;
  password: string;
  companySlug?: string;
}): Promise<void> {
  const discordLink = env.DISCORD_INVITE_URL;
  const employmentAccessLink = buildEmploymentAccessLink(input.companySlug);

  await sendResendEmail({
    to: input.to,
    subject: 'Omnilert Registration Approved',
    html: renderRegistrationApprovedEmail({
      fullName: input.fullName,
      email: input.email,
      password: input.password,
      discordLink,
      employmentAccessLink,
    }),
    tags: [{ name: 'email_type', value: 'registration_approved' }],
  });
}

export async function sendForgotPasswordEmail(input: {
  to: string;
  fullName: string;
  email: string;
  resetLink: string;
  expiresInMinutes: number;
}): Promise<void> {
  await sendResendEmail({
    to: input.to,
    subject: 'Reset your Omnilert password',
    html: renderForgotPasswordEmail(input),
    tags: [{ name: 'email_type', value: 'forgot_password' }],
  });
}

export async function sendWeeklyEpiEmail(
  to: string,
  employeeName: string,
  epiBefore: number,
  epiAfter: number,
  delta: number,
  reportDate: string,
  pdfBuffer: Buffer,
): Promise<void> {
  await sendResendEmail({
    to,
    subject: `Your Weekly EPI Performance Report - ${reportDate}`,
    html: renderWeeklyEpiEmail({ employeeName, epiBefore, epiAfter, delta, reportDate }),
    attachments: [
      {
        content: pdfBuffer,
        filename: `EPI_Report_${employeeName.replace(/\s+/g, '_')}_${reportDate}.pdf`,
        contentType: 'application/pdf',
      },
    ],
    tags: [{ name: 'email_type', value: 'weekly_epi_report' }],
  });
}

export async function sendManagerEpiSummaryEmail(
  to: string,
  managerName: string,
  companyName: string,
  totalEmployees: number,
  avgDelta: number,
  reportDate: string,
  pdfBuffer: Buffer,
): Promise<void> {
  await sendResendEmail({
    to,
    subject: `EPI Weekly Summary: ${companyName} - ${reportDate}`,
    html: renderManagerEpiSummaryEmail({ managerName, companyName, totalEmployees, avgDelta, reportDate }),
    attachments: [
      {
        content: pdfBuffer,
        filename: `Manager_EPI_Summary_${companyName.replace(/\s+/g, '_')}_${reportDate}.pdf`,
        contentType: 'application/pdf',
      },
    ],
    tags: [{ name: 'email_type', value: 'epi_manager_summary' }],
  });
}

export async function sendAuditResultsEmail(payload: AuditResultsWebhookPayload): Promise<void> {
  await sendResendEmail({
    to: payload.recipient.email,
    subject: 'Audit Completion Receipt',
    html: renderAuditResultsEmail(payload),
    tags: [{ name: 'email_type', value: 'audit_result' }],
  });
}

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

import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

function hasMailConfig(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM);
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!hasMailConfig()) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST!,
      port: env.SMTP_PORT!,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER!,
        pass: env.SMTP_PASS!,
      },
    });
  }
  return transporter;
}

export async function sendRegistrationApprovedEmail(input: {
  to: string;
  fullName: string;
  email: string;
  password: string;
  companySlug?: string;
}): Promise<void> {
  const transport = getTransporter();
  if (!transport) {
    logger.warn('SMTP config missing, skipping registration approval email');
    return;
  }

  const discordLink = env.DISCORD_INVITE_URL;
  const employmentAccessLink = buildEmploymentAccessLink(input.companySlug);
  const subject = 'Registration Approved';
  const text = [
    `Hi ${input.fullName},`,
    '',
    'Your registration has been approved.',
    '',
    `Email: ${input.email}`,
    `Password: ${input.password}`,
    '',
    'Next steps:',
    '1. Complete your profile: add a formal profile picture, complete your details, and get your PIN code.',
    '2. IMPORTANT: Complete your Employment Requirements in My Account > Profile.',
    `   Open Profile tab: ${employmentAccessLink}`,
    '   (If you are not logged in, you will be shown the login page first and then redirected.)',
    '3. Check your schedule.',
    `4. Join the Omnilert Discord for communications: ${discordLink}`,
    '',
    'Thank you.',
  ].join('\n');
  const html = buildRegistrationApprovedEmailHtml({
    fullName: input.fullName,
    email: input.email,
    password: input.password,
    discordLink,
    employmentAccessLink,
  });

  await transport.sendMail({
    from: env.SMTP_FROM!,
    to: input.to,
    subject,
    text,
    html,
  });
}

function buildRegistrationApprovedEmailHtml(input: {
  fullName: string;
  email: string;
  password: string;
  discordLink: string;
  employmentAccessLink: string;
}): string {
  return `
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Registration Approved</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f5f7;font-family:Segoe UI,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:14px;border:1px solid #e5e7eb;overflow:hidden;">
            <tr>
              <td style="background:linear-gradient(135deg,#1d4ed8,#2563eb);padding:28px 32px;color:#ffffff;">
                <h1 style="margin:0;font-size:24px;line-height:1.2;font-weight:700;">Registration Approved</h1>
                <p style="margin:8px 0 0;font-size:14px;line-height:1.5;opacity:.95;">Welcome to Omnilert. Your account is now ready.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi <strong>${escapeHtml(input.fullName)}</strong>,</p>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">Your registration request has been approved. Use the credentials below to sign in.</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <p style="margin:0 0 10px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;">Credentials</p>
                      <p style="margin:0 0 8px;font-size:14px;line-height:1.5;"><strong>Email:</strong> ${escapeHtml(input.email)}</p>
                      <p style="margin:0;font-size:14px;line-height:1.5;"><strong>Password:</strong> ${escapeHtml(input.password)}</p>
                    </td>
                  </tr>
                </table>

                <p style="margin:22px 0 10px;font-size:14px;line-height:1.6;font-weight:600;">Next steps:</p>
                <ol style="margin:0 0 0 18px;padding:0;color:#374151;font-size:14px;line-height:1.7;">
                  <li>Complete your profile: add a formal profile picture, fill in your details, and get your PIN code.</li>
                  <li>
                    <strong>Important:</strong> Complete your employment requirements in <em>My Account &gt; Profile</em>.
                    <a href="${escapeHtml(input.employmentAccessLink)}" style="color:#2563eb;text-decoration:none;">Open Profile tab</a>.
                    <span style="color:#6b7280;"> (If not signed in, login first and you will be redirected automatically.)</span>
                  </li>
                  <li>Check your schedule.</li>
                  <li>
                    Join the Omnilert Discord for communications:
                    <a href="${escapeHtml(input.discordLink)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(input.discordLink)}</a>
                  </li>
                </ol>

                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">For security, change your password after first login.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;">Omnilert Onboarding</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
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

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function verifyMailConnection(): Promise<void> {
  const transport = getTransporter();
  if (!transport) {
    logger.warn('SMTP config missing; mail delivery is disabled');
    return;
  }

  try {
    await transport.verify();
    logger.info('SMTP transporter is ready');
  } catch (error) {
    logger.error({ err: error }, 'SMTP verification failed');
  }
}

// ─── EPI Email Functions ───────────────────────────────────────────────────────

export async function sendWeeklyEpiEmail(
  to: string,
  employeeName: string,
  epiBefore: number,
  epiAfter: number,
  delta: number,
  reportDate: string,
  pdfBuffer: Buffer,
): Promise<void> {
  const transport = getTransporter();
  if (!transport) {
    logger.warn('SMTP config missing, skipping EPI report email');
    return;
  }

  const sign = delta >= 0 ? '+' : '';
  const dateLabel = new Date(reportDate).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const subject = `Your Weekly EPI Report — ${dateLabel}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827">
      <div style="background:#1e3a5f;padding:24px 32px;border-radius:8px 8px 0 0">
        <h1 style="color:#fff;margin:0;font-size:20px">Weekly EPI Report</h1>
        <p style="color:#93c5fd;margin:4px 0 0">${dateLabel}</p>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none">
        <p>Hi ${escapeHtml(employeeName)},</p>
        <p>Your weekly Employee Performance Index (EPI) report is ready.</p>
        <table style="width:100%;border-collapse:collapse;margin:24px 0">
          <tr>
            <td style="padding:16px;background:#f0f9ff;border-radius:8px;text-align:center;width:33%">
              <div style="color:#0369a1;font-size:12px">Previous EPI</div>
              <div style="color:#0c4a6e;font-size:28px;font-weight:bold">${epiBefore.toFixed(1)}</div>
            </td>
            <td style="padding:16px;text-align:center;width:33%">
              <div style="color:#6b7280;font-size:12px">Weekly Change</div>
              <div style="color:${delta >= 0 ? '#16a34a' : '#dc2626'};font-size:28px;font-weight:bold">${sign}${delta.toFixed(1)}</div>
            </td>
            <td style="padding:16px;background:#f0f9ff;border-radius:8px;text-align:center;width:33%">
              <div style="color:#0369a1;font-size:12px">New EPI</div>
              <div style="color:#0c4a6e;font-size:28px;font-weight:bold">${epiAfter.toFixed(1)}</div>
            </td>
          </tr>
        </table>
        <p style="color:#6b7280;font-size:13px">Your detailed KPI breakdown is attached as a PDF. Review it to see which areas contributed positively or negatively to your score.</p>
      </div>
    </div>
  `;

  await transport.sendMail({
    from: env.SMTP_FROM!,
    to,
    subject,
    html,
    attachments: [
      {
        filename: `epi-report-${reportDate}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
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
  const transport = getTransporter();
  if (!transport) {
    logger.warn('SMTP config missing, skipping manager EPI summary email');
    return;
  }

  const dateLabel = new Date(reportDate).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const sign = avgDelta >= 0 ? '+' : '';
  const subject = `Weekly EPI Summary — ${companyName} — ${dateLabel}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827">
      <div style="background:#1e3a5f;padding:24px 32px;border-radius:8px 8px 0 0">
        <h1 style="color:#fff;margin:0;font-size:20px">Weekly EPI Manager Summary</h1>
        <p style="color:#93c5fd;margin:4px 0 0">${escapeHtml(companyName)} · ${dateLabel}</p>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none">
        <p>Hi ${escapeHtml(managerName)},</p>
        <p>The weekly EPI snapshot has been processed for your team.</p>
        <ul style="padding-left:20px;color:#374151">
          <li>Employees processed: <strong>${totalEmployees}</strong></li>
          <li>Average EPI change: <strong style="color:${avgDelta >= 0 ? '#16a34a' : '#dc2626'}">${sign}${avgDelta.toFixed(1)}</strong></li>
        </ul>
        <p style="color:#6b7280;font-size:13px">A full breakdown table is attached as a PDF, sorted by EPI change (lowest first) to highlight employees who may need attention.</p>
      </div>
    </div>
  `;

  await transport.sendMail({
    from: env.SMTP_FROM!,
    to,
    subject,
    html,
    attachments: [
      {
        filename: `epi-manager-summary-${reportDate}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}

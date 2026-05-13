import type { AuditResultsWebhookPayload } from '@omnilert/shared';
import { escapeHtml, formatDateTime, renderEmailShell } from './shared.js';

export function renderAuditResultsEmail(payload: AuditResultsWebhookPayload): string {
  return renderEmailShell({
    title: 'Audit Completion Receipt',
    eyebrow: payload.company.name,
    headline: 'Audit Receipt',
    subtitle: 'Completed',
    align: 'center',
    headerGradient: 'linear-gradient(150deg, #2563eb 0%, #1d4ed8 60%, #1e40af 100%)',
    body: `
      <p style="font-size: 16px; color: #4b5563; margin-top: 0; margin-bottom: 24px;">
        Hello <strong>${escapeHtml(payload.recipient.full_name)}</strong>, your audit has been successfully processed. Below are the details of the audit.
      </p>
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border: 1px solid #e5e7eb; border-radius: 12px; background-color: #fafafa; margin-bottom: 30px;">
        <tr>
          <td style="padding: 24px;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td width="50%" valign="top">
                  <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; margin-bottom: 4px;">Audit ID</div>
                  <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 16px;">#${escapeHtml(payload.audit.id)}</div>
                </td>
                <td width="50%" valign="top">
                  <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; margin-bottom: 4px;">Type</div>
                  <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 16px;">${escapeHtml(payload.audit.type_label)}</div>
                </td>
              </tr>
              <tr>
                <td width="50%" valign="top">
                  <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; margin-bottom: 4px;">Branch</div>
                  <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 16px;">${escapeHtml(payload.branch.name)}</div>
                </td>
                <td width="50%" valign="top">
                  <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; margin-bottom: 4px;">Source Reference</div>
                  <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 16px;">${escapeHtml(payload.audit.source_reference)}</div>
                </td>
              </tr>
              <tr><td colspan="2" style="border-top: 1px dashed #d1d5db; padding-top: 20px;"></td></tr>
              <tr>
                <td width="50%" valign="top">
                  <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; margin-bottom: 4px;">Date Observed</div>
                  <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 16px;">${escapeHtml(formatDateTime(payload.audit.observed_at))}</div>
                </td>
                <td width="50%" valign="top">
                  <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; margin-bottom: 4px;">Date Completed</div>
                  <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 16px;">${escapeHtml(formatDateTime(payload.audit.completed_at))}</div>
                </td>
              </tr>
              <tr><td colspan="2" style="border-top: 1px dashed #d1d5db; padding-top: 20px;"></td></tr>
              <tr>
                <td colspan="2">
                  <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; margin-bottom: 4px;">Audited Employee</div>
                  <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 4px;">${escapeHtml(payload.recipient.full_name)}</div>
                  <div style="font-size: 13px; color: #6b7280;">${escapeHtml(payload.recipient.email)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; margin-bottom: 8px;">Audit Summary</div>
      <div style="background-color: #f9fafb; border-left: 4px solid #2563eb; padding: 16px; margin-bottom: 30px; border-radius: 4px;">
        <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #374151; font-weight: 500;">${escapeHtml(payload.summary.result_line)}</p>
      </div>
      <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
        This is an automated notification from the Omnilert Analytics System.<br>
        For questions regarding this audit, please contact your branch manager.
      </p>
    `,
  });
}

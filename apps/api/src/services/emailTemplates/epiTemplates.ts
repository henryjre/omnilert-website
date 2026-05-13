import { escapeHtml, formatScore, formatSignedScore, renderEmailShell } from './shared.js';

export function renderWeeklyEpiEmail(input: {
  employeeName: string;
  epiBefore: number;
  epiAfter: number;
  delta: number;
  reportDate: string;
}): string {
  const deltaColor = input.delta >= 0 ? '#10b981' : '#ef4444';
  return renderEmailShell({
    title: 'Your Weekly EPI Report',
    eyebrow: 'Performance Engine',
    headline: 'Weekly EPI Report',
    subtitle: input.reportDate,
    align: 'center',
    body: `
      <p style="font-size: 17px; color: #334155; margin-bottom: 25px;">Hi <strong>${escapeHtml(input.employeeName)}</strong>,</p>
      <p style="font-size: 16px; color: #475569; line-height: 1.6; margin-bottom: 35px;">
        Your weekly performance snapshot is ready. Below is your EPI score progression from the last 7 days.
      </p>
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 35px;">
        <tr>
          <td width="31%" style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 16px; padding: 25px; text-align: center;">
            <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 5px;">Previous</div>
            <div style="font-size: 24px; font-weight: 700; color: #1e3a8a;">${escapeHtml(formatScore(input.epiBefore))}</div>
          </td>
          <td width="5%">&nbsp;</td>
          <td width="28%" style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 16px; padding: 25px; text-align: center;">
            <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 5px;">Shift</div>
            <div style="font-size: 24px; font-weight: 700; color: ${deltaColor};">${escapeHtml(formatSignedScore(input.delta))}</div>
          </td>
          <td width="5%">&nbsp;</td>
          <td width="31%" style="background-color: #1e3a8a; border-radius: 16px; padding: 25px; text-align: center;">
            <div style="font-size: 11px; font-weight: 700; color: #93c5fd; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 5px;">Final Score</div>
            <div style="font-size: 24px; font-weight: 700; color: #ffffff;">${escapeHtml(formatScore(input.epiAfter))}</div>
          </td>
        </tr>
      </table>
      <div style="border-top: 1px solid #f1f5f9; padding-top: 30px; text-align: center;">
        <p style="font-size: 14px; color: #64748b; line-height: 1.6; margin: 0;">A detailed KPI breakdown is attached as a PDF. Review it to understand your performance drivers.</p>
      </div>
    `,
    footer: '&copy; 2026 OMNILERT ANALYTICS SYSTEM',
  });
}

export function renderManagerEpiSummaryEmail(input: {
  managerName: string;
  companyName: string;
  totalEmployees: number;
  avgDelta: number;
  reportDate: string;
}): string {
  const deltaColor = input.avgDelta >= 0 ? '#10b981' : '#ef4444';
  return renderEmailShell({
    title: 'Global EPI Performance Summary',
    eyebrow: 'Global Performance Summary',
    headline: 'Weekly EPI Summary',
    subtitle: input.reportDate,
    headerGradient: 'linear-gradient(135deg, #1e3a8a 0%, #172554 100%)',
    align: 'center',
    body: `
      <p style="font-size: 17px; color: #334155; margin-bottom: 30px;">
        Hi <strong>${escapeHtml(input.managerName)}</strong>,<br>
        The weekly EPI snapshot has been completed across <strong>${escapeHtml(input.companyName)}</strong>.
      </p>
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 35px; background-color: #fcfdfe; border: 1px solid #f1f5f9; border-radius: 20px;">
        <tr>
          <td width="50%" style="padding: 30px; text-align: center; border-right: 1px solid #e2e8f0;">
            <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">Total Global Staff</div>
            <div style="font-size: 28px; font-weight: 700; color: #1e3a8a;">${escapeHtml(input.totalEmployees)}</div>
          </td>
          <td width="50%" style="padding: 30px; text-align: center;">
            <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">Average EPI Change</div>
            <div style="font-size: 28px; font-weight: 700; color: ${deltaColor};">${escapeHtml(formatSignedScore(input.avgDelta))}</div>
          </td>
        </tr>
      </table>
      <div style="background: #ffffff; border: 2px dashed #cbd5e1; padding: 25px; border-radius: 16px; text-align: center;">
        <p style="margin: 0; font-size: 15px; color: #475569; line-height: 1.6;">
          <strong style="color: #1e3a8a;">Global Performance Dashboard Attached</strong><br>
          The attached PDF contains the complete ecosystem leaderboard, ranking all employees globally by their performance shift.
        </p>
      </div>
    `,
    footer: '&copy; 2026 OMNILERT ANALYTICS GLOBAL SYSTEM',
  });
}

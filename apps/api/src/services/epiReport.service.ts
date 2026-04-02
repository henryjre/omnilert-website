import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';
import { type KpiBreakdown } from './epiCalculation.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface EpiReportData {
  userId: string;
  fullName: string;
  employeeNumber: string | null;
  email: string;
  epiBefore: number;
  epiAfter: number;
  delta: number;
  rawDelta: number;
  capped: boolean;
  kpiBreakdown: KpiBreakdown;
  reportDate: string;
}

const OMNILERT_NAVY = '#1e3a8a';
const NEUTRAL_GRAY = '#64748b';
const SUCCESS_GREEN = '#10b981';
const DANGER_RED = '#ef4444';

function impactColor(impact: number): string {
  if (impact > 0) return SUCCESS_GREEN;
  if (impact < 0) return DANGER_RED;
  return NEUTRAL_GRAY;
}

function rateText(rate: number | null): string {
  return rate !== null ? `${rate.toFixed(2)}%` : 'No data';
}

function scoreText(score: number | null): string {
  return score !== null ? score.toFixed(2) : 'No data';
}

function renderCategoryHeader(doc: typeof PDFDocument.prototype, label: string, y: number): void {
  doc
    .rect(50, y - 4, 495, 20)
    .fillColor('#f8fafc')
    .fill();
  doc.fillColor(OMNILERT_NAVY).fontSize(9).font('DM-Sans-Medium').text(label, 60, y);
  doc
    .moveTo(50, y + 16)
    .lineTo(545, y + 16)
    .strokeColor('#e2e8f0')
    .stroke();
}

function renderKpiRow(
  doc: typeof PDFDocument.prototype,
  label: string,
  score: string,
  impact: number,
  y: number,
): void {
  doc.fillColor('#374151').fontSize(9).font('DM-Sans-Regular').text(label, 60, y);
  doc
    .fillColor('#111827')
    .fontSize(9)
    .font('DM-Sans-Bold')
    .text(score, 300, y, { width: 100, align: 'right' });

  const sign = impact >= 0 ? '+' : '';
  doc
    .fillColor(impactColor(impact))
    .fontSize(9)
    .font('DM-Sans-Bold')
    .text(`${sign}${impact.toFixed(2)}`, 460, y, { width: 85, align: 'right' });
}

// ─── Individual Employee Report ───────────────────────────────────────────────

export async function generateEpiReportPdf(data: EpiReportData): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const kpi = data.kpiBreakdown;

    // Register Fonts
    const fontDir = path.resolve(__dirname, '../assets/fonts');
    doc.registerFont('DM-Sans-Regular', path.join(fontDir, 'DMSans-Regular.ttf'));
    doc.registerFont('DM-Sans-Medium', path.join(fontDir, 'DMSans-Medium.ttf'));
    doc.registerFont('DM-Sans-Bold', path.join(fontDir, 'DMSans-Bold.ttf'));

    // ── Header Section
    doc
      .fillColor('#1e3a8a')
      .fontSize(26)
      .font('DM-Sans-Bold')
      .text('EPI PERFORMANCE REPORT', 0, 50, {
        align: 'center',
        width: doc.page.width,
        characterSpacing: 2,
      });
    doc
      .fillColor('#64748b')
      .fontSize(11)
      .font('DM-Sans-Regular')
      .text(`Week ending ${data.reportDate}`, 0, 82, { align: 'center', width: doc.page.width });

    doc.moveTo(50, 105).lineTo(545, 105).strokeColor('#f1f5f9').lineWidth(1).stroke();

    // ── Employee Info
    const infoY = 120;
    doc.fillColor('#1e293b').fontSize(13).font('DM-Sans-Bold').text(data.fullName, 50, infoY);
    const empNum = data.employeeNumber
      ? `Employee #${data.employeeNumber}`
      : 'Internal ID: ' + data.userId.slice(0, 8);
    doc
      .fillColor(NEUTRAL_GRAY)
      .fontSize(9)
      .font('DM-Sans-Regular')
      .text(`${empNum}  ·  ${data.email}`, 50, infoY + 16);

    doc
      .fillColor('#94a3b8')
      .fontSize(8)
      .font('DM-Sans-Bold')
      .text('EMPLOYEE DATA ONLY', 400, infoY + 4, { width: 145, align: 'right' });

    // ── Executive Summary
    const summaryY = 175;
    doc.rect(50, summaryY, 495, 65).fillColor('#f0f9ff').fill();
    doc.rect(50, summaryY, 495, 65).strokeColor('#e0f2fe').stroke();

    // Prev Score
    doc
      .fillColor('#1e40af')
      .fontSize(8)
      .font('DM-Sans-Bold')
      .text('START POSITION', 50, summaryY + 16, { width: 165, align: 'center' });
    doc
      .fillColor(OMNILERT_NAVY)
      .fontSize(20)
      .font('DM-Sans-Bold')
      .text(data.epiBefore.toFixed(2), 50, summaryY + 30, { width: 165, align: 'center' });

    // Shift
    doc
      .fillColor('#1e40af')
      .fontSize(8)
      .font('DM-Sans-Bold')
      .text('NET PERFORMANCE SHIFT', 215, summaryY + 16, { width: 165, align: 'center' });
    const rawSign = data.rawDelta >= 0 ? '+' : '';
    doc
      .fillColor(impactColor(data.rawDelta))
      .fontSize(20)
      .font('DM-Sans-Bold')
      .text(`${rawSign}${data.rawDelta.toFixed(2)}`, 215, summaryY + 30, {
        width: 165,
        align: 'center',
      });

    // Final
    doc
      .fillColor('#1e40af')
      .fontSize(8)
      .font('DM-Sans-Bold')
      .text('FINAL EPI SCORE', 380, summaryY + 16, { width: 165, align: 'center' });
    doc
      .fillColor(OMNILERT_NAVY)
      .fontSize(20)
      .font('DM-Sans-Bold')
      .text(data.epiAfter.toFixed(2), 380, summaryY + 30, { width: 165, align: 'center' });

    // ── Table Headers
    const tableHeaderY = 270;
    doc
      .fillColor('#94a3b8')
      .fontSize(9)
      .font('DM-Sans-Medium')
      .text('KEY PERFORMANCE ANALYTICS', 50, tableHeaderY);
    doc.text('METRIC RESULT', 300, tableHeaderY, { width: 100, align: 'right' });
    doc.text('EPI IMPACT', 460, tableHeaderY, { width: 85, align: 'right' });

    doc
      .moveTo(50, tableHeaderY + 14)
      .lineTo(545, tableHeaderY + 14)
      .strokeColor('#f1f5f9')
      .stroke();

    const rowH = 17;
    let rowY = tableHeaderY + 28;

    const scoreText = (val: number | null | undefined) => {
      if (val === null || val === undefined || isNaN(val)) return 'No data';
      return `${val.toFixed(2)} / 5.00`;
    };
    const rateText = (val: number | null | undefined) => {
      if (val === null || val === undefined || isNaN(val)) return '0.00%';
      return `${val.toFixed(2)}%`;
    };

    const sections: Array<{ label: string; rows: Array<[string, string, number]> }> = [
      {
        label: 'Core Performance',
        rows: [
          [
            'Customer Interaction',
            scoreText(kpi.customer_interaction.score),
            kpi.customer_interaction.impact,
          ],
          ['Cashiering Accuracy', scoreText(kpi.cashiering.score), kpi.cashiering.impact],
          [
            'Suggestive Selling & Upselling',
            scoreText(kpi.suggestive_selling_and_upselling.score),
            kpi.suggestive_selling_and_upselling.impact,
          ],
          [
            'Service Efficiency',
            scoreText(kpi.service_efficiency.score),
            kpi.service_efficiency.impact,
          ],
        ],
      },
      {
        label: 'Operational Excellence',
        rows: [
          ['Attendance Rate', rateText(kpi.attendance.rate), kpi.attendance.impact],
          ['Punctuality Rate', rateText(kpi.punctuality.rate), kpi.punctuality.impact],
          ['Productivity Rate', rateText(kpi.productivity.rate), kpi.productivity.impact],
          [
            'Average Order Value (AOV)',
            kpi.aov.value !== null && !isNaN(kpi.aov.value)
              ? `PHP ${kpi.aov.value.toFixed(2)}`
              : 'No data',
            kpi.aov.impact,
          ],
        ],
      },
      {
        label: 'Standards & Compliance',
        rows: [
          ['Uniform Compliance', rateText(kpi.uniform.rate), kpi.uniform.impact],
          ['Hygiene Compliance', rateText(kpi.hygiene.rate), kpi.hygiene.impact],
          ['SOP Compliance', rateText(kpi.sop.rate), kpi.sop.impact],
        ],
      },
      {
        label: 'Professional Record',
        rows: [
          ['Workplace Relations Score (WRS)', scoreText(kpi.wrs.score), kpi.wrs.impact],
          ['Professional Conduct Score (PCS)', scoreText(kpi.pcs.score), kpi.pcs.impact],
          ['Achievement Awards', `${kpi.awards.count} award(s)`, kpi.awards.impact],
          [
            'Violations (Direct Reduction)',
            `${kpi.violations.count} incident(s)`,
            kpi.violations.impact,
          ],
        ],
      },
    ];

    for (const section of sections) {
      renderCategoryHeader(doc, section.label, rowY);
      rowY += 24;

      for (const [label, score, impact] of section.rows) {
        renderKpiRow(doc, label, score, impact, rowY);
        rowY += rowH;
      }
      rowY += 6;
    }

    doc.moveTo(50, rowY).lineTo(545, rowY).strokeColor('#e5e7eb').stroke();
    rowY += 12;
    doc
      .fillColor(OMNILERT_NAVY)
      .fontSize(10)
      .font('DM-Sans-Bold')
      .text('Net Weekly EPI Impact', 60, rowY);
    doc
      .fillColor(impactColor(data.rawDelta))
      .fontSize(11)
      .font('DM-Sans-Bold')
      .text(`${rawSign}${data.rawDelta.toFixed(2)}`, 460, rowY, { width: 85, align: 'right' });

    doc.fontSize(8).fillColor('#94a3b8').text('OMNILERT ANALYTICS · CONFIDENTIAL · 2026', 50, 770, {
      align: 'center',
      width: 495,
      characterSpacing: 1.5,
    });

    doc.end();
  });
}

// ─── Manager Summary Report ───────────────────────────────────────────────────

export async function generateManagerSummaryPdf(
  reports: EpiReportData[],
  companyName: string,
  snapshotDate: string,
): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // Register Fonts
    const fontDir = path.resolve(__dirname, '../assets/fonts');
    doc.registerFont('DM-Sans-Regular', path.join(fontDir, 'DMSans-Regular.ttf'));
    doc.registerFont('DM-Sans-Medium', path.join(fontDir, 'DMSans-Medium.ttf'));
    doc.registerFont('DM-Sans-Bold', path.join(fontDir, 'DMSans-Bold.ttf'));

    // Header
    doc.rect(0, 0, 595, 120).fillColor(OMNILERT_NAVY).fill();
    doc
      .fillColor('#ffffff')
      .fontSize(10)
      .font('DM-Sans-Bold')
      .text('OMNILERT ANALYTICS', 50, 40, { characterSpacing: 2 });
    doc.fontSize(22).font('DM-Sans-Bold').text('GLOBAL EPI MOVEMENT SUMMARY', 50, 58);

    // Date
    doc
      .fillColor('#ffffff')
      .fontSize(9)
      .font('DM-Sans-Bold')
      .text(`Week ending ${snapshotDate}`, 50, 88);

    // Company Row
    let rowY = 145;
    doc.fillColor('#1e293b').fontSize(18).font('DM-Sans-Bold').text(companyName, 50, rowY);
    doc
      .fillColor(NEUTRAL_GRAY)
      .fontSize(11)
      .font('DM-Sans-Regular')
      .text(
        'Executive summary of current week employee performance index movement.',
        50,
        rowY + 22,
      );
    doc
      .fillColor(NEUTRAL_GRAY)
      .fontSize(9)
      .font('DM-Sans-Bold')
      .text('INTERNAL DATA ONLY', 410, rowY + 12, { width: 135, align: 'right' });

    // Summary Box
    rowY += 60;
    doc.rect(50, rowY, 495, 80).fillColor('#f0f9ff').fill();
    doc.rect(50, rowY, 495, 80).strokeColor('#e0f2fe').stroke();

    const sumDelta = reports.reduce((s, r) => s + r.delta, 0);
    const avgDelta = reports.length > 0 ? sumDelta / reports.length : 0;
    const globalAvgEpi =
      reports.length > 0 ? reports.reduce((s, r) => s + r.epiAfter, 0) / reports.length : 0;

    // Stat: Volume
    doc
      .fillColor('#1e40af')
      .fontSize(8)
      .font('DM-Sans-Bold')
      .text('TOTAL EMPLOYEES', 50, rowY + 22, { width: 165, align: 'center' });
    doc
      .fillColor(OMNILERT_NAVY)
      .fontSize(20)
      .font('DM-Sans-Bold')
      .text(`${reports.length}`, 50, rowY + 38, { width: 165, align: 'center' });

    // Stat: Avg Change
    doc
      .fillColor('#1e40af')
      .fontSize(8)
      .font('DM-Sans-Bold')
      .text('AVERAGE EPI CHANGE', 215, rowY + 22, { width: 165, align: 'center' });
    const avgSign = avgDelta >= 0 ? '+' : '';
    doc
      .fillColor(impactColor(avgDelta))
      .fontSize(20)
      .font('DM-Sans-Bold')
      .text(`${avgSign}${avgDelta.toFixed(2)}`, 215, rowY + 38, { width: 165, align: 'center' });

    // Stat: Global Avg
    doc
      .fillColor('#1e40af')
      .fontSize(8)
      .font('DM-Sans-Bold')
      .text('GLOBAL AVERAGE EPI', 380, rowY + 22, { width: 165, align: 'center' });
    doc
      .fillColor(OMNILERT_NAVY)
      .fontSize(20)
      .font('DM-Sans-Bold')
      .text(globalAvgEpi.toFixed(2), 380, rowY + 38, { width: 165, align: 'center' });

    // ── Leaderboard Table
    rowY += 120;
    doc.fillColor(NEUTRAL_GRAY).fontSize(8).font('DM-Sans-Bold').text('#', 55, rowY);
    doc.text('EMPLOYEE NAME', 85, rowY);
    doc.text('PREVIOUS EPI', 290, rowY, { width: 80, align: 'right' });
    doc.text('FINAL EPI', 375, rowY, { width: 80, align: 'right' });
    doc.text('WEEKLY CHANGE', 460, rowY, { width: 85, align: 'right' });

    rowY += 16;
    doc.moveTo(50, rowY).lineTo(545, rowY).strokeColor('#f1f5f9').stroke();
    rowY += 10;

    const sorted = [...reports].sort((a, b) => a.delta - b.delta);
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      if (i % 2 === 1)
        doc
          .rect(50, rowY - 5, 495, 22)
          .fillColor('#f9fafb')
          .fill();

      doc
        .fillColor('#475569')
        .fontSize(9)
        .font('DM-Sans-Regular')
        .text(`${i + 1}`, 55, rowY);
      doc.fillColor(OMNILERT_NAVY).font('DM-Sans-Bold').text(item.fullName, 85, rowY);

      doc
        .fillColor(NEUTRAL_GRAY)
        .font('DM-Sans-Regular')
        .text(item.epiBefore.toFixed(2), 290, rowY, { width: 80, align: 'right' });
      doc
        .fillColor('#1e293b')
        .font('DM-Sans-Bold')
        .text(item.epiAfter.toFixed(2), 375, rowY, { width: 80, align: 'right' });

      const sign = item.delta >= 0 ? '+' : '';
      doc
        .fillColor(impactColor(item.delta))
        .font('DM-Sans-Bold')
        .text(`${sign}${item.delta.toFixed(2)}`, 460, rowY, { width: 85, align: 'right' });

      rowY += 22;
      if (rowY > 750) {
        doc.addPage();
        rowY = 50;
      }
    }

    doc
      .fillColor(NEUTRAL_GRAY)
      .fontSize(8)
      .font('DM-Sans-Bold')
      .text('OMNILERT ANALYTICS · CONFIDENTIAL · 2026', 50, 770, {
        align: 'center',
        width: 495,
        characterSpacing: 1.5,
      });

    doc.end();
  });
}

import PDFDocument from 'pdfkit';
import type { KpiBreakdown } from './epiCalculation.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EpiReportData {
  userId: string;
  fullName: string;
  employeeNumber?: number | null;
  email: string;
  epiBefore: number;
  epiAfter: number;
  delta: number;
  rawDelta: number;
  capped: boolean;
  kpiBreakdown: KpiBreakdown;
  reportDate: string; // ISO date string
}

// ─── Colors ───────────────────────────────────────────────────────────────────

function impactColor(impact: number): string {
  if (impact > 0) return '#16a34a';  // green
  if (impact < 0) return '#dc2626';  // red
  return '#6b7280';                  // gray
}

function impactSign(impact: number): string {
  if (impact > 0) return `+${impact}`;
  return String(impact);
}

// ─── PDF Helpers ──────────────────────────────────────────────────────────────

function renderKpiRow(
  doc: typeof PDFDocument.prototype,
  label: string,
  scoreText: string,
  impact: number,
  y: number,
): void {
  const left = 50;
  doc.fillColor('#111827').fontSize(9).text(label, left, y, { width: 200, ellipsis: true });
  doc.fillColor('#374151').fontSize(9).text(scoreText, left + 210, y, { width: 140, align: 'right' });
  doc.fillColor(impactColor(impact)).fontSize(9).text(impactSign(impact), left + 360, y, { width: 60, align: 'right' });
}

function rateText(rate: number | null): string {
  return rate !== null ? `${rate.toFixed(1)}%` : 'No data';
}

function scoreText(score: number | null): string {
  return score !== null ? score.toFixed(2) : 'No data';
}

// ─── Individual Employee Report ───────────────────────────────────────────────

export async function generateEpiReportPdf(data: EpiReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const kpi = data.kpiBreakdown;
    const reportDateLabel = new Date(data.reportDate).toLocaleDateString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    // ── Header
    doc.fillColor('#1e3a5f').fontSize(18).font('Helvetica-Bold')
      .text('Employee Performance Index Report', 50, 50, { align: 'center' });
    doc.moveDown(0.3);
    doc.fillColor('#374151').fontSize(10).font('Helvetica')
      .text(`Week ending ${reportDateLabel}`, { align: 'center' });

    doc.moveTo(50, doc.y + 10).lineTo(545, doc.y + 10).strokeColor('#d1d5db').stroke();
    doc.moveDown(0.8);

    // ── Employee info
    const infoY = doc.y;
    doc.fillColor('#111827').fontSize(11).font('Helvetica-Bold').text(data.fullName, 50, infoY);
    doc.fillColor('#6b7280').fontSize(9).font('Helvetica')
      .text(`Employee #${data.employeeNumber ?? 'N/A'}  ·  ${data.email}`, 50, infoY + 15);

    // ── EPI Summary box
    const boxY = infoY + 45;
    doc.roundedRect(50, boxY, 495, 65, 8).fillColor('#f0f9ff').fill();

    doc.fillColor('#0369a1').fontSize(9).font('Helvetica').text('Previous EPI', 70, boxY + 12);
    doc.fillColor('#0c4a6e').fontSize(22).font('Helvetica-Bold').text(data.epiBefore.toFixed(1), 70, boxY + 24);

    doc.fillColor('#0369a1').fontSize(9).font('Helvetica').text('Weekly Change', 210, boxY + 12);
    const deltaSign = data.delta >= 0 ? '+' : '';
    const deltaColor = data.delta > 0 ? '#16a34a' : data.delta < 0 ? '#dc2626' : '#6b7280';
    doc.fillColor(deltaColor).fontSize(22).font('Helvetica-Bold').text(`${deltaSign}${data.delta.toFixed(1)}`, 210, boxY + 24);
    if (data.capped) {
      doc.fillColor('#d97706').fontSize(8).font('Helvetica').text(`(raw: ${data.rawDelta >= 0 ? '+' : ''}${data.rawDelta.toFixed(1)}, capped)`, 210, boxY + 50);
    }

    doc.fillColor('#0369a1').fontSize(9).font('Helvetica').text('New EPI', 380, boxY + 12);
    doc.fillColor('#0c4a6e').fontSize(22).font('Helvetica-Bold').text(data.epiAfter.toFixed(1), 380, boxY + 24);

    doc.moveDown(0.5);
    const tableStartY = boxY + 85;

    // ── KPI Table Header
    doc.fillColor('#374151').fontSize(8).font('Helvetica-Bold')
      .text('KPI', 50, tableStartY, { width: 200 });
    doc.fillColor('#374151').fontSize(8).font('Helvetica-Bold')
      .text('Score / Rate', 260, tableStartY, { width: 140, align: 'right' });
    doc.fillColor('#374151').fontSize(8).font('Helvetica-Bold')
      .text('EPI Impact', 410, tableStartY, { width: 60, align: 'right' });

    doc.moveTo(50, tableStartY + 14).lineTo(545, tableStartY + 14).strokeColor('#e5e7eb').stroke();

    const rowH = 18;
    let rowY = tableStartY + 20;

    const rows: Array<[string, string, number]> = [
      ['Customer Interaction', scoreText(kpi.customer_interaction.score), kpi.customer_interaction.impact],
      ['Cashiering', scoreText(kpi.cashiering.score), kpi.cashiering.impact],
      ['Suggestive Selling & Upselling', scoreText(kpi.suggestive_selling_and_upselling.score), kpi.suggestive_selling_and_upselling.impact],
      ['Service Efficiency', scoreText(kpi.service_efficiency.score), kpi.service_efficiency.impact],
      ['Workplace Relations Score (WRS)', scoreText(kpi.wrs.score), kpi.wrs.impact],
      ['Professional Conduct Score (PCS)', scoreText(kpi.pcs.score), kpi.pcs.impact],
      ['Attendance Rate', rateText(kpi.attendance.rate), kpi.attendance.impact],
      ['Punctuality Rate', rateText(kpi.punctuality.rate), kpi.punctuality.impact],
      ['Productivity Rate', rateText(kpi.productivity.rate), kpi.productivity.impact],
      ['Average Order Value (AOV)', kpi.aov.value !== null ? `PHP ${kpi.aov.value.toFixed(2)} (branch avg: PHP ${(kpi.aov.branch_avg ?? 0).toFixed(2)})` : 'No data', kpi.aov.impact],
      ['Uniform Compliance', rateText(kpi.uniform.rate), kpi.uniform.impact],
      ['Hygiene Compliance', rateText(kpi.hygiene.rate), kpi.hygiene.impact],
      ['SOP Compliance', rateText(kpi.sop.rate), kpi.sop.impact],
      ['Awards', `${kpi.awards.count} award(s)`, kpi.awards.impact],
      ['Violations (EPI Decrease)', `${kpi.violations.count} VN(s), total −${kpi.violations.total_decrease}`, kpi.violations.impact],
    ];

    for (const [label, score, impact] of rows) {
      // Alternate row background
      if (rows.indexOf([label, score, impact] as [string, string, number]) % 2 === 0) {
        doc.rect(50, rowY - 3, 495, rowH).fillColor('#f9fafb').fill();
      }
      renderKpiRow(doc, label, score, impact, rowY);
      rowY += rowH;
    }

    doc.moveTo(50, rowY + 2).lineTo(545, rowY + 2).strokeColor('#d1d5db').stroke();

    // ── Total row
    rowY += 8;
    doc.fillColor('#111827').fontSize(9).font('Helvetica-Bold').text('Total Raw EPI Change', 50, rowY);
    const rawSign = data.rawDelta >= 0 ? '+' : '';
    doc.fillColor(impactColor(data.rawDelta)).fontSize(9).font('Helvetica-Bold')
      .text(`${rawSign}${data.rawDelta.toFixed(1)}`, 410, rowY, { width: 60, align: 'right' });
    rowY += 16;
    doc.fillColor('#111827').fontSize(9).font('Helvetica-Bold').text('Final EPI Change (capped ±5)', 50, rowY);
    const cappedSign = data.delta >= 0 ? '+' : '';
    doc.fillColor(impactColor(data.delta)).fontSize(9).font('Helvetica-Bold')
      .text(`${cappedSign}${data.delta.toFixed(1)}`, 410, rowY, { width: 60, align: 'right' });

    doc.end();
  });
}

// ─── Manager Summary Report ───────────────────────────────────────────────────

export async function generateManagerSummaryPdf(
  employees: EpiReportData[],
  companyName: string,
  reportDate: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const reportDateLabel = new Date(reportDate).toLocaleDateString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    // Header
    doc.fillColor('#1e3a5f').fontSize(18).font('Helvetica-Bold')
      .text('Weekly EPI Summary Report', 50, 50, { align: 'center' });
    doc.moveDown(0.3);
    doc.fillColor('#374151').fontSize(10).font('Helvetica')
      .text(`${companyName}  ·  Week ending ${reportDateLabel}`, { align: 'center' });
    doc.moveTo(50, doc.y + 10).lineTo(545, doc.y + 10).strokeColor('#d1d5db').stroke();
    doc.moveDown(0.8);

    // Summary stats
    const avgDelta = employees.length > 0
      ? employees.reduce((s, e) => s + e.delta, 0) / employees.length
      : 0;
    const avgEpi = employees.length > 0
      ? employees.reduce((s, e) => s + e.epiAfter, 0) / employees.length
      : 0;

    doc.fillColor('#374151').fontSize(10).font('Helvetica')
      .text(`Total employees: ${employees.length}  ·  Avg EPI change: ${avgDelta >= 0 ? '+' : ''}${avgDelta.toFixed(1)}  ·  Avg EPI score: ${avgEpi.toFixed(1)}`);
    doc.moveDown(0.8);

    // Sort worst first
    const sorted = [...employees].sort((a, b) => a.delta - b.delta);

    // Table header
    const tableY = doc.y;
    const cols = { name: 50, prev: 240, delta: 300, newEpi: 365, topPos: 420, topNeg: 490 };

    doc.fillColor('#374151').fontSize(8).font('Helvetica-Bold')
      .text('Employee', cols.name, tableY, { width: 180 })
      .text('Prev', cols.prev, tableY, { width: 55, align: 'right' })
      .text('Change', cols.delta, tableY, { width: 55, align: 'right' })
      .text('New EPI', cols.newEpi, tableY, { width: 55, align: 'right' });

    doc.moveTo(50, tableY + 14).lineTo(545, tableY + 14).strokeColor('#e5e7eb').stroke();

    let rowY = tableY + 20;
    const rowH = 18;

    for (const emp of sorted) {
      if (rowY > 740) {
        doc.addPage();
        rowY = 50;
      }

      const sign = emp.delta >= 0 ? '+' : '';
      const dColor = emp.delta > 0 ? '#16a34a' : emp.delta < 0 ? '#dc2626' : '#6b7280';

      doc.fillColor('#111827').fontSize(8.5).font('Helvetica')
        .text(emp.fullName, cols.name, rowY, { width: 185, ellipsis: true });
      doc.fillColor('#374151').fontSize(8.5)
        .text(emp.epiBefore.toFixed(1), cols.prev, rowY, { width: 55, align: 'right' });
      doc.fillColor(dColor).fontSize(8.5).font('Helvetica-Bold')
        .text(`${sign}${emp.delta.toFixed(1)}`, cols.delta, rowY, { width: 55, align: 'right' });
      doc.fillColor('#111827').fontSize(8.5).font('Helvetica')
        .text(emp.epiAfter.toFixed(1), cols.newEpi, rowY, { width: 55, align: 'right' });

      rowY += rowH;
    }

    doc.end();
  });
}

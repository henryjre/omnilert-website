export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(value: unknown): string {
  return escapeHtml(value);
}

export function formatScore(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

export function formatSignedScore(value: number): string {
  const formatted = formatScore(value);
  return value >= 0 ? `+${formatted}` : formatted;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function renderEmailShell(input: {
  title: string;
  eyebrow: string;
  headline: string;
  subtitle: string;
  body: string;
  footer?: string;
  headerGradient?: string;
  align?: 'left' | 'center';
}): string {
  const align = input.align ?? 'left';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    .email-container { width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 40px rgba(30, 58, 138, 0.08); }
    @media screen and (max-width: 600px) { body { padding: 0 !important; } .email-container { border-radius: 0; } }
  </style>
</head>
<body style="background-color: #f8fafc; padding: 40px 0;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <table class="email-container" width="600" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td style="background: ${input.headerGradient ?? 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)'}; padding: 50px 40px; color: #ffffff; text-align: ${align};">
              <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3em; opacity: 0.8; margin-bottom: 12px;">${escapeHtml(input.eyebrow)}</div>
              <h1 style="font-size: 30px; font-weight: 700; margin: 0;">${escapeHtml(input.headline)}</h1>
              <p style="margin: 10px 0 0; font-size: 15px; opacity: 0.9;">${escapeHtml(input.subtitle)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              ${input.body}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 40px; background-color: #f8fafc;">
              <div style="font-size: 14px; font-weight: 700; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.4em; margin-bottom: 8px;">OMNILERT</div>
              <div style="font-size: 11px; color: #94a3b8;">${input.footer ?? '&copy; 2026 OMNILERT FOOD & BEVERAGES'}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

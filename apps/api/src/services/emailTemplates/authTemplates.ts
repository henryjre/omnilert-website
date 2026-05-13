import { escapeAttr, escapeHtml, renderEmailShell } from './shared.js';

export function renderRegistrationApprovedEmail(input: {
  fullName: string;
  email: string;
  password: string;
  discordLink: string;
  employmentAccessLink: string;
}): string {
  return renderEmailShell({
    title: 'Omnilert Registration Approved',
    eyebrow: 'Onboarding',
    headline: 'Registration Approved',
    subtitle: 'Welcome to the Omnilert Analytics ecosystem.',
    body: `
      <p style="font-size: 17px; color: #334155; margin-bottom: 20px;">Hi <strong>${escapeHtml(input.fullName)}</strong>,</p>
      <p style="font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
        Your account is activated. Use the following credentials to access your portal. Please rotate your password after your first successful sign-in.
      </p>
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 16px; margin-bottom: 35px;">
        <tr>
          <td style="padding: 25px;">
            <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 15px;">Your Access Credentials</div>
            <div style="font-size: 15px; color: #1e293b; margin-bottom: 8px;"><strong>Email:</strong> ${escapeHtml(input.email)}</div>
            <div style="font-size: 15px; color: #1e293b;"><strong>Password:</strong> ${escapeHtml(input.password)}</div>
          </td>
        </tr>
      </table>
      <div style="margin-bottom: 35px;">
        <div style="font-size: 15px; font-weight: 700; color: #1e3a8a; margin-bottom: 15px;">Next Steps:</div>
        <ul style="padding-left: 20px; font-size: 14px; color: #475569; line-height: 1.8;">
          <li>Complete your professional profile in the portal.</li>
          <li>Sync your PIN code for automated attendance.</li>
          <li>Join the Discord server: <a href="${escapeAttr(input.discordLink)}" style="color: #2563eb; text-decoration: none; font-weight: 600;">${escapeHtml(input.discordLink)}</a></li>
        </ul>
      </div>
      <div style="background-color: #eff6ff; border-radius: 14px; padding: 25px; text-align: center;">
        <a href="${escapeAttr(input.employmentAccessLink)}" style="display: block; font-size: 16px; font-weight: 700; color: #1e3a8a; text-decoration: none;">Launch Employee Portal &rarr;</a>
      </div>
    `,
  });
}

export function renderForgotPasswordEmail(input: {
  fullName: string;
  email: string;
  resetLink: string;
  expiresInMinutes: number;
}): string {
  return renderEmailShell({
    title: 'Reset Your Omnilert Password',
    eyebrow: 'Account Security',
    headline: 'Reset Your Password',
    subtitle: 'A one-time recovery link was requested for your Omnilert account.',
    body: `
      <p style="font-size: 17px; color: #334155; margin-bottom: 20px;">Hi <strong>${escapeHtml(input.fullName)}</strong>,</p>
      <p style="font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 30px;">
        Use the secure link below to choose a new password for <strong>${escapeHtml(input.email)}</strong>. This link can be used once and expires in ${escapeHtml(input.expiresInMinutes)} minutes.
      </p>
      <div style="background-color: #eff6ff; border-radius: 14px; padding: 25px; text-align: center; margin-bottom: 30px;">
        <a href="${escapeAttr(input.resetLink)}" style="display: inline-block; background-color: #1e40af; color: #ffffff; border-radius: 10px; padding: 14px 24px; font-size: 15px; font-weight: 700; text-decoration: none;">Reset Password</a>
      </div>
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 16px; margin-bottom: 30px;">
        <tr>
          <td style="padding: 22px;">
            <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 10px;">Security Note</div>
            <div style="font-size: 14px; color: #475569; line-height: 1.6;">If you did not request this password reset, you can safely ignore this email. Your password will not change unless this link is used.</div>
          </td>
        </tr>
      </table>
      <p style="font-size: 12px; color: #94a3b8; line-height: 1.6; margin: 0;">
        If the button does not work, copy and paste this link into your browser:<br />
        <a href="${escapeAttr(input.resetLink)}" style="color: #2563eb; word-break: break-all;">${escapeHtml(input.resetLink)}</a>
      </p>
    `,
  });
}

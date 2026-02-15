/**
 * Branded email template HTML generator for tools.fm auth emails.
 * Used by the custom-email edge function.
 */

export const BRAND = {
  name: "tools.fm",
  color: "#39FF14",
  bg: "#0a0a0a",
  textColor: "#ffffff",
  mutedColor: "#888888",
};

export function confirmEmailHtml(confirmUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#111;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:32px 32px 24px;text-align:center;">
          <span style="font-family:monospace;font-size:20px;font-weight:700;color:${BRAND.color};">♫ ${BRAND.name}</span>
        </td></tr>
        <tr><td style="padding:0 32px 16px;">
          <h1 style="margin:0;font-size:22px;color:${BRAND.textColor};text-align:center;">confirm your email</h1>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.mutedColor};text-align:center;">
            tap the button below to verify your email and start using tools.fm.
          </p>
        </td></tr>
        <tr><td style="padding:0 32px 32px;text-align:center;">
          <a href="${confirmUrl}" style="display:inline-block;padding:12px 32px;background:${BRAND.color};color:#000;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;">
            confirm email
          </a>
        </td></tr>
        <tr><td style="padding:0 32px 32px;">
          <p style="margin:0;font-size:11px;color:${BRAND.mutedColor};text-align:center;">
            if you didn't create an account, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function resetPasswordHtml(resetUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#111;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:32px 32px 24px;text-align:center;">
          <span style="font-family:monospace;font-size:20px;font-weight:700;color:${BRAND.color};">♫ ${BRAND.name}</span>
        </td></tr>
        <tr><td style="padding:0 32px 16px;">
          <h1 style="margin:0;font-size:22px;color:${BRAND.textColor};text-align:center;">reset your password</h1>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.mutedColor};text-align:center;">
            tap the button below to set a new password for your tools.fm account.
          </p>
        </td></tr>
        <tr><td style="padding:0 32px 32px;text-align:center;">
          <a href="${resetUrl}" style="display:inline-block;padding:12px 32px;background:${BRAND.color};color:#000;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;">
            reset password
          </a>
        </td></tr>
        <tr><td style="padding:0 32px 32px;">
          <p style="margin:0;font-size:11px;color:${BRAND.mutedColor};text-align:center;">
            if you didn't request a password reset, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function magicLinkHtml(magicUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#111;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:32px 32px 24px;text-align:center;">
          <span style="font-family:monospace;font-size:20px;font-weight:700;color:${BRAND.color};">♫ ${BRAND.name}</span>
        </td></tr>
        <tr><td style="padding:0 32px 16px;">
          <h1 style="margin:0;font-size:22px;color:${BRAND.textColor};text-align:center;">your login link</h1>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.mutedColor};text-align:center;">
            tap the button below to sign in to tools.fm.
          </p>
        </td></tr>
        <tr><td style="padding:0 32px 32px;text-align:center;">
          <a href="${magicUrl}" style="display:inline-block;padding:12px 32px;background:${BRAND.color};color:#000;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;">
            sign in
          </a>
        </td></tr>
        <tr><td style="padding:0 32px 32px;">
          <p style="margin:0;font-size:11px;color:${BRAND.mutedColor};text-align:center;">
            if you didn't request this link, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

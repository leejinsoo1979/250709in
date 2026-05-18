import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM = 'TTTCRAFT <contact@tttcraft.com>';

const buildHtml = (verifyUrl: string) => `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>이메일 인증을 완료해 주세요</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f6f8;font-family:'Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
            <tr>
              <td style="padding:40px 40px 8px 40px;">
                <div style="font-size:18px;font-weight:800;color:#111827;letter-spacing:-0.02em;">TTTCRAFT</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 0 40px;">
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.4;font-weight:800;color:#111827;">이메일 인증을 완료해 주세요</h1>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#374151;">TTTCRAFT 가입을 시작해주셔서 감사합니다.</p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#374151;">이메일 인증을 완료하면<br/>실시간 3D 가구 설계 플랫폼을 바로 이용하실 수 있습니다.</p>
                <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#374151;">아래 버튼을 눌러 인증을 완료해주세요.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 8px 40px;">
                <a href="${verifyUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:-0.01em;">이메일 인증하기</a>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 0 40px;">
                <p style="margin:0 0 8px;font-size:13px;line-height:1.7;color:#6b7280;">버튼이 동작하지 않으시면 아래 링크를 복사해 브라우저 주소창에 붙여넣어주세요.</p>
                <p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:#9ca3af;word-break:break-all;">${verifyUrl}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 40px 40px;border-top:1px solid #f1f3f5;">
                <p style="margin:24px 0 6px;font-size:12px;line-height:1.6;color:#9ca3af;">본 메일은 가입 신청 시 자동으로 발송되었습니다.<br/>본인이 요청하지 않으셨다면 이 메일을 무시해주세요.<br/>인증 링크는 24시간 후 만료됩니다.</p>
                <p style="margin:18px 0 0;font-size:12px;color:#9ca3af;">Developed by UABLE Corp.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const buildText = (verifyUrl: string) =>
  `TTTCRAFT 가입을 시작해주셔서 감사합니다.

이메일 인증을 완료하면
실시간 3D 가구 설계 플랫폼을 바로 이용하실 수 있습니다.

아래 링크를 눌러 인증을 완료해주세요.

${verifyUrl}

본 메일은 가입 신청 시 자동으로 발송되었습니다.
본인이 요청하지 않으셨다면 이 메일을 무시해주세요.
인증 링크는 24시간 후 만료됩니다.

Developed by UABLE Corp.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY is not configured' });
  }

  const { email, verifyUrl } = (req.body || {}) as { email?: string; verifyUrl?: string };
  if (!email || !verifyUrl) {
    return res.status(400).json({ error: 'email and verifyUrl are required' });
  }

  try {
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: email,
      subject: '[TTTCRAFT] 이메일 인증을 완료해 주세요',
      html: buildHtml(verifyUrl),
      text: buildText(verifyUrl),
    });
    if (error) {
      console.error('Resend send error:', error);
      return res.status(500).json({ error: 'Failed to send email', detail: error });
    }
    return res.status(200).json({ ok: true, id: data?.id });
  } catch (e: any) {
    console.error('send-verification-email error:', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

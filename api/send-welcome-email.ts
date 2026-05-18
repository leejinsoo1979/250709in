import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM = 'TTTCRAFT <noreply@tttcraft.com>';
const REPLY_TO = 'contact@tttcraft.com';

const FEATURES = [
  '실시간 3D 가구 설계',
  '맞춤형 붙박이장 / 수납장 구성',
  '자동 패널 계산 및 물량 산출',
  '2D 제작 도면 생성',
  'CNC / DXF 데이터 출력',
];

const buildHtml = () => `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>TTTCRAFT에 오신 것을 환영합니다</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f6f8;font-family:'Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
            <tr>
              <td style="padding:40px 40px 8px 40px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td style="padding-right:4px;"><div style="width:12px;height:12px;background:#111827;border-radius:50%;"></div></td>
                  <td style="padding-right:4px;"><div style="width:12px;height:12px;background:#111827;border-radius:50%;"></div></td>
                  <td style="padding-right:10px;"><div style="width:12px;height:12px;background:#111827;border-radius:50%;"></div></td>
                  <td><span style="font-size:18px;font-weight:900;color:#374151;letter-spacing:0.15em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">CRAFT</span></td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 0 40px;">
                <h1 style="margin:0 0 20px;font-size:22px;line-height:1.4;font-weight:800;color:#111827;">TTTCRAFT에 가입해주셔서 감사합니다</h1>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#374151;">TTTCRAFT는<br/>실시간 3D 설계와 제작 데이터를 연결하는<br/>가구 설계 플랫폼입니다.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 40px 0 40px;">
                <ul style="margin:0;padding:0 0 0 18px;color:#374151;font-size:15px;line-height:1.9;">
                  ${FEATURES.map(f => `<li>${f}</li>`).join('')}
                </ul>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 0 40px;">
                <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#374151;">복잡한 가구 제작 프로세스를<br/>더 빠르고 직관적으로 경험해보세요.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 40px 40px;border-top:1px solid #f1f3f5;">
                <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">Developed by UABLE Corp.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const buildText = () => `TTTCRAFT에 가입해주셔서 감사합니다.

TTTCRAFT는
실시간 3D 설계와 제작 데이터를 연결하는
가구 설계 플랫폼입니다.

${FEATURES.map(f => `• ${f}`).join('\n')}

복잡한 가구 제작 프로세스를
더 빠르고 직관적으로 경험해보세요.

Developed by UABLE Corp.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY is not configured' });
  }

  const { email } = (req.body || {}) as { email?: string };
  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  try {
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: email,
      replyTo: REPLY_TO,
      subject: '[TTTCRAFT] 가입을 환영합니다',
      html: buildHtml(),
      text: buildText(),
    });
    if (error) {
      console.error('Resend send error:', error);
      return res.status(500).json({ error: 'Failed to send email', detail: error });
    }
    return res.status(200).json({ ok: true, id: data?.id });
  } catch (e: any) {
    console.error('send-welcome-email error:', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

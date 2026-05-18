/**
 * 이메일 인증코드 발송 API
 * POST /api/send-verification-code
 * body: { email: string }
 *
 * - 6자리 숫자 코드 생성
 * - Firestore `emailVerificationCodes/{email_lowercase}`에 저장 (만료 10분, 시도횟수 0)
 * - 60초 재발송 제한 (lastSentAt 기준)
 * - Resend로 인증코드 메일 발송
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'in-f8873';
const FROM = 'TTTCRAFT <contact@tttcraft.com>';

const CODE_TTL_SEC = 10 * 60;           // 10분
const RESEND_COOLDOWN_SEC = 60;          // 재발송 60초 제한

// 간단한 SHA-256 해시 (Node 18+ crypto)
async function sha256(input: string): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(input).digest('hex');
}

function generateCode(): string {
  // 6자리 숫자, 앞자리 0 허용
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}

function emailToDocId(email: string): string {
  // Firestore 문서 ID로 안전한 형태 (소문자 + 안전한 인코딩)
  return encodeURIComponent(email.trim().toLowerCase());
}

async function getFirestoreDoc(collection: string, docId: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore get failed: ${res.status}`);
  return res.json() as Promise<any>;
}

async function setFirestoreDoc(collection: string, docId: string, fields: Record<string, any>) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;
  const firestoreFields: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') firestoreFields[k] = { stringValue: v };
    else if (typeof v === 'number') firestoreFields[k] = { integerValue: String(v) };
    else if (typeof v === 'boolean') firestoreFields[k] = { booleanValue: v };
    else if (v === null) firestoreFields[k] = { nullValue: null };
  }
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: firestoreFields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore set failed: ${res.status} ${text}`);
  }
  return res.json();
}

const buildHtml = (code: string) => `<!DOCTYPE html>
<html lang="ko">
  <head><meta charset="UTF-8" /><title>TTTCRAFT 인증 코드</title></head>
  <body style="margin:0;padding:0;background:#f5f6f8;font-family:'Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:48px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
          <tr><td style="padding:40px 40px 8px 40px;">
            <div style="font-size:18px;font-weight:800;color:#111827;letter-spacing:-0.02em;">TTTCRAFT</div>
          </td></tr>
          <tr><td style="padding:24px 40px 0 40px;">
            <h1 style="margin:0 0 16px;font-size:22px;line-height:1.4;font-weight:800;color:#111827;">이메일 인증 코드</h1>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#374151;">아래 6자리 인증 코드를 가입 화면에 입력해주세요.</p>
          </td></tr>
          <tr><td style="padding:0 40px;">
            <div style="background:#0f172a;color:#ffffff;border-radius:12px;padding:24px;text-align:center;font-size:34px;font-weight:800;letter-spacing:0.4em;font-family:'SF Mono',Menlo,Consolas,monospace;">${code}</div>
          </td></tr>
          <tr><td style="padding:24px 40px 0 40px;">
            <p style="margin:0;font-size:13px;line-height:1.7;color:#6b7280;">인증 코드는 <strong>10분간</strong> 유효합니다.<br/>본인이 요청하지 않으셨다면 이 메일을 무시해주세요.</p>
          </td></tr>
          <tr><td style="padding:24px 40px 40px 40px;border-top:1px solid #f1f3f5;">
            <p style="margin:18px 0 0;font-size:12px;color:#9ca3af;">Developed by UABLE Corp.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

const buildText = (code: string) => `TTTCRAFT 이메일 인증 코드

아래 6자리 인증 코드를 가입 화면에 입력해주세요.

  ${code}

인증 코드는 10분간 유효합니다.
본인이 요청하지 않으셨다면 이 메일을 무시해주세요.

Developed by UABLE Corp.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY is not configured' });

  const { email } = (req.body || {}) as { email?: string };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: '올바른 이메일을 입력해주세요.' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const docId = emailToDocId(normalizedEmail);

  try {
    // 1) 재발송 제한 체크
    const existing = await getFirestoreDoc('emailVerificationCodes', docId);
    const nowSec = Math.floor(Date.now() / 1000);
    const lastSentAt = existing?.fields?.lastSentAt?.integerValue
      ? Number(existing.fields.lastSentAt.integerValue)
      : 0;
    if (lastSentAt && nowSec - lastSentAt < RESEND_COOLDOWN_SEC) {
      const waitSec = RESEND_COOLDOWN_SEC - (nowSec - lastSentAt);
      return res.status(429).json({
        error: `재발송은 ${waitSec}초 후에 가능합니다.`,
        retryAfterSec: waitSec,
      });
    }

    // 2) 새 코드 생성
    const code = generateCode();
    const codeHash = await sha256(code);
    const expiresAt = nowSec + CODE_TTL_SEC;

    // 3) Firestore에 저장
    await setFirestoreDoc('emailVerificationCodes', docId, {
      email: normalizedEmail,
      codeHash,
      expiresAt,
      attempts: 0,
      verified: false,
      lastSentAt: nowSec,
    });

    // 4) Resend로 인증코드 메일 발송
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: normalizedEmail,
      subject: '[TTTCRAFT] 이메일 인증 코드',
      html: buildHtml(code),
      text: buildText(code),
    });

    if (error) {
      console.error('Resend send error:', error);
      return res.status(500).json({ error: '메일 발송에 실패했습니다.', detail: error });
    }

    return res.status(200).json({
      ok: true,
      id: data?.id,
      expiresInSec: CODE_TTL_SEC,
      cooldownSec: RESEND_COOLDOWN_SEC,
    });
  } catch (e: any) {
    console.error('send-verification-code error:', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

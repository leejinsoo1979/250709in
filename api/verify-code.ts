/**
 * 이메일 인증코드 검증 API
 * POST /api/verify-code
 * body: { email: string, code: string }
 *
 * - Firestore에서 코드 해시 비교
 * - 만료/시도횟수(최대 5회) 검증
 * - 성공 시 verified=true로 마킹 (가입 시 클라이언트에서 확인 가능)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'in-f8873';
const MAX_ATTEMPTS = 5;

async function sha256(input: string): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(input).digest('hex');
}

function emailToDocId(email: string): string {
  return encodeURIComponent(email.trim().toLowerCase());
}

async function getFirestoreDoc(collection: string, docId: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore get failed: ${res.status}`);
  return res.json() as Promise<any>;
}

async function patchFirestoreDoc(
  collection: string,
  docId: string,
  fields: Record<string, any>,
) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${docId}?${Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&')}`;
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
    throw new Error(`Firestore patch failed: ${res.status} ${text}`);
  }
  return res.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, code } = (req.body || {}) as { email?: string; code?: string };
  if (!email || !code) return res.status(400).json({ error: '이메일과 인증코드를 입력해주세요.' });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: '인증코드는 6자리 숫자입니다.' });

  const normalizedEmail = email.trim().toLowerCase();
  const docId = emailToDocId(normalizedEmail);

  try {
    const doc = await getFirestoreDoc('emailVerificationCodes', docId);
    if (!doc) {
      return res.status(400).json({ error: '먼저 인증코드를 발송해주세요.' });
    }

    const fields = doc.fields || {};
    const codeHash = fields.codeHash?.stringValue || '';
    const expiresAt = Number(fields.expiresAt?.integerValue || 0);
    const attempts = Number(fields.attempts?.integerValue || 0);
    const alreadyVerified = !!fields.verified?.booleanValue;

    const nowSec = Math.floor(Date.now() / 1000);

    if (alreadyVerified) {
      return res.status(200).json({ ok: true, verified: true, message: '이미 인증된 이메일입니다.' });
    }
    if (expiresAt && nowSec > expiresAt) {
      return res.status(400).json({ error: '인증코드가 만료되었습니다. 다시 발송해주세요.' });
    }
    if (attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: '시도 횟수를 초과했습니다. 코드를 다시 발송해주세요.' });
    }

    const inputHash = await sha256(code);
    if (inputHash !== codeHash) {
      // 시도횟수 증가
      await patchFirestoreDoc('emailVerificationCodes', docId, { attempts: attempts + 1 });
      const remaining = MAX_ATTEMPTS - (attempts + 1);
      return res.status(400).json({
        error: `인증코드가 일치하지 않습니다. (남은 시도: ${remaining}회)`,
        remaining,
      });
    }

    // 성공: verified=true
    await patchFirestoreDoc('emailVerificationCodes', docId, { verified: true });
    return res.status(200).json({ ok: true, verified: true });
  } catch (e: any) {
    console.error('verify-code error:', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

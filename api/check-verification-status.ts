import type { VercelRequest, VercelResponse } from '@vercel/node';

const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'in-f8873';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = (req.body || {}) as { email?: string };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: '올바른 이메일을 입력해주세요.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  try {
    const doc = await getFirestoreDoc('emailVerificationCodes', emailToDocId(normalizedEmail));
    const fields = doc?.fields || {};
    const verified = !!fields.verified?.booleanValue;
    const expiresAt = Number(fields.expiresAt?.integerValue || 0);
    const nowSec = Math.floor(Date.now() / 1000);

    if (!verified) {
      return res.status(400).json({ verified: false, error: '이메일 인증을 먼저 완료해주세요.' });
    }
    if (expiresAt && nowSec > expiresAt) {
      return res.status(400).json({ verified: false, error: '이메일 인증 시간이 만료되었습니다. 다시 인증해주세요.' });
    }

    return res.status(200).json({ verified: true });
  } catch (e: any) {
    console.error('check-verification-status error:', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}

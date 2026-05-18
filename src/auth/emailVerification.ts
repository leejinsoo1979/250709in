/**
 * 이메일 인증코드 발송/검증 클라이언트 헬퍼
 * - /api/send-verification-code, /api/verify-code 호출
 */

const API_BASE = ''; // 같은 도메인 사용 (Vercel)

export interface SendCodeResult {
  ok: boolean;
  error?: string;
  cooldownSec?: number;
  expiresInSec?: number;
  retryAfterSec?: number;
}

export interface VerifyCodeResult {
  ok: boolean;
  verified?: boolean;
  error?: string;
  remaining?: number;
}

export interface VerificationStatusResult {
  ok: boolean;
  verified?: boolean;
  error?: string;
}

export async function sendVerificationCode(email: string): Promise<SendCodeResult> {
  try {
    const res = await fetch(`${API_BASE}/api/send-verification-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error || '메일 발송에 실패했습니다.',
        retryAfterSec: data?.retryAfterSec,
      };
    }
    return {
      ok: true,
      cooldownSec: data?.cooldownSec,
      expiresInSec: data?.expiresInSec,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || '네트워크 오류' };
  }
}

export async function verifyCode(email: string, code: string): Promise<VerifyCodeResult> {
  try {
    const res = await fetch(`${API_BASE}/api/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.error || '인증에 실패했습니다.', remaining: data?.remaining };
    }
    return { ok: true, verified: !!data?.verified };
  } catch (e: any) {
    return { ok: false, error: e?.message || '네트워크 오류' };
  }
}

export async function checkVerificationStatus(email: string): Promise<VerificationStatusResult> {
  try {
    const res = await fetch(`${API_BASE}/api/check-verification-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, verified: false, error: data?.error || '이메일 인증 확인에 실패했습니다.' };
    }
    return { ok: true, verified: !!data?.verified };
  } catch (e: any) {
    return { ok: false, verified: false, error: e?.message || '네트워크 오류' };
  }
}

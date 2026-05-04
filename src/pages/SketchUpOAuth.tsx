/**
 * SketchUp OAuth 위임 페이지 (시스템 브라우저에서 표시)
 *
 * 흐름:
 *  1) ?port=...&state=... 쿼리 받음 (루비 플러그인이 띄움)
 *  2) signInWithRedirect로 구글 OAuth 시작 → 이 페이지로 복귀
 *  3) handleRedirectResult로 user 받음
 *  4) ID 토큰 추출
 *  5) fetch('http://127.0.0.1:port/oauth-callback', { token, state }) 로 루비에 전달
 *  6) "이 창을 닫고 SketchUp으로 돌아가세요" 안내 표시
 */

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { auth } from '@/firebase/config';

type Status =
  | 'init'
  | 'starting_oauth'
  | 'sending_token'
  | 'done'
  | 'error';

const SketchUpOAuth: React.FC = () => {
  const [searchParams] = useSearchParams();
  const port = searchParams.get('port') || '';
  const state = searchParams.get('state') || '';

  const [status, setStatus] = useState<Status>('init');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!port || !state) {
      setStatus('error');
      setErrorMsg('필수 파라미터가 누락되었습니다 (port/state). SketchUp에서 다시 시도해주세요.');
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        if (!auth) {
          setStatus('error');
          setErrorMsg('Firebase Auth가 초기화되지 않았습니다.');
          return;
        }

        await setPersistence(auth, browserLocalPersistence);

        // 우선 redirect 결과 확인 (이미 OAuth 다녀온 경우)
        const result = await getRedirectResult(auth);

        if (cancelled) return;

        if (result?.user) {
          // 구글 OAuth ID 토큰 추출 (Firebase ID 토큰 아님!)
          // signInWithCredential을 다시 호출하려면 Google OAuth credential이 필요
          setStatus('sending_token');

          const credential = GoogleAuthProvider.credentialFromResult(result);
          const googleIdToken = credential?.idToken;
          const accessToken = credential?.accessToken;

          if (!googleIdToken && !accessToken) {
            throw new Error('구글 OAuth credential 추출 실패');
          }

          await sendTokenToLocalBridge(port, state, {
            idToken: googleIdToken,
            accessToken: accessToken,
          });
          if (!cancelled) setStatus('done');
          return;
        }

        // 아직 OAuth 시작 전 → redirect 시작
        setStatus('starting_oauth');
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({
          prompt: 'select_account',
          hl: 'ko',
        });
        provider.addScope('profile');
        provider.addScope('email');

        // languageCode 한글 고정 (OAuth 페이지 한글)
        try {
          auth.languageCode = 'ko';
        } catch {
          // ignore
        }

        await signInWithRedirect(auth, provider);
        // 페이지 떠남
      } catch (err: any) {
        console.error('SketchUp OAuth error:', err);
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(err?.message || '알 수 없는 오류가 발생했습니다.');
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={brandStyle}>tttcraft × SketchUp</div>

        {status === 'init' || status === 'starting_oauth' ? (
          <>
            <Spinner />
            <div style={titleStyle}>구글 로그인을 시작합니다…</div>
            <div style={subStyle}>잠시만 기다려 주세요.</div>
          </>
        ) : status === 'sending_token' ? (
          <>
            <Spinner />
            <div style={titleStyle}>SketchUp으로 인증 정보 전송 중…</div>
          </>
        ) : status === 'done' ? (
          <>
            <CheckMark />
            <div style={titleStyle}>로그인이 완료되었습니다.</div>
            <div style={subStyle}>이 창을 닫고 SketchUp으로 돌아가세요.</div>
            <button style={primaryBtnStyle} onClick={() => window.close()}>
              창 닫기
            </button>
          </>
        ) : (
          <>
            <CrossMark />
            <div style={titleStyle}>로그인에 실패했습니다.</div>
            {errorMsg && <div style={errStyle}>{errorMsg}</div>}
            <div style={subStyle}>SketchUp으로 돌아가서 다시 시도해 주세요.</div>
          </>
        )}
      </div>
    </div>
  );
};

async function sendTokenToLocalBridge(
  port: string,
  state: string,
  tokens: { idToken?: string | null; accessToken?: string | null }
): Promise<void> {
  const url = `http://127.0.0.1:${port}/oauth-callback`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken: tokens.idToken || '',
      accessToken: tokens.accessToken || '',
      state,
    }),
  });
  if (!res.ok) {
    throw new Error(`로컬 브릿지 응답 오류: ${res.status}`);
  }
}

// ===== 작은 인라인 컴포넌트들 =====

const Spinner: React.FC = () => (
  <div
    style={{
      width: 36,
      height: 36,
      border: '3px solid #e5e7eb',
      borderTopColor: '#10b981',
      borderRadius: '50%',
      animation: 'tttcraft-spin 0.8s linear infinite',
      marginBottom: 16,
    }}
  />
);

const CheckMark: React.FC = () => (
  <div
    style={{
      width: 44,
      height: 44,
      borderRadius: '50%',
      background: '#10b981',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 24,
      marginBottom: 16,
    }}
  >
    ✓
  </div>
);

const CrossMark: React.FC = () => (
  <div
    style={{
      width: 44,
      height: 44,
      borderRadius: '50%',
      background: '#ef4444',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 24,
      marginBottom: 16,
    }}
  >
    ×
  </div>
);

// ===== 스타일 =====

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f9fafb',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", system-ui, sans-serif',
  padding: 16,
};

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: 16,
  padding: '40px 32px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  boxShadow: '0 10px 40px -10px rgba(0,0,0,0.15)',
  maxWidth: 420,
  width: '100%',
};

const brandStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#10b981',
  letterSpacing: 2,
  marginBottom: 24,
  textTransform: 'uppercase',
};

const titleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: '#1f2937',
  marginBottom: 6,
};

const subStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#6b7280',
};

const errStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#dc2626',
  background: '#fef2f2',
  borderRadius: 8,
  padding: '8px 12px',
  margin: '8px 0',
  width: '100%',
  wordBreak: 'break-all',
};

const primaryBtnStyle: React.CSSProperties = {
  marginTop: 20,
  background: '#10b981',
  color: '#fff',
  border: 'none',
  borderRadius: 999,
  padding: '10px 24px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

// keyframes 주입 (한 번만)
if (typeof document !== 'undefined' && !document.getElementById('tttcraft-spin-style')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'tttcraft-spin-style';
  styleEl.textContent = `@keyframes tttcraft-spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(styleEl);
}

export default SketchUpOAuth;

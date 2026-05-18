/**
 * 이메일 + 인증코드 입력 + 검증 흐름을 한 번에 처리하는 공용 컴포넌트
 *
 * Props:
 * - value: 현재 이메일 입력값
 * - onEmailChange: 이메일 변경 콜백
 * - onVerified: 인증 완료 콜백 (verified=true)
 * - disabled?: 폼 자체 disable
 * - placeholder?: 이메일 입력 placeholder
 *
 * 흐름:
 * 1. 이메일 입력 → [이메일 인증] 버튼
 * 2. 버튼 클릭 → /api/send-verification-code 호출 → 코드 입력란 표시
 * 3. 6자리 코드 입력 → [확인] 버튼 → /api/verify-code 호출
 * 4. 성공 시 ✅ 인증 완료 표시 + onVerified() 호출
 * 5. 이메일이 변경되면 인증 상태 초기화
 */
import React, { useEffect, useRef, useState } from 'react';
import { sendVerificationCode, verifyCode } from '@/auth/emailVerification';

interface Props {
  value: string;
  onEmailChange: (email: string) => void;
  onVerified: (email: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const EmailVerificationField: React.FC<Props> = ({
  value,
  onEmailChange,
  onVerified,
  disabled,
  placeholder = 'name@example.com',
}) => {
  const [stage, setStage] = useState<'idle' | 'codeInput' | 'verified'>('idle');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<{ type: 'info' | 'error' | 'success'; text: string } | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);
  const lastSentEmailRef = useRef<string>('');

  // 쿨다운 타이머
  useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = setInterval(() => setCooldownSec(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldownSec]);

  // 이메일이 인증 완료 후 변경되면 상태 초기화
  useEffect(() => {
    if (stage === 'verified' && value !== lastSentEmailRef.current) {
      setStage('idle');
      setCode('');
      setMessage(null);
    }
  }, [value, stage]);

  const isValidEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
  const sendBtnDisabled = !!disabled || !isValidEmail || sending || cooldownSec > 0 || stage === 'verified';

  const handleSendCode = async () => {
    if (sendBtnDisabled) return;
    setSending(true);
    setMessage(null);
    const res = await sendVerificationCode(value);
    setSending(false);
    if (res.ok) {
      lastSentEmailRef.current = value.trim().toLowerCase();
      setStage('codeInput');
      setCooldownSec(res.cooldownSec || 60);
      setMessage({ type: 'info', text: '인증코드를 발송했습니다. 메일함을 확인해주세요.' });
    } else {
      if (res.retryAfterSec) setCooldownSec(res.retryAfterSec);
      setMessage({ type: 'error', text: res.error || '발송 실패' });
    }
  };

  const handleVerifyCode = async () => {
    if (!/^\d{6}$/.test(code)) {
      setMessage({ type: 'error', text: '6자리 숫자를 입력해주세요.' });
      return;
    }
    setVerifying(true);
    const res = await verifyCode(value, code);
    setVerifying(false);
    if (res.ok && res.verified) {
      setStage('verified');
      setMessage({ type: 'success', text: '이메일 인증이 완료되었습니다.' });
      onVerified(value);
    } else {
      setMessage({ type: 'error', text: res.error || '인증 실패' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 이메일 입력 + 인증 버튼 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="email"
          value={value}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder={placeholder}
          disabled={!!disabled || stage === 'verified'}
          autoComplete="email"
          style={{
            flex: 1,
            padding: '11px 14px',
            borderRadius: 8,
            border: stage === 'verified' ? '1.5px solid #10b981' : '1px solid var(--theme-border, #d1d5db)',
            background: stage === 'verified' ? 'rgba(16, 185, 129, 0.06)' : 'var(--theme-surface, #fff)',
            color: 'var(--theme-text-primary, #111827)',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={handleSendCode}
          disabled={sendBtnDisabled}
          style={{
            padding: '0 16px',
            minWidth: 110,
            borderRadius: 8,
            border: '1px solid var(--theme-primary, #2196F3)',
            background: stage === 'verified' ? '#10b981' : 'var(--theme-primary, #2196F3)',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 700,
            cursor: sendBtnDisabled ? 'not-allowed' : 'pointer',
            opacity: sendBtnDisabled && stage !== 'verified' ? 0.55 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {stage === 'verified'
            ? '✓ 인증완료'
            : sending
              ? '발송중…'
              : cooldownSec > 0
                ? `재발송(${cooldownSec}s)`
                : stage === 'codeInput'
                  ? '재발송'
                  : '이메일 인증'}
        </button>
      </div>

      {/* 인증코드 입력 */}
      {stage === 'codeInput' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6자리 인증코드"
            disabled={!!disabled || verifying}
            autoComplete="one-time-code"
            style={{
              flex: 1,
              padding: '11px 14px',
              borderRadius: 8,
              border: '1px solid var(--theme-border, #d1d5db)',
              background: 'var(--theme-surface, #fff)',
              color: 'var(--theme-text-primary, #111827)',
              fontSize: 16,
              letterSpacing: '0.25em',
              fontFamily: 'SF Mono, Menlo, Consolas, monospace',
              textAlign: 'center',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={handleVerifyCode}
            disabled={!!disabled || verifying || code.length !== 6}
            style={{
              padding: '0 16px',
              minWidth: 110,
              borderRadius: 8,
              border: '1px solid #111827',
              background: '#111827',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 700,
              cursor: verifying || code.length !== 6 ? 'not-allowed' : 'pointer',
              opacity: code.length !== 6 ? 0.55 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {verifying ? '확인중…' : '확인'}
          </button>
        </div>
      )}

      {/* 메시지 */}
      {message && (
        <div
          style={{
            fontSize: 12,
            color:
              message.type === 'error'
                ? '#dc2626'
                : message.type === 'success'
                  ? '#059669'
                  : 'var(--theme-text-secondary, #6b7280)',
          }}
        >
          {message.text}
        </div>
      )}
    </div>
  );
};

export default EmailVerificationField;

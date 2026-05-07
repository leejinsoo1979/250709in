/**
 * 기업회원 가입 신청 결과 안내 컴포넌트
 *
 * 동작:
 *  - 로그인 후 사용자의 enterprise_inquiries 컬렉션에서 가장 최근 신청 1건 조회
 *  - status에 따라 팝업 표시:
 *      approved → 승인 환영 팝업 (사용자가 한 번 본 후 자동 디스미스)
 *      on_hold  → 보류 안내 팝업
 *      rejected → 거절 안내 팝업
 *  - "확인" 누르면 해당 inquiry에 noticeShownAt을 기록하여 같은 알림 재표시 방지
 *  - 팝업 1회 표시 후 sessionStorage에도 마킹하여 같은 세션 내 재진입 시 즉시 표시 안 함
 */

import { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';

type InquiryStatus = 'pending' | 'approved' | 'on_hold' | 'rejected';

interface InquiryDoc {
  id: string;
  status: InquiryStatus;
  reasonText?: string;
  companyName?: string;
  noticeShownAt?: unknown;
}

const SESSION_FLAG_PREFIX = 'enterprise_inquiry_seen_';

export default function EnterpriseInquiryNotice() {
  const { user } = useAuth();
  const [inquiry, setInquiry] = useState<InquiryDoc | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const sessionKey = `${SESSION_FLAG_PREFIX}${user.uid}`;
    if (sessionStorage.getItem(sessionKey) === '1') return; // 같은 세션 내 한 번만

    let cancelled = false;
    (async () => {
      try {
        const q = query(
          collection(db, 'enterprise_inquiries'),
          where('uid', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(1)
        );
        const snap = await getDocs(q);
        if (cancelled || snap.empty) return;

        const docSnap = snap.docs[0];
        const data = docSnap.data() as Omit<InquiryDoc, 'id'>;
        const status = data.status as InquiryStatus;

        // approved/on_hold/rejected만 표시 (pending은 무시)
        if (status !== 'approved' && status !== 'on_hold' && status !== 'rejected') return;

        // 이미 noticeShownAt이 있으면 표시 안 함 (한 번만 보여주기)
        if (data.noticeShownAt) {
          sessionStorage.setItem(sessionKey, '1');
          return;
        }

        setInquiry({ id: docSnap.id, ...data });
        setOpen(true);
      } catch (err) {
        console.warn('enterprise_inquiry 조회 실패:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.uid]);

  const handleClose = async () => {
    if (!user?.uid || !inquiry) {
      setOpen(false);
      return;
    }
    setOpen(false);
    try {
      await updateDoc(doc(db, 'enterprise_inquiries', inquiry.id), {
        noticeShownAt: serverTimestamp(),
      });
      sessionStorage.setItem(`${SESSION_FLAG_PREFIX}${user.uid}`, '1');
    } catch (err) {
      console.warn('noticeShownAt 업데이트 실패:', err);
    }
  };

  if (!open || !inquiry) return null;

  // 상태별 컨텐츠
  const isApproved = inquiry.status === 'approved';
  const isHold = inquiry.status === 'on_hold';
  const isRejected = inquiry.status === 'rejected';

  const accent = isApproved
    ? 'var(--theme-primary, #667eea)'
    : isHold
    ? '#f59e0b'
    : '#ef4444';

  const title = isApproved
    ? '기업회원 가입이 승인되었습니다'
    : isHold
    ? '가입 신청이 보류되었습니다'
    : '가입 신청이 거절되었습니다';

  const body = isApproved
    ? `${inquiry.companyName ? `${inquiry.companyName} 님의 ` : ''}기업계정이 활성화되어 모든 기능을 이용하실 수 있습니다.`
    : isHold
    ? '관리자가 추가 확인 중입니다. 확인이 완료되면 다시 안내드리겠습니다.'
    : '아쉽게도 가입이 어려운 것으로 확인되었습니다. 자세한 내용은 아래 사유를 참고해주세요.';

  const features = isApproved
    ? [
        '프로젝트 저장 / 불러오기',
        'CNC 옵티마이저',
        '도면 내보내기 (PDF / DXF)',
        '팀 협업 기능',
      ]
    : null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--theme-surface, #ffffff)',
          color: 'var(--theme-text, #1f2937)',
          borderRadius: 16,
          padding: '40px 40px 28px',
          width: 'min(520px, 92vw)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--theme-border, #e5e7eb)',
          textAlign: 'center',
        }}
      >
        {/* 컬러 바 */}
        <div
          style={{
            height: 4,
            width: 56,
            borderRadius: 2,
            background: accent,
            margin: '0 auto 24px',
          }}
        />
        <h3
          style={{
            margin: '0 0 14px',
            fontSize: 22,
            fontWeight: 700,
            wordBreak: 'keep-all',
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: '0 0 20px',
            fontSize: 15,
            lineHeight: 1.7,
            color: 'var(--theme-text-secondary, #6b7280)',
            wordBreak: 'keep-all',
          }}
        >
          {body}
        </p>

        {features && (
          <div
            style={{
              textAlign: 'left',
              background: 'var(--theme-surface-alt, #f9fafb)',
              border: '1px solid var(--theme-border, #e5e7eb)',
              borderRadius: 10,
              padding: '14px 18px',
              marginBottom: 24,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 8,
                color: 'var(--theme-text-secondary, #6b7280)',
              }}
            >
              이용 가능한 기능
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8 }}>
              {features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        {(isHold || isRejected) && inquiry.reasonText && (
          <div
            style={{
              textAlign: 'left',
              background: isHold ? '#fef3c7' : '#fee2e2',
              border: `1px solid ${isHold ? '#fde68a' : '#fecaca'}`,
              color: isHold ? '#92400e' : '#991b1b',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 24,
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>사유</div>
            <div>{inquiry.reasonText}</div>
          </div>
        )}

        <button
          onClick={handleClose}
          style={{
            width: '100%',
            padding: '12px 24px',
            borderRadius: 10,
            border: 'none',
            background: accent,
            color: '#ffffff',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {isApproved ? '지금 시작하기' : '확인'}
        </button>
      </div>
    </div>
  );
}

/**
 * 기업회원 가입 신청 결과 안내 컴포넌트
 *
 * 동작:
 *  - 로그인 후 사용자의 enterprise_inquiries 컬렉션을 onSnapshot으로 실시간 구독
 *  - status가 approved/on_hold/rejected 로 바뀌는 즉시 팝업 표시
 *  - 사용자가 데모 페이지에 머물러 있어도 관리자 승인 시 바로 알림
 *  - "확인" 누르면 해당 inquiry에 noticeShownAt을 기록하여 재표시 방지
 *
 * 비용 안전성: 본인 문서 1개만 구독하므로 read 비용 무시 가능
 */

import { useEffect, useRef, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
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

export default function EnterpriseInquiryNotice() {
  const { user } = useAuth();
  const [inquiry, setInquiry] = useState<InquiryDoc | null>(null);
  const [open, setOpen] = useState(false);
  // 같은 세션에서 동일 inquiry+status 조합은 한 번만 표시
  const shownSetRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, 'enterprise_inquiries'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (snap.empty) return;
        const docSnap = snap.docs[0];
        const data = docSnap.data() as Omit<InquiryDoc, 'id'>;
        const status = data.status as InquiryStatus;

        // pending은 알림 없음
        if (status !== 'approved' && status !== 'on_hold' && status !== 'rejected') return;

        // 이미 noticeShownAt 기록된 신청 = 사용자가 한 번 본 적 있음
        if (data.noticeShownAt) return;

        // 같은 inquiry+status 조합은 세션 내 한 번만
        const sigKey = `${docSnap.id}:${status}`;
        if (shownSetRef.current.has(sigKey)) return;
        shownSetRef.current.add(sigKey);

        setInquiry({ id: docSnap.id, ...data });
        setOpen(true);
      },
      (err) => {
        console.warn('enterprise_inquiry 구독 실패:', err);
      }
    );

    return () => {
      unsubscribe();
    };
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
    } catch (err) {
      console.warn('noticeShownAt 업데이트 실패:', err);
    }
  };

  if (!open || !inquiry) return null;

  // 상태별 컨텐츠
  const isApproved = inquiry.status === 'approved';
  const isHold = inquiry.status === 'on_hold';
  const isRejected = inquiry.status === 'rejected';

  const accent = isApproved ? 'var(--theme-primary, #667eea)' : '#f59e0b';

  // 사용자에겐 거절/보류 모두 '승인 보류 중'으로 통일
  const title = isApproved
    ? '기업회원 가입이 승인되었습니다'
    : '승인 보류 중입니다';

  const body = isApproved
    ? `${inquiry.companyName ? `${inquiry.companyName} 님의 ` : ''}기업계정이 활성화되어 모든 기능을 이용하실 수 있습니다.`
    : '관리자가 신청 내용을 확인하고 있습니다.\n처리 결과는 다시 안내드리겠습니다.';

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

        {/* 사유 박스 — 사용자에게 거절/보류 사유 노출 안 함 */}

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

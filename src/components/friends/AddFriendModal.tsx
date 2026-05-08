/**
 * 친구 추가 모달 — 이메일 검색 → 결과 카드 → 친구 요청
 */
import { useState } from 'react';
import { findUserByEmail, sendFriendRequest } from '@/firebase/friends';
import { useAuth } from '@/auth/AuthProvider';

interface SearchResult {
  uid: string;
  name?: string;
  email?: string;
  photoURL?: string;
}

interface Props {
  onClose: () => void;
}

export default function AddFriendModal({ onClose }: Props) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const handleSearch = async () => {
    setSearchError(null);
    setResult(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setSearchError('이메일을 입력하세요.');
      return;
    }
    if (user?.email && trimmed.toLowerCase() === user.email.toLowerCase()) {
      setSearchError('본인 이메일은 친구로 추가할 수 없습니다.');
      return;
    }
    setSearching(true);
    try {
      const found = await findUserByEmail(trimmed);
      if (!found) {
        setSearchError('해당 이메일로 가입된 회원이 없습니다.');
      } else {
        setResult(found);
      }
    } catch (err: any) {
      setSearchError(err?.message || '검색 중 오류가 발생했습니다.');
    } finally {
      setSearching(false);
    }
  };

  const handleSend = async () => {
    if (!user || !result) return;
    setSending(true);
    try {
      await sendFriendRequest({
        fromUid: user.uid,
        fromName: user.displayName || '',
        fromEmail: user.email || '',
        toUid: result.uid,
        toName: result.name,
        toEmail: result.email,
      });
      setDone(true);
    } catch (err: any) {
      alert(err?.message || '친구 요청 중 오류가 발생했습니다.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>친구 추가</h2>
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>

        {!done && (
          <>
            <label style={label}>이메일</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                placeholder="friend@example.com"
                style={input}
                disabled={searching || !!result}
              />
              <button
                onClick={handleSearch}
                disabled={searching || !!result}
                style={{ ...btnPrimary, opacity: searching ? 0.6 : 1 }}
              >
                {searching ? '검색...' : '검색'}
              </button>
            </div>
            {searchError && <div style={errorBox}>{searchError}</div>}

            {result && (
              <div style={resultCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={avatar}>
                    {result.photoURL
                      ? <img src={result.photoURL} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                      : (result.name?.[0] || result.email?.[0] || '?').toUpperCase()
                    }
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{result.name || '(이름 없음)'}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{result.email}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => { setResult(null); setEmail(''); }} style={btnSecondary} disabled={sending}>다시 검색</button>
                  <button onClick={handleSend} style={btnPrimary} disabled={sending}>
                    {sending ? '요청 중...' : '친구 요청 보내기'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {done && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>친구 요청을 보냈습니다</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              상대방이 수락하면 친구가 됩니다.
            </div>
            <button onClick={onClose} style={btnPrimary}>확인</button>
          </div>
        )}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modal: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: 24, width: 'min(90vw, 440px)',
  boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
};
const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: 28, cursor: 'pointer', color: '#6b7280', lineHeight: 1,
};
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#374151' };
const input: React.CSSProperties = {
  flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none',
};
const btnPrimary: React.CSSProperties = {
  padding: '10px 16px', background: '#3b82f6', color: '#fff', border: 'none',
  borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  padding: '10px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
  borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
const errorBox: React.CSSProperties = {
  background: '#fef2f2', color: '#b91c1c', padding: '8px 12px', borderRadius: 6,
  fontSize: 13, marginBottom: 8,
};
const resultCard: React.CSSProperties = {
  border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginTop: 8, background: '#f9fafb',
};
const avatar: React.CSSProperties = {
  width: 44, height: 44, borderRadius: '50%', background: '#3b82f6', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18,
  overflow: 'hidden', flexShrink: 0,
};

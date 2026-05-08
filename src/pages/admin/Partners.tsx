/**
 * 파트너사(공장) 관리 — /admin/partners
 *
 * 흐름: 이메일/UID 입력 → [검색] → 회원 카드 표시 → [파트너로 등록] → 목록 추가
 */
import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebase/config';

interface PartnerRow {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  plan?: string;
  partnerUpdatedAt?: Date | null;
}

interface SearchResult {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  plan?: string;
  isPartner: boolean;
}

export default function Partners() {
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // 검색 흐름
  const [searchInput, setSearchInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('isPartner', '==', true)));
      const list: PartnerRow[] = snap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>;
        const ts = (v: unknown) => (v instanceof Timestamp ? v.toDate() : null);
        return {
          uid: d.id,
          email: (x.email as string) || '',
          displayName: (x.displayName as string) || (x.name as string) || '',
          photoURL: (x.photoURL as string) || undefined,
          plan: x.plan as string | undefined,
          partnerUpdatedAt: ts(x.partnerUpdatedAt),
        };
      });
      list.sort((a, b) => (b.partnerUpdatedAt?.getTime() || 0) - (a.partnerUpdatedAt?.getTime() || 0));
      setRows(list);
    } catch (e) {
      console.error('파트너 목록 로드 실패:', e);
      alert('목록 로드 실패: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // 검색 — 이메일 또는 UID
  const handleSearch = async () => {
    const trimmed = searchInput.trim();
    if (!trimmed) {
      setSearchError('이메일 또는 UID를 입력해주세요.');
      setSearchResult(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      let foundDoc: { id: string; data: Record<string, unknown> } | null = null;

      if (trimmed.includes('@')) {
        // 이메일로 조회
        const snap = await getDocs(query(collection(db, 'users'), where('email', '==', trimmed)));
        if (!snap.empty) foundDoc = { id: snap.docs[0].id, data: snap.docs[0].data() };
      } else {
        // UID로 직접 조회
        const userSnap = await getDocs(query(collection(db, 'users'), where('__name__', '==', trimmed)));
        if (!userSnap.empty) foundDoc = { id: userSnap.docs[0].id, data: userSnap.docs[0].data() };
      }

      if (!foundDoc) {
        setSearchError('해당 사용자를 찾을 수 없습니다. 사이트에 한 번이라도 로그인한 적이 있어야 합니다.');
        return;
      }

      const x = foundDoc.data;
      setSearchResult({
        uid: foundDoc.id,
        email: (x.email as string) || '',
        displayName: (x.displayName as string) || (x.name as string) || '',
        photoURL: (x.photoURL as string) || undefined,
        plan: x.plan as string | undefined,
        isPartner: !!x.isPartner,
      });
    } catch (e) {
      setSearchError('검색 실패: ' + (e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const handleRegister = async () => {
    if (!searchResult) return;
    if (searchResult.isPartner) {
      alert('이미 파트너사로 등록된 사용자입니다.');
      return;
    }
    setRegistering(true);
    try {
      await setDoc(
        doc(db, 'users', searchResult.uid),
        { isPartner: true, partnerUpdatedAt: serverTimestamp() },
        { merge: true }
      );
      alert(`✅ ${searchResult.displayName || searchResult.email} 파트너사 등록 완료`);
      setSearchInput('');
      setSearchResult(null);
      setSearchError(null);
      await load();
    } catch (e) {
      alert('등록 실패: ' + (e as Error).message);
    } finally {
      setRegistering(false);
    }
  };

  const handleRemove = async (row: PartnerRow) => {
    if (!confirm(`${row.displayName || row.email} 의 파트너사 등록을 해제하시겠습니까?`)) return;
    try {
      await setDoc(
        doc(db, 'users', row.uid),
        { isPartner: false, partnerUpdatedAt: serverTimestamp() },
        { merge: true }
      );
      await load();
      alert('✅ 파트너사 등록 해제됨');
    } catch (e) {
      alert('해제 실패: ' + (e as Error).message);
    }
  };

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.email.toLowerCase().includes(q) ||
      r.displayName.toLowerCase().includes(q) ||
      r.uid.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ padding: 32, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 700 }}>파트너사 관리</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--theme-text-secondary, #6b7280)' }}>
            등록된 공장 {rows.length}개사
          </p>
        </div>
        <button onClick={load} style={btnSecondary}>새로고침</button>
      </div>

      {/* 새 파트너사 등록 — 검색 → 결과 → 등록 */}
      <div style={{
        background: 'var(--theme-surface, #fff)',
        border: '1px solid var(--theme-border, #e5e7eb)',
        borderRadius: 12,
        padding: 20,
        marginBottom: 24,
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>새 파트너사 등록</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--theme-text-secondary, #6b7280)' }}>
          파트너로 등록할 사용자의 <b>이메일</b> 또는 <b>UID</b>를 검색하세요.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setSearchResult(null); setSearchError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="예: factory@example.com 또는 UID"
            disabled={searching}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid var(--theme-border, #d1d5db)',
              background: 'var(--theme-surface, #fff)',
              color: 'var(--theme-text, #1f2937)',
              fontSize: 14,
              outline: 'none',
            }}
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchInput.trim()}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--theme-primary, #667eea)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: searching || !searchInput.trim() ? 'not-allowed' : 'pointer',
              opacity: searching || !searchInput.trim() ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {searching ? '검색 중...' : '검색'}
          </button>
        </div>

        {/* 검색 에러 */}
        {searchError && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', fontSize: 13 }}>
            {searchError}
          </div>
        )}

        {/* 검색 결과 카드 */}
        {searchResult && (
          <div style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 10,
            background: 'var(--theme-surface-alt, #f9fafb)',
            border: '1px solid var(--theme-border, #e5e7eb)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {searchResult.photoURL ? (
                <img src={searchResult.photoURL} alt={searchResult.displayName} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#0ea5e9', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600, flexShrink: 0 }}>
                  {(searchResult.displayName || searchResult.email || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <strong style={{ fontSize: 16 }}>{searchResult.displayName || '이름 없음'}</strong>
                  {searchResult.plan === 'enterprise' && (
                    <span style={{ padding: '2px 8px', borderRadius: 999, background: '#10b98122', color: '#10b981', fontSize: 11, fontWeight: 600 }}>기업회원</span>
                  )}
                  {searchResult.isPartner && (
                    <span style={{ padding: '2px 8px', borderRadius: 999, background: '#0ea5e922', color: '#0ea5e9', fontSize: 11, fontWeight: 600 }}>이미 파트너</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--theme-text-secondary, #6b7280)', marginBottom: 2 }}>{searchResult.email || '-'}</div>
                <div style={{ fontSize: 11, color: 'var(--theme-text-secondary, #9ca3af)', fontFamily: 'monospace' }}>UID: {searchResult.uid}</div>
              </div>
              <button
                onClick={handleRegister}
                disabled={registering || searchResult.isPartner}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: searchResult.isPartner ? '#9ca3af' : '#10b981',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: registering || searchResult.isPartner ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {registering ? '등록 중...' : searchResult.isPartner ? '이미 등록됨' : '파트너로 등록'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 검색 (등록된 파트너 목록) */}
      <input
        type="text"
        placeholder="회사명/이메일/UID 검색"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: '100%',
          padding: '10px 14px',
          borderRadius: 8,
          border: '1px solid var(--theme-border, #e5e7eb)',
          background: 'var(--theme-surface, #fff)',
          color: 'var(--theme-text, #1f2937)',
          fontSize: 14,
          marginBottom: 16,
          boxSizing: 'border-box',
        }}
      />

      {/* 목록 */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--theme-text-secondary, #6b7280)' }}>로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--theme-text-secondary, #6b7280)' }}>
          {rows.length === 0 ? '등록된 파트너사가 없습니다.' : '검색 결과가 없습니다.'}
        </div>
      ) : (
        <div style={{
          background: 'var(--theme-surface, #fff)',
          border: '1px solid var(--theme-border, #e5e7eb)',
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--theme-surface-alt, #f9fafb)' }}>
              <tr>
                <th style={th}>회사명</th>
                <th style={th}>이메일</th>
                <th style={th}>UID</th>
                <th style={th}>등급</th>
                <th style={th}>등록일</th>
                <th style={th}>관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.uid} style={{ borderTop: '1px solid var(--theme-border, #e5e7eb)' }}>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {r.photoURL ? (
                        <img src={r.photoURL} alt={r.displayName} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#0ea5e9', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>
                          {(r.displayName || r.email || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <strong>{r.displayName || '이름 없음'}</strong>
                    </div>
                  </td>
                  <td style={td}>{r.email || '-'}</td>
                  <td style={td}><code style={{ fontSize: 11, color: 'var(--theme-text-secondary, #6b7280)' }}>{r.uid.substring(0, 12)}...</code></td>
                  <td style={td}>
                    {r.plan === 'enterprise' ? (
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: '#10b98122', color: '#10b981', fontSize: 11, fontWeight: 600 }}>
                        기업회원
                      </span>
                    ) : (
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: '#6b728022', color: '#6b7280', fontSize: 11, fontWeight: 600 }}>
                        일반
                      </span>
                    )}
                  </td>
                  <td style={td}>{r.partnerUpdatedAt ? r.partnerUpdatedAt.toLocaleString('ko-KR') : '-'}</td>
                  <td style={td}>
                    <button
                      onClick={() => handleRemove(r)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid #ef4444',
                        background: 'transparent',
                        color: '#ef4444',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      등록 해제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '12px 14px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 12,
  color: 'var(--theme-text-secondary, #6b7280)',
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '12px 14px',
  verticalAlign: 'middle',
};
const btnSecondary: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px solid var(--theme-border, #e5e7eb)',
  background: 'var(--theme-surface, #fff)',
  cursor: 'pointer',
  fontSize: 13,
};

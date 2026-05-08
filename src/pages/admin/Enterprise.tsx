import { useEffect, useState } from 'react';
import { collection, query, orderBy, getDocs, doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';

type Status = 'pending' | 'approved' | 'on_hold' | 'rejected' | 'all';

interface InquiryRow {
  id: string;
  uid?: string;
  loginEmail?: string;
  contactName?: string;
  contactPhone?: string;
  companyName?: string;
  businessNumber?: string;
  businessType?: string;
  businessCategory?: string;
  expectedUsers?: string;
  businessLicenseUrl?: string;
  businessLicenseFileName?: string;
  ntsVerified?: boolean;
  ntsStatus?: string;
  ntsMessage?: string;
  status: Exclude<Status, 'all'>;
  reasonText?: string;
  reasonCode?: string;
  processedAt?: Date | null;
  processedBy?: string;
  createdAt?: Date | null;
}

const STATUS_LABEL: Record<Exclude<Status, 'all'>, string> = {
  pending: '승인 대기',
  approved: '승인됨',
  on_hold: '보류',
  rejected: '거절됨',
};
const STATUS_COLOR: Record<Exclude<Status, 'all'>, string> = {
  pending: '#3b82f6',
  approved: '#10b981',
  on_hold: '#f59e0b',
  rejected: '#ef4444',
};

export default function Enterprise() {
  const { user } = useAuth();
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; fileName?: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'enterprise_inquiries'), orderBy('createdAt', 'desc')));
      const list: InquiryRow[] = snap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>;
        const ts = (v: unknown) => (v instanceof Timestamp ? v.toDate() : null);
        return {
          id: d.id,
          uid: x.uid as string | undefined,
          loginEmail: x.loginEmail as string | undefined,
          contactName: x.contactName as string | undefined,
          contactPhone: x.contactPhone as string | undefined,
          companyName: x.companyName as string | undefined,
          businessNumber: x.businessNumber as string | undefined,
          businessType: x.businessType as string | undefined,
          businessCategory: x.businessCategory as string | undefined,
          expectedUsers: x.expectedUsers as string | undefined,
          businessLicenseUrl: x.businessLicenseUrl as string | undefined,
          businessLicenseFileName: x.businessLicenseFileName as string | undefined,
          ntsVerified: x.ntsVerified as boolean | undefined,
          ntsStatus: x.ntsStatus as string | undefined,
          ntsMessage: x.ntsMessage as string | undefined,
          status: ((x.status as string) || 'pending') as Exclude<Status, 'all'>,
          reasonText: x.reasonText as string | undefined,
          reasonCode: x.reasonCode as string | undefined,
          processedAt: ts(x.processedAt),
          processedBy: x.processedBy as string | undefined,
          createdAt: ts(x.createdAt),
        };
      });
      setRows(list);
    } catch (e) {
      console.error('기업회원 신청 로드 실패:', e);
      alert('목록 로드 실패: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // 모든 status 변경은 Cloud Function (트랜잭션)으로 처리 — status + plan 동시 변경 보장
  const callProcessFn = httpsCallable<
    { inquiryId: string; action: 'approve' | 'hold' | 'reject' | 'pending'; reason?: string },
    { ok: boolean; status: string; plan: string }
  >(functions, 'adminProcessEnterpriseInquiry');

  const handleApprove = async (row: InquiryRow) => {
    if (!confirm(`${row.companyName || row.loginEmail}을(를) 승인하시겠습니까?`)) return;
    setBusy(row.id);
    try {
      const r = await callProcessFn({ inquiryId: row.id, action: 'approve' });
      await load();
      alert(`✅ 승인 완료 (plan: ${r.data.plan})`);
    } catch (e) {
      alert('승인 실패: ' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async (row: InquiryRow, status: 'on_hold' | 'rejected') => {
    const label = status === 'on_hold' ? '보류' : '거절';
    const reason = prompt(`${label} 사유를 입력하세요:`, row.reasonText || '');
    if (reason === null) return;
    setBusy(row.id);
    try {
      const action = status === 'on_hold' ? 'hold' : 'reject';
      const r = await callProcessFn({ inquiryId: row.id, action, reason });
      await load();
      alert(`✅ ${label} 처리 완료 (plan: ${r.data.plan})`);
    } catch (e) {
      alert(`${label} 실패: ` + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // 처리 결과를 '승인 대기'로 되돌림 (status + plan 동시)
  const handleRevertToPending = async (row: InquiryRow) => {
    const wasApproved = row.status === 'approved';
    const msg = wasApproved
      ? `${row.companyName || row.loginEmail}의 승인을 취소하고 '승인 대기' 상태로 되돌립니다.\n사용자 권한도 데모(free)로 환원됩니다.\n계속하시겠습니까?`
      : `${row.companyName || row.loginEmail}을(를) '승인 대기' 상태로 되돌리시겠습니까?`;
    if (!confirm(msg)) return;
    setBusy(row.id);
    try {
      const r = await callProcessFn({ inquiryId: row.id, action: 'pending' });
      await load();
      alert(`✅ 승인 대기로 되돌렸습니다 (plan: ${r.data.plan})`);
    } catch (e) {
      alert('되돌리기 실패: ' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // 같은 uid의 신청 중 '가장 최근 1건만' 표시 (이전 건은 자동으로 보이지 않게)
  const latestByUid = (() => {
    const seen = new Set<string>();
    const result: InquiryRow[] = [];
    for (const r of rows) {
      // rows는 createdAt desc로 이미 정렬됨
      const key = r.uid || `__no_uid__${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(r);
    }
    return result;
  })();

  const filtered = latestByUid
    // superseded(보완 후 재신청으로 대체됨) 항목은 목록에서 자동 숨김
    .filter((r) => (r.status as string) !== 'superseded')
    .filter((r) => (filter === 'all' ? true : r.status === filter))
    .filter((r) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (r.companyName || '').toLowerCase().includes(q) ||
        (r.loginEmail || '').toLowerCase().includes(q) ||
        (r.businessNumber || '').includes(q) ||
        (r.contactName || '').toLowerCase().includes(q)
      );
    });

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ padding: 32, maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 700 }}>기업회원 관리</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--theme-text-secondary, #6b7280)' }}>
            전체 {rows.length}건 · 대기 {counts.pending || 0} · 승인 {counts.approved || 0} · 보류 {counts.on_hold || 0} · 거절 {counts.rejected || 0}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* 중복 사업자번호 정리 */}
          <button
            onClick={async () => {
              // 1) 같은 사업자번호로 묶기 (superseded 제외)
              const activeRows = rows.filter(r => r.status !== ('superseded' as never));
              const grouped: Record<string, InquiryRow[]> = {};
              activeRows.forEach(r => {
                const bn = (r.businessNumber || '').replace(/\D/g, '');
                if (!bn) return;
                if (!grouped[bn]) grouped[bn] = [];
                grouped[bn].push(r);
              });
              const dupGroups = Object.entries(grouped).filter(([, list]) => list.length > 1);
              if (dupGroups.length === 0) {
                alert('중복된 사업자등록번호가 없습니다.');
                return;
              }

              // 2) 미리보기: 그룹별로 유지/제거 대상 결정
              type Plan = { keep: InquiryRow; remove: InquiryRow[] };
              const plans: Plan[] = dupGroups.map(([, list]) => {
                // 우선순위: 1) approved 중 가장 오래된 것 유지 2) 없으면 가장 최근 것 유지
                const approved = list.filter(x => x.status === 'approved');
                let keep: InquiryRow;
                if (approved.length > 0) {
                  keep = approved.slice().sort((a, b) => {
                    const ta = a.createdAt ? a.createdAt.getTime() : Infinity;
                    const tb = b.createdAt ? b.createdAt.getTime() : Infinity;
                    return ta - tb;
                  })[0];
                } else {
                  keep = list.slice().sort((a, b) => {
                    const ta = a.createdAt ? a.createdAt.getTime() : 0;
                    const tb = b.createdAt ? b.createdAt.getTime() : 0;
                    return tb - ta;
                  })[0];
                }
                const remove = list.filter(x => x.id !== keep.id);
                return { keep, remove };
              });

              const totalRemove = plans.reduce((sum, p) => sum + p.remove.length, 0);
              const previewLines = plans.slice(0, 10).map(p => {
                const keep = `유지: ${p.keep.companyName || p.keep.loginEmail} (${p.keep.status})`;
                const removed = p.remove.map(r => `   제거: ${r.companyName || r.loginEmail} (${r.status})`).join('\n');
                return `[${p.keep.businessNumber}]\n  ${keep}\n${removed}`;
              }).join('\n\n');

              const ok = confirm(
                `중복 사업자번호 ${dupGroups.length}건 발견.\n` +
                `- 각 그룹에서 승인된 최초 신청 1개만 유지\n` +
                `- 나머지 ${totalRemove}건은 신청 superseded + 사용자 plan='free' 환원\n\n` +
                `미리보기 (최대 10그룹):\n${previewLines}\n\n` +
                `계속하시겠습니까?`
              );
              if (!ok) return;

              // 3) 실행
              const { doc: docRef, updateDoc, setDoc, serverTimestamp } = await import('firebase/firestore');
              let processed = 0;
              const errors: string[] = [];
              for (const p of plans) {
                for (const r of p.remove) {
                  try {
                    // 신청 superseded 처리
                    await updateDoc(docRef(db, 'enterprise_inquiries', r.id), {
                      status: 'superseded',
                      supersededAt: serverTimestamp(),
                      supersededReason: '관리자: 중복 사업자번호 정리',
                    });
                    // 사용자 plan을 free로 환원 (승인됐던 경우)
                    if (r.uid && r.status === 'approved') {
                      await setDoc(docRef(db, 'users', r.uid), {
                        plan: 'free',
                        planUpdatedAt: serverTimestamp(),
                      }, { merge: true });
                    }
                    processed++;
                  } catch (e) {
                    errors.push(`${r.companyName || r.loginEmail}: ${(e as Error).message}`);
                  }
                }
              }

              alert(
                `✅ 정리 완료\n처리: ${processed}건\n실패: ${errors.length}건` +
                (errors.length > 0 ? `\n\n${errors.slice(0, 5).join('\n')}` : '')
              );
              await load();
            }}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ef4444', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            중복 사업자번호 정리
          </button>
          <button
            onClick={async () => {
              if (!confirm('승인된 모든 기업회원의 plan을 강제 동기화합니다.\n(누락된 기존 사용자도 모두 enterprise로 복구됨)\n계속하시겠습니까?')) return;
              try {
                const fn = httpsCallable<Record<string, never>, { synced: number; details: Array<{ uid: string; email?: string; oldPlan?: string; newPlan: string }> }>(functions, 'adminSyncEnterprisePlans');
                const result = await fn({});
                const { synced, details } = result.data;
                const detailLines = details.slice(0, 20).map(d => `  ${d.email || d.uid}: ${d.oldPlan || '(없음)'} → ${d.newPlan}`).join('\n');
                alert(`✅ 동기화 완료\n변경된 사용자: ${synced}명\n\n${detailLines}${details.length > 20 ? `\n... 외 ${details.length - 20}명` : ''}`);
                await load();
              } catch (e) {
                alert('동기화 실패: ' + (e as Error).message);
              }
            }}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #10b981', background: '#10b981', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            Plan 일괄 동기화
          </button>
          <button onClick={load} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--theme-border, #e5e7eb)', background: 'var(--theme-surface, #fff)', cursor: 'pointer', fontSize: 13 }}>
            새로고침
          </button>
        </div>
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['all', 'pending', 'approved', 'on_hold', 'rejected'] as Status[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: '8px 16px',
              borderRadius: 999,
              border: '1px solid',
              borderColor: filter === s ? 'var(--theme-primary, #667eea)' : 'var(--theme-border, #e5e7eb)',
              background: filter === s ? 'var(--theme-primary, #667eea)' : 'var(--theme-surface, #fff)',
              color: filter === s ? '#fff' : 'var(--theme-text, #1f2937)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {s === 'all' ? '전체' : STATUS_LABEL[s as Exclude<Status, 'all'>]}
            {s !== 'all' && counts[s] !== undefined && ` ${counts[s]}`}
          </button>
        ))}
        <input
          type="text"
          placeholder="회사명/이메일/사업자번호/대표자 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 240, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--theme-border, #e5e7eb)', background: 'var(--theme-surface, #fff)', color: 'var(--theme-text, #1f2937)' }}
        />
      </div>

      {/* 목록 */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--theme-text-secondary, #6b7280)' }}>로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--theme-text-secondary, #6b7280)' }}>신청 내역이 없습니다.</div>
      ) : (
        <div style={{ background: 'var(--theme-surface, #fff)', border: '1px solid var(--theme-border, #e5e7eb)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'var(--theme-surface-alt, #f9fafb)' }}>
                <tr>
                  <th style={th}>상태</th>
                  <th style={th}>회사명</th>
                  <th style={th}>사업자번호</th>
                  <th style={th}>대표자</th>
                  <th style={th}>이메일</th>
                  <th style={th}>업종/업태</th>
                  <th style={th}>국세청</th>
                  <th style={th}>등록증</th>
                  <th style={th}>신청일</th>
                  <th style={th}>처리일</th>
                  <th style={th}>액션</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--theme-border, #e5e7eb)' }}>
                    <td style={td}>
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: STATUS_COLOR[r.status] + '22', color: STATUS_COLOR[r.status], fontSize: 11, fontWeight: 600 }}>
                        {STATUS_LABEL[r.status]}
                      </span>
                      {r.reasonText && (
                        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--theme-text-secondary, #6b7280)' }} title={r.reasonText}>
                          {r.reasonText.length > 16 ? r.reasonText.slice(0, 16) + '...' : r.reasonText}
                        </div>
                      )}
                    </td>
                    <td style={td}><strong>{r.companyName || '-'}</strong></td>
                    <td style={td}><code style={{ fontSize: 12 }}>{r.businessNumber || '-'}</code></td>
                    <td style={td}>
                      {r.contactName || '-'}
                      {r.contactPhone && <div style={{ fontSize: 11, color: 'var(--theme-text-secondary, #6b7280)' }}>{r.contactPhone}</div>}
                    </td>
                    <td style={td}>{r.loginEmail || '-'}</td>
                    <td style={td}>
                      <div>{r.businessType || '-'}</div>
                      <div style={{ fontSize: 11, color: 'var(--theme-text-secondary, #6b7280)' }}>{r.businessCategory || ''}</div>
                    </td>
                    <td style={td}>
                      {r.ntsVerified ? (
                        <span style={{ color: '#10b981', fontWeight: 600 }}>✓ 정상</span>
                      ) : r.ntsStatus ? (
                        <span style={{ color: '#ef4444', fontSize: 11 }}>{r.ntsStatus}</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td style={td}>
                      {r.businessLicenseUrl ? (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => setPreview({ url: r.businessLicenseUrl!, fileName: r.businessLicenseFileName })}
                            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--theme-border, #e5e7eb)', background: 'transparent', cursor: 'pointer', fontSize: 11 }}
                          >
                            보기
                          </button>
                          <a
                            href={r.businessLicenseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--theme-border, #e5e7eb)', background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--theme-text, #1f2937)', textDecoration: 'none' }}
                          >
                            새 탭
                          </a>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td style={td}>{r.createdAt ? r.createdAt.toLocaleString('ko-KR') : '-'}</td>
                    <td style={td}>{r.processedAt ? r.processedAt.toLocaleString('ko-KR') : '-'}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {r.status === 'pending' && (
                          <>
                            <button onClick={() => handleApprove(r)} disabled={busy === r.id} style={{ ...btn, background: '#10b981', color: '#fff' }}>승인</button>
                            <button onClick={() => handleReject(r, 'on_hold')} disabled={busy === r.id} style={{ ...btn, background: '#f59e0b', color: '#fff' }}>보류</button>
                            <button onClick={() => handleReject(r, 'rejected')} disabled={busy === r.id} style={{ ...btn, background: '#ef4444', color: '#fff' }}>거절</button>
                          </>
                        )}
                        {r.status === 'on_hold' && (
                          <>
                            <button onClick={() => handleApprove(r)} disabled={busy === r.id} style={{ ...btn, background: '#10b981', color: '#fff' }}>승인</button>
                            <button onClick={() => handleReject(r, 'rejected')} disabled={busy === r.id} style={{ ...btn, background: '#ef4444', color: '#fff' }}>거절</button>
                          </>
                        )}
                        {r.status === 'approved' && (
                          <button onClick={() => handleRevertToPending(r)} disabled={busy === r.id} style={{ ...btn, background: '#6b7280', color: '#fff' }}>승인 취소</button>
                        )}
                        {r.status === 'rejected' && (
                          <button onClick={() => handleApprove(r)} disabled={busy === r.id} style={{ ...btn, background: '#10b981', color: '#fff' }}>다시 승인</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 미리보기 모달 — 파일명으로 PDF/이미지 판단 (Storage URL은 .pdf로 끝나지 않음) */}
      {preview && (() => {
        const isPdf = /\.pdf$/i.test(preview.fileName || '');
        return (
          <div
            onClick={() => setPreview(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 16, maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto', position: 'relative' }}>
              <button onClick={() => setPreview(null)} style={{ position: 'absolute', top: 8, right: 8, background: '#000', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', zIndex: 1 }}>닫기</button>
              {isPdf ? (
                <iframe src={preview.url} style={{ width: '80vw', height: '80vh', border: 'none' }} title="사업자등록증" />
              ) : (
                <img
                  src={preview.url}
                  alt="사업자등록증"
                  style={{ maxWidth: '85vw', maxHeight: '85vh', display: 'block' }}
                  onError={(e) => {
                    // 이미지 로드 실패 시 PDF iframe으로 fallback
                    const target = e.currentTarget;
                    const fallback = document.createElement('iframe');
                    fallback.src = preview.url;
                    fallback.style.cssText = 'width: 80vw; height: 80vh; border: none;';
                    fallback.title = '사업자등록증';
                    target.parentElement?.replaceChild(fallback, target);
                  }}
                />
              )}
              <div style={{ marginTop: 8, textAlign: 'center', fontSize: 12 }}>
                {preview.fileName && <span style={{ color: '#6b7280', marginRight: 12 }}>{preview.fileName}</span>}
                <a href={preview.url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
                  새 탭에서 열기 / 다운로드
                </a>
              </div>
            </div>
          </div>
        );
      })()}
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
  verticalAlign: 'top',
};
const btn: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 6,
  border: 'none',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

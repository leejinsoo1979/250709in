/**
 * 발주서(공식 문서) 전체화면 모달
 * - 회사 헤더 + 발주번호 + 공급사/발주자 표 + 품목 표 + 도면 이미지 + 발행 정보
 * - [인쇄] / [PDF로 저장] / [닫기]
 * - 인쇄 시 모달 외 영역 숨김 처리 (전역 @media print 스타일)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { OrderRecord } from '@/firebase/orders';
import { getDesignFileById } from '@/firebase/projects';
import type { PlacedModule } from '@/editor/shared/furniture/types';

/**
 * moduleId → 한국어 품명 매핑
 * 예: 'single-2drawer-hanging-600' → '서랍2단+옷장 (싱글, 600)'
 *     'dual-4drawer-hanging-1200' → '서랍4단+옷장 (듀얼, 1200)'
 */
function moduleIdToKoreanName(moduleId: string, p: PlacedModule): string {
  const id = moduleId || '';
  const isDual = id.startsWith('dual-') || p.isDualSlot === true;
  const isSingle = id.startsWith('single-') && !isDual;
  const slotLabel = isDual ? '듀얼' : isSingle ? '싱글' : '';

  // 베이스 타입 (너비 제거)
  const base = id.replace(/-[\d.]+$/, '').replace(/^(single-|dual-)/, '');

  let label = '';
  if (id.startsWith('customizable-')) {
    if (id.includes('-full-')) label = '커스텀 키큰장';
    else if (id.includes('-upper-')) label = '커스텀 상부장';
    else if (id.includes('-lower-')) label = '커스텀 하부장';
    else label = '커스텀 가구';
  } else if (base.includes('upper-cabinet-shelf')) label = '상부 선반장';
  else if (base.includes('upper-cabinet')) label = '상부 도어장';
  else if (base.includes('lower-drawer-2tier')) label = '하부 서랍2단';
  else if (base.includes('lower-drawer-3tier')) label = '하부 서랍3단';
  else if (base.includes('lower-drawer-4tier')) label = '하부 서랍4단';
  else if (base.includes('lower-drawer')) label = '하부 서랍';
  else if (base.includes('lower-door-lift')) label = '리프트 도어';
  else if (base.includes('lower-top-down')) label = '탑다운 도어';
  else if (base.includes('lower-cabinet')) label = '하부 도어장';
  else if (base.includes('induction')) label = '인덕션장';
  else if (base.includes('shoe-cabinet')) label = '신발장';
  else if (base.includes('coat-cabinet')) label = '코트장';
  else if (base.includes('drawer-hanging')) {
    const m = base.match(/(\d)drawer/);
    label = `서랍${m?.[1] || ''}단 + 옷장`;
  } else if (base.includes('hanging')) label = '옷장';
  else if (base.includes('open')) label = '오픈장';
  else if (base.includes('shelf')) label = '선반장';
  else label = base.replace(/-/g, ' ');

  return slotLabel ? `${label} (${slotLabel})` : label;
}

function formatDimensions(p: PlacedModule, space?: any): string {
  // 너비: 가구 자체 우선 → moduleId 끝의 숫자 폴백
  let w = p.adjustedWidth ?? p.customWidth ?? p.freeWidth ?? p.moduleWidth;
  if (!w && p.moduleId) {
    const m = p.moduleId.match(/-([\d.]+)$/);
    if (m) w = parseFloat(m[1]);
  }

  // 높이: 가구 자체 → spaceInfo (커스텀이면 customHeight, 아니면 spaceInfo.height - 받침대 - 상단프레임)
  let h = p.customHeight ?? p.freeHeight;
  if (!h && space) {
    const isUpper = p.moduleId?.includes('upper');
    const isLower = p.moduleId?.includes('lower');
    const spaceH = space.height || 0;
    if (isUpper) {
      // 상부장 — 임의값 없이 customHeight 우선이지만 없으면 표시 생략
      h = undefined;
    } else if (isLower) {
      h = undefined;
    } else {
      // 키큰장: 공간 높이 - 상단프레임 - 받침대
      const top = space.frameSize?.top ?? 30;
      const base = (space.baseConfig?.type === 'floor' ? (space.baseConfig?.height ?? 65) : 0);
      h = Math.max(0, spaceH - top - base);
    }
  }

  // 깊이: 가구 자체 → spaceInfo.depth (보통 600 한계)
  let d = p.customDepth ?? p.freeDepth;
  if (!d && space) {
    d = Math.min(space.depth || 600, 600);
  }

  const parts: string[] = [];
  if (w) parts.push(`W${Math.round(w)}`);
  if (h) parts.push(`H${Math.round(h)}`);
  if (d) parts.push(`D${Math.round(d)}`);
  return parts.join(' × ');
}

// enterprise_inquiries 의 가장 최근 approved 1건 조회 (없으면 superseded 제외 최근 1건)
async function loadEnterpriseInquiry(uid: string): Promise<Record<string, any> | null> {
  try {
    const snap = await getDocs(query(
      collection(db, 'enterprise_inquiries'),
      where('uid', '==', uid),
      limit(20)
    ));
    if (snap.empty) return null;
    const docs = snap.docs.map(d => d.data() as Record<string, any>);
    const approved = docs.find(d => d.status === 'approved');
    if (approved) return approved;
    const valid = docs.filter(d => d.status !== 'superseded');
    if (valid.length === 0) return null;
    valid.sort((a, b) => {
      const ta = (a.createdAt?.toMillis?.() ?? 0) as number;
      const tb = (b.createdAt?.toMillis?.() ?? 0) as number;
      return tb - ta;
    });
    return valid[0];
  } catch {
    return null;
  }
}

interface PartyInfo {
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  businessNumber?: string;
  address?: string;
  representativeName?: string;
}

interface Props {
  order: OrderRecord;
  onClose: () => void;
  onSendMessage?: (peerUid: string) => void;
}

type OrderPlacedModule = {
  module: PlacedModule;
  designId: string;
  designName: string;
  projectId?: string;
  spaceConfig?: any;
};

export default function OrderDocumentModal({ order, onClose, onSendMessage }: Props) {
  const navigate = useNavigate();
  const [orderer, setOrderer] = useState<PartyInfo>({
    name: order.ordererName,
    email: order.ordererEmail,
  });
  const [factory, setFactory] = useState<PartyInfo>({
    name: order.factoryName,
  });
  const [loading, setLoading] = useState(true);
  const [placedModules, setPlacedModules] = useState<OrderPlacedModule[]>([]);
  const [loadingModules, setLoadingModules] = useState(true);
  const printRootRef = useRef<HTMLDivElement>(null);
  const orderDesigns = useMemo(() => order.designs.length > 0
    ? order.designs
    : [{
      designId: order.designId,
      designName: order.designName,
      projectId: order.projectId,
      projectName: order.projectName,
      thumbnailUrl: order.thumbnailUrl,
    }].filter(item => item.designId), [order]);
  const placedModuleGroups = useMemo(() => {
    return orderDesigns
      .map((design) => ({
        design,
        modules: placedModules.filter(item => item.designId === design.designId),
      }));
  }, [orderDesigns, placedModules]);
  const orderDocumentPages = placedModuleGroups.length > 0
    ? placedModuleGroups
    : [{
      design: {
        designId: order.designId,
        designName: order.designName || '디자인',
        projectId: order.projectId,
        projectName: order.projectName,
        thumbnailUrl: order.thumbnailUrl,
      },
      modules: [],
    }];

  // 디자인 파일에서 placedModules 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingModules(true);
      try {
        const loaded = await Promise.all(
          orderDesigns.map(async (design) => {
            const { designFile } = await getDesignFileById(design.designId);
            const modules = (designFile?.furniture?.placedModules as PlacedModule[]) || [];
            return modules.map((module) => ({
              module,
              designId: design.designId,
              designName: design.designName,
              projectId: design.projectId,
              spaceConfig: designFile?.spaceConfig || null,
            }));
          })
        );
        if (cancelled) return;
        setPlacedModules(loaded.flat());
      } catch (e) {
        console.error('[발주서 가구 로드 실패]', e);
      } finally {
        if (!cancelled) setLoadingModules(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderDesigns]);

  const handleViewItem = (item: OrderPlacedModule) => {
    const projectId = item.projectId || order.projectId || '';
    navigate(`/configurator?designFileId=${item.designId}&projectId=${projectId}&readonly=1&focusModuleId=${encodeURIComponent(item.module.id)}`);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [oUser, oProfile, fUser, fProfile, oInq, fInq] = await Promise.all([
          getDoc(doc(db, 'users', order.ordererId)),
          getDoc(doc(db, 'userProfiles', order.ordererId)),
          getDoc(doc(db, 'users', order.factoryId)),
          getDoc(doc(db, 'userProfiles', order.factoryId)),
          loadEnterpriseInquiry(order.ordererId),
          loadEnterpriseInquiry(order.factoryId),
        ]);
        if (cancelled) return;
        const ou = oUser.exists() ? (oUser.data() as any) : {};
        const op = oProfile.exists() ? (oProfile.data() as any) : {};
        const fu = fUser.exists() ? (fUser.data() as any) : {};
        const fp = fProfile.exists() ? (fProfile.data() as any) : {};
        const oi = oInq || {};
        const fi = fInq || {};

        // enterprise_inquiries 가 진실 — 사업자등록증 검증 시 입력한 정보
        // 폴백 순서: enterprise_inquiries → users → userProfiles → order 메타
        setOrderer({
          name: oi.contactName || ou.displayName || ou.name || order.ordererName || '',
          email: oi.loginEmail || ou.email || order.ordererEmail || '',
          phone: oi.contactPhone || ou.phone || op.phone || '',
          companyName: oi.companyName || ou.companyName || op.companyName || '',
          businessNumber: oi.businessNumber || ou.businessNumber || op.businessNumber || '',
          address: oi.companyAddress || oi.address || ou.address || op.address || '',
          representativeName: oi.representativeName || oi.contactName || ou.representativeName || op.representativeName || '',
        });
        setFactory({
          name: fi.contactName || fu.displayName || fu.name || order.factoryName || '',
          email: fi.loginEmail || fu.email || '',
          phone: fi.contactPhone || fu.phone || fp.phone || '',
          companyName: fi.companyName || fu.companyName || fp.companyName || '',
          businessNumber: fi.businessNumber || fu.businessNumber || fp.businessNumber || '',
          address: fi.companyAddress || fi.address || fu.address || fp.address || '',
          representativeName: fi.representativeName || fi.contactName || fu.representativeName || fp.representativeName || '',
        });
      } catch (e) {
        console.error('[발주서 정보 조회 실패]', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [order.ordererId, order.factoryId]);

  // 발주번호: 생성일 기반 (예: 20260508-XXXX)
  const orderNo = (() => {
    const d = order.createdAt || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    const tail = order.id.slice(-4).toUpperCase();
    return `${y}${m}${dy}-${tail}`;
  })();

  const issuedDate = (order.createdAt || new Date()).toLocaleDateString('ko-KR');

  const handlePrint = () => {
    document.body.classList.add('order-doc-printing');
    setTimeout(() => {
      window.print();
      setTimeout(() => document.body.classList.remove('order-doc-printing'), 300);
    }, 50);
  };

  const renderOrderPaper = (
    page: { design: typeof orderDocumentPages[number]['design']; modules: OrderPlacedModule[] },
    pageIdx: number
  ) => {
    const pageOrderNo = orderDocumentPages.length > 1 ? `${orderNo}-${pageIdx + 1}` : orderNo;
    const projectName = page.design.projectName || order.projectName;

    return (
      <div
        key={`${page.design.projectId || ''}:${page.design.designId || pageIdx}`}
        className={`order-doc-paper${pageIdx < orderDocumentPages.length - 1 ? ' order-doc-page-break' : ''}`}
        style={paper}
      >
        {/* 헤더 */}
        <div style={headerArea}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#6b7280', letterSpacing: 2 }}>ORDER FORM</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 30, fontWeight: 800, letterSpacing: 8, color: '#111827' }}>발 주 서</h1>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#374151' }}>
            <div><strong style={{ marginRight: 6 }}>No.</strong>{pageOrderNo}</div>
            <div><strong style={{ marginRight: 6 }}>발행일</strong>{issuedDate}</div>
            {orderDocumentPages.length > 1 && (
              <div><strong style={{ marginRight: 6 }}>문서</strong>{pageIdx + 1} / {orderDocumentPages.length}</div>
            )}
            <div style={{ marginTop: 6, fontSize: 16, fontWeight: 700, letterSpacing: 1, color: '#111827' }}>ttt craft</div>
          </div>
        </div>

        <div style={hr} />

        {/* 공급자(공장) / 발주자 표 */}
        <div style={partyGrid}>
          <PartyBox title="공 급 자 (수신)" info={factory} highlight />
          <PartyBox title="발 주 자 (발신)" info={orderer} />
        </div>

        {/* 품목 표 — 디자인 파일 / 프로젝트 / 납기 (요약) */}
        <h3 style={sectionTitle}>발 주 요 약</h3>
        <table style={table}>
          <tbody>
            <tr>
              <td style={{ ...thLabel, width: 110 }}>디자인</td>
              <td style={td}>
                <div style={{ fontWeight: 600 }}>{page.design.designName}</div>
                {projectName && (
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>프로젝트: {projectName}</div>
                )}
              </td>
              <td style={{ ...thLabel, width: 80 }}>납기</td>
              <td style={{ ...td, width: 140, textAlign: 'center' }}>{order.formData.dueDate || '-'}</td>
            </tr>
          </tbody>
        </table>

        {/* 가구 모듈 목록 — 디자인별 한 문서 안에서 가구별로 한 행 */}
        <h3 style={{ ...sectionTitle, marginTop: 24 }}>품 목 내 역 ({page.modules.length}점)</h3>
        <table style={table}>
          <thead>
            <tr>
              <th style={{ ...th, width: 40 }}>No.</th>
              <th style={th}>품명</th>
              <th style={{ ...th, width: 220 }}>치수 (W × H × D, mm)</th>
              <th style={{ ...th, width: 90 }}>도어</th>
              <th className="order-doc-no-print" style={{ ...th, width: 80 }}>보기</th>
            </tr>
          </thead>
          <tbody>
            {loadingModules ? (
              <tr>
                <td colSpan={5} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 20 }}>
                  가구 목록 불러오는 중…
                </td>
              </tr>
            ) : page.modules.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 20 }}>
                  등록된 가구가 없습니다.
                </td>
              </tr>
            ) : (
              page.modules.map((item, idx) => (
                <tr key={`${item.designId}:${item.module.id || idx}`}>
                  <td style={tdCenter}>{idx + 1}</td>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{moduleIdToKoreanName(item.module.moduleId, item.module)}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>
                      {item.module.moduleId}
                    </div>
                  </td>
                  <td style={{ ...tdCenter, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                    {formatDimensions(item.module, item.spaceConfig) || '-'}
                  </td>
                  <td style={tdCenter}>{item.module.hasDoor ? '있음' : '없음'}</td>
                  <td className="order-doc-no-print" style={tdCenter}>
                    <button onClick={() => handleViewItem(item)} style={btnViewItem}>
                      보기
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* 자재 스펙 / 배송지 / 설치 일정 / 요청사항 */}
        <table style={{ ...table, marginTop: 12 }}>
          <tbody>
            {order.formData.materialSpec && (
              <tr>
                <td style={{ ...thLabel, width: 110 }}>자재 스펙</td>
                <td style={{ ...td, whiteSpace: 'pre-wrap' }}>{order.formData.materialSpec}</td>
              </tr>
            )}
            {order.formData.deliveryAddress && (
              <tr>
                <td style={{ ...thLabel, width: 110 }}>배송지</td>
                <td style={td}>{order.formData.deliveryAddress}</td>
              </tr>
            )}
            {order.formData.installSchedule && (
              <tr>
                <td style={thLabel}>설치 일정</td>
                <td style={td}>{order.formData.installSchedule}</td>
              </tr>
            )}
            {order.formData.notes && (
              <tr>
                <td style={thLabel}>요청사항</td>
                <td style={{ ...td, whiteSpace: 'pre-wrap' }}>{order.formData.notes}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 푸터 */}
        <div style={footerArea}>
          <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.7 }}>
            ※ 본 발주서는 ttt craft 시스템에서 자동 발행되었으며, 별도의 서명 없이도 양 당사자 간 합의의 효력을 가집니다.<br />
            ※ 발주 내용에 대한 문의는 메신저 또는 위 연락처로 부탁드립니다.
          </div>
          <div style={{ fontSize: 12, color: '#374151', marginTop: 16, display: 'flex', justifyContent: 'space-between' }}>
            <span>발행 시스템 · ttt craft (tttcraft.com)</span>
            <span>발행일자 · {issuedDate}</span>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 12, fontSize: 12, color: '#9ca3af' }}>
            당사자 정보 불러오는 중…
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* 인쇄 전용 글로벌 스타일 */}
      <style>{`
        @media print {
          body.order-doc-printing > *:not(.order-doc-print-portal) { display: none !important; }
          .order-doc-print-portal .order-doc-overlay { position: static !important; background: #fff !important; padding: 0 !important; }
          .order-doc-print-portal .order-doc-modal { box-shadow: none !important; max-height: none !important; height: auto !important; width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
          .order-doc-print-portal .order-doc-toolbar { display: none !important; }
          .order-doc-print-portal .order-doc-scroll { overflow: visible !important; background: #fff !important; padding: 0 !important; display: block !important; }
          .order-doc-print-portal .order-doc-paper { padding: 24mm 18mm !important; margin: 0 !important; width: auto !important; min-height: auto !important; box-shadow: none !important; }
          .order-doc-print-portal .order-doc-page-break { break-after: page; page-break-after: always; }
          .order-doc-print-portal .order-doc-no-print { display: none !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      <div className="order-doc-print-portal">
        <div className="order-doc-overlay" style={overlay} onClick={onClose}>
          <div className="order-doc-modal" style={modal} onClick={(e) => e.stopPropagation()}>
            {/* 툴바 */}
            <div className="order-doc-toolbar" style={toolbar}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--theme-text, #1f2937)' }}>발주서 No. {orderNo}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handlePrint} style={btnPrimary}>인쇄 / PDF 저장</button>
                {onSendMessage && (
                  <button onClick={() => onSendMessage(order.ordererId)} style={btnSecondary}>메시지</button>
                )}
                <button onClick={onClose} style={btnSecondary}>닫기</button>
              </div>
            </div>

            {/* 발주서 본체 (인쇄용) */}
            <div className="order-doc-scroll" style={documentScroll}>
              {orderDocumentPages.map((page, idx) => renderOrderPaper(page, idx))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function PartyBox({ title, info, highlight }: { title: string; info: PartyInfo; highlight?: boolean }) {
  return (
    <div style={{
      border: '1.5px solid ' + (highlight ? '#111827' : '#9ca3af'),
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      <div style={{
        background: highlight ? '#111827' : '#374151',
        color: '#fff',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 2,
        padding: '6px 10px',
        textAlign: 'center',
      }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <tbody>
          <PartyRow label="상호" value={info.companyName || info.name || '-'} />
          <PartyRow label="대표자" value={info.representativeName || '-'} />
          <PartyRow label="사업자번호" value={info.businessNumber || '-'} />
          <PartyRow label="주소" value={info.address || '-'} />
          <PartyRow label="담당자" value={info.name || '-'} />
          <PartyRow label="연락처" value={info.phone || '-'} />
          <PartyRow label="이메일" value={info.email || '-'} />
        </tbody>
      </table>
    </div>
  );
}

function PartyRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{
        background: '#f3f4f6', color: '#374151', fontWeight: 600,
        padding: '7px 10px', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb',
        width: 80, fontSize: 11,
      }}>{label}</td>
      <td style={{
        padding: '7px 10px', borderBottom: '1px solid #e5e7eb', color: '#1f2937', fontSize: 12,
        wordBreak: 'break-all',
      }}>{value}</td>
    </tr>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24,
};
const modal: React.CSSProperties = {
  background: '#fff', borderRadius: 12, width: 'min(96vw, 920px)',
  maxHeight: '94vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 24px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
};
const toolbar: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '12px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb',
  flexShrink: 0,
};
const documentScroll: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  background: '#e5e7eb',
  padding: 24,
};
const paper: React.CSSProperties = {
  padding: '40px 56px', background: '#fff', color: '#111827',
  width: 'min(100%, 794px)', minHeight: 1123, margin: '0 auto 24px',
  boxShadow: '0 8px 28px rgba(15, 23, 42, 0.14)',
};
const headerArea: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16,
};
const hr: React.CSSProperties = {
  height: 3, background: '#111827', margin: '14px 0 24px',
};
const partyGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24,
};
const sectionTitle: React.CSSProperties = {
  margin: '20px 0 8px', fontSize: 13, fontWeight: 700, letterSpacing: 4,
  color: '#111827', borderBottom: '2px solid #111827', paddingBottom: 4,
};
const table: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: 12,
};
const th: React.CSSProperties = {
  background: '#111827', color: '#fff', padding: '8px 10px',
  border: '1px solid #111827', fontWeight: 600, fontSize: 11,
};
const thLabel: React.CSSProperties = {
  background: '#f3f4f6', color: '#374151', padding: '8px 10px',
  border: '1px solid #d1d5db', fontWeight: 600, fontSize: 11, textAlign: 'left',
};
const td: React.CSSProperties = {
  padding: '10px', border: '1px solid #d1d5db', color: '#1f2937', verticalAlign: 'top',
};
const tdCenter: React.CSSProperties = { ...td, textAlign: 'center' };
const imageBox: React.CSSProperties = {
  border: '1px solid #d1d5db', borderRadius: 4, padding: 12,
  display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa',
};
const footerArea: React.CSSProperties = {
  marginTop: 32, paddingTop: 16, borderTop: '1px dashed #9ca3af',
};
const btnPrimary: React.CSSProperties = {
  padding: '8px 16px', background: 'var(--theme-primary, #3b82f6)', color: '#fff',
  border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  padding: '8px 16px', background: '#fff', color: '#1f2937',
  border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const btnViewItem: React.CSSProperties = {
  padding: '5px 12px', background: 'var(--theme-primary, #3b82f6)', color: '#fff',
  border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer',
};

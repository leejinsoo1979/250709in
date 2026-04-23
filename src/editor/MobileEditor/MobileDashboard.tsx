// MobileDashboard — 시안 Image #119 기반 대시보드
// 세로(portrait): 상단 헤더 → 검색 → 새 디자인 → 빠른 액세스 → 파일 그리드 → 하단 탭바
// 가로(landscape): 좌측 사이드바(디자인/공유/내정보 세로 탭) + 메인 영역 같은 구성을 2열로
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { getUserProjects, getDesignFiles } from '@/firebase/projects';
import type { ProjectSummary, DesignFileSummary } from '@/firebase/types';
import { signOutUser } from '@/firebase/auth';
import './MobileEditor.css';

// ─── 디자인 토큰 ──────────────────────────────────────────────
const T = {
  primary:   '#7C5CFF', // 시안 보라
  primary50: '#EFEBFF',
  primarySoft: '#F3F1FF',
  ink:       '#111827',
  ink2:      '#4B5563',
  ink3:      '#9CA3AF',
  line:      '#E5E7EB',
  line2:     '#F3F4F6',
  bg:        '#F9FAFB',
  surface:   '#FFFFFF',
  success:   '#10B981',
};

const FONT = `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`;

type BottomTab = 'design' | 'shared' | 'my';
type ViewMode = 'grid' | 'list';

// ─── 아이콘 ─────────────────────────────────────────────────
const IconGrid = (p: { size?: number; color?: string }) => (
  <svg width={p.size||20} height={p.size||20} viewBox="0 0 24 24" fill="none" stroke={p.color||'currentColor'} strokeWidth="1.8">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);
const IconList = (p: { size?: number; color?: string }) => (
  <svg width={p.size||20} height={p.size||20} viewBox="0 0 24 24" fill="none" stroke={p.color||'currentColor'} strokeWidth="1.8">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);
const IconBell = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);
const IconSearch = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const IconPlus = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconActivity = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);
const IconCheck = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconUpload = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);
const IconCube = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);
const IconShare = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);
const IconUser = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

// ─── 대시보드 ───────────────────────────────────────────────
const MobileDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [isLandscape, setIsLandscape] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : false
  );
  useEffect(() => {
    const onResize = () => setIsLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const [bottomTab, setBottomTab] = useState<BottomTab>('design');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [designs, setDesigns] = useState<Array<DesignFileSummary & { projectId: string; projectTitle: string }>>([]);

  // 프로젝트 + 디자인 파일 로드
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { projects: ps } = await getUserProjects(user.uid);
        if (cancelled) return;
        setProjects(ps || []);

        // 각 프로젝트의 디자인 파일 병렬 로드
        const all = await Promise.all(
          (ps || []).map(async (p) => {
            const { designFiles } = await getDesignFiles(p.id);
            return (designFiles || []).map(d => ({
              ...d,
              projectId: p.id,
              projectTitle: p.title || '프로젝트',
            }));
          })
        );
        if (cancelled) return;
        const flat = all.flat().sort((a, b) => {
          const av = (a.updatedAt as any)?.seconds || 0;
          const bv = (b.updatedAt as any)?.seconds || 0;
          return bv - av;
        });
        setDesigns(flat);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // 빠른 액세스 카운트 (임시: 프로젝트 상태 필드가 없어 디자인 수·최근 기준)
  const stats = useMemo(() => ({
    active: projects.length,
    done: 0,
    shared: 0,
  }), [projects]);

  const filtered = useMemo(() => {
    if (!query.trim()) return designs;
    const q = query.trim().toLowerCase();
    return designs.filter(d =>
      (d.name || '').toLowerCase().includes(q) ||
      (d.projectTitle || '').toLowerCase().includes(q)
    );
  }, [designs, query]);

  const handleOpenDesign = useCallback((d: DesignFileSummary & { projectId: string }) => {
    navigate(`/mobile/configurator?designId=${d.id}&projectId=${d.projectId}`);
  }, [navigate]);

  const handleNew = useCallback(() => {
    navigate('/mobile/configurator?new=1');
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    await signOutUser();
    navigate('/mobile/login', { replace: true });
  }, [navigate]);

  // ── 공통 헤더 ──
  const Header = () => (
    <div style={{
      height: 56, flexShrink: 0, background: T.surface,
      display: 'flex', alignItems: 'center', padding: '0 14px',
      borderBottom: `1px solid ${T.line2}`,
    }}>
      <button style={iconBtn}>
        <IconGrid size={20}/>
      </button>
      <div style={{ flex: 1, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 2, color: T.ink }}>CRAFT</div>
        <div style={{ fontSize: 10, color: T.ink3, letterSpacing: 1 }}>think thing thank</div>
      </div>
      <button style={iconBtn}>
        <IconBell/>
      </button>
    </div>
  );

  // ── 검색바 + 새 디자인 버튼 + 빠른 액세스 ──
  const TopSection = () => (
    <div style={{ padding: '14px 14px 0' }}>
      {/* 검색 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        height: 44, borderRadius: 12,
        background: T.bg, border: `1px solid ${T.line}`,
        padding: '0 12px', marginBottom: 14,
      }}>
        <span style={{ color: T.ink3 }}><IconSearch/></span>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="디자인 검색"
          style={{
            flex: 1, height: '100%', border: 'none', outline: 'none',
            background: 'transparent', fontSize: 14, color: T.ink,
          }}
        />
      </div>

      {/* 새 디자인 버튼 */}
      <button onClick={handleNew} style={{
        width: '100%', height: 56, borderRadius: 14, border: 'none',
        background: T.primary, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontSize: 15, fontWeight: 700, cursor: 'pointer',
        boxShadow: '0 6px 20px rgba(124,92,255,0.28)',
      }}>
        <IconPlus/> 새 디자인 시작하기
      </button>

      {/* 빠른 액세스 */}
      <div style={{ marginTop: 16, fontSize: 12, color: T.ink3, fontWeight: 500 }}>빠른 액세스</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 8 }}>
        <QuickCard icon={<IconActivity/>} label="진행중 프로젝트" value={stats.active}/>
        <QuickCard icon={<IconCheck/>} label="완료된 프로젝트" value={stats.done}/>
        <QuickCard icon={<IconUpload/>} label="공유받은 파일" value={stats.shared}/>
      </div>
    </div>
  );

  // ── 파일 리스트 헤더 ──
  const ListHeader = () => (
    <div style={{
      padding: '20px 14px 12px',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
    }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>내 디자인 파일</div>
        <div style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>{filtered.length}개</div>
      </div>
      <div style={{
        display: 'flex', gap: 0, borderRadius: 8,
        border: `1px solid ${T.line}`, overflow: 'hidden',
      }}>
        <button onClick={() => setViewMode('grid')} style={{
          width: 38, height: 32, border: 'none', cursor: 'pointer',
          background: viewMode === 'grid' ? T.primarySoft : T.surface,
          color: viewMode === 'grid' ? T.primary : T.ink3,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><IconGrid size={16}/></button>
        <div style={{ width: 1, background: T.line }}/>
        <button onClick={() => setViewMode('list')} style={{
          width: 38, height: 32, border: 'none', cursor: 'pointer',
          background: viewMode === 'list' ? T.primarySoft : T.surface,
          color: viewMode === 'list' ? T.primary : T.ink3,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><IconList size={16}/></button>
      </div>
    </div>
  );

  // ── 디자인 카드(그리드) ──
  const DesignCard: React.FC<{ d: DesignFileSummary & { projectId: string; projectTitle: string } }> = ({ d }) => {
    const si = (d as any).spaceConfig || (d as any).spaceInfo || {};
    const w = si.width || '-';
    const h = si.height || '-';
    const dep = si.depth || '-';
    return (
      <div onClick={() => handleOpenDesign(d)} style={{
        background: T.surface, border: `1px solid ${T.line}`,
        borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* 썸네일 자리 (저장된 thumbnail 없을 시 placeholder) */}
        <div style={{
          aspectRatio: '1 / 1', background: T.bg,
          position: 'relative', borderBottom: `1px solid ${T.line2}`,
        }}>
          {(d as any).thumbnail ? (
            <img src={(d as any).thumbnail} alt={d.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          ) : (
            <PlaceholderThumb/>
          )}
        </div>
        <div style={{ padding: '10px 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {d.name || '제목 없음'}
          </div>
          <div style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>
            {w} × {h} × {dep}
          </div>
        </div>
      </div>
    );
  };

  const PlaceholderThumb = () => (
    <div style={{ width: '100%', height: '100%', display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(3, 1fr)', gap: 2, padding: 12 }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} style={{ background: '#EEF0F3', borderRadius: 2 }}/>
      ))}
    </div>
  );

  // ── 디자인 리스트 행 ──
  const DesignRow: React.FC<{ d: DesignFileSummary & { projectId: string; projectTitle: string } }> = ({ d }) => {
    const si = (d as any).spaceConfig || (d as any).spaceInfo || {};
    return (
      <div onClick={() => handleOpenDesign(d)} style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px', borderBottom: `1px solid ${T.line2}`,
        cursor: 'pointer',
      }}>
        <div style={{ width: 56, height: 56, borderRadius: 10, background: T.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <IconCube/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.ink,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {d.name || '제목 없음'}
          </div>
          <div style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>
            {d.projectTitle} · {si.width || '-'} × {si.height || '-'} × {si.depth || '-'}
          </div>
        </div>
      </div>
    );
  };

  // ── 메인 콘텐츠 영역 ──
  const MainArea = () => (
    <div style={{ flex: 1, overflow: 'auto', background: T.bg }}>
      {bottomTab === 'design' && (
        <>
          <TopSection/>
          <ListHeader/>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: T.ink3, fontSize: 13 }}>
              불러오는 중...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.ink3, fontSize: 13 }}>
              {query ? '검색 결과가 없습니다' : '아직 디자인 파일이 없습니다'}
            </div>
          ) : viewMode === 'grid' ? (
            <div style={{ padding: '0 14px 24px',
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {filtered.map(d => <DesignCard key={d.id} d={d}/>)}
            </div>
          ) : (
            <div style={{ paddingBottom: 24, background: T.surface }}>
              {filtered.map(d => <DesignRow key={d.id} d={d}/>)}
            </div>
          )}
        </>
      )}

      {bottomTab === 'shared' && (
        <div style={{ padding: 40, textAlign: 'center', color: T.ink3, fontSize: 13 }}>
          공유받은 파일이 없습니다
        </div>
      )}

      {bottomTab === 'my' && (
        <div style={{ padding: 20 }}>
          <div style={{
            background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12,
            padding: 16, display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%',
              background: T.primarySoft, color: T.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700 }}>
              {user?.displayName?.[0] || user?.email?.[0]?.toUpperCase() || '?'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>
                {user?.displayName || '사용자'}
              </div>
              <div style={{ fontSize: 12, color: T.ink3,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.email}
              </div>
            </div>
          </div>
          <button onClick={handleLogout} style={{
            marginTop: 16, width: '100%', height: 48, borderRadius: 12,
            border: `1px solid ${T.line}`, background: T.surface,
            color: '#EF4444', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>로그아웃</button>
        </div>
      )}
    </div>
  );

  // ── 하단 탭바 (세로용) / 좌측 세로 사이드바 (가로용) ──
  const Tabs: Array<{ k: BottomTab; label: string; icon: React.ReactNode }> = [
    { k: 'design', label: '디자인', icon: <IconCube/> },
    { k: 'shared', label: '공유',   icon: <IconShare/> },
    { k: 'my',     label: '내정보', icon: <IconUser/> },
  ];

  // ═══════════════ 가로 모드 레이아웃 ═══════════════
  if (isLandscape) {
    return (
      <div className="mobile-editor-root" style={{
        width: '100vw', height: '100vh', overflow: 'hidden',
        background: T.surface, color: T.ink, fontFamily: FONT,
        display: 'flex', flexDirection: 'row',
      }}>
        {/* 좌측 세로 사이드바 */}
        <div style={{
          width: 64, flexShrink: 0, background: T.surface,
          borderRight: `1px solid ${T.line}`,
          display: 'flex', flexDirection: 'column',
          paddingTop: 10,
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
        }}>
          {/* 로고 (축약) */}
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.ink }}/>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.ink }}/>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.ink }}/>
            </div>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, marginTop: 4 }}>CRAFT</div>
          </div>
          {Tabs.map(tab => {
            const isA = bottomTab === tab.k;
            return (
              <button key={tab.k}
                onClick={() => setBottomTab(tab.k)}
                style={{
                  height: 56, border: 'none', cursor: 'pointer',
                  background: isA ? T.primarySoft : 'transparent',
                  color: isA ? T.primary : T.ink3,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 3,
                  borderLeft: isA ? `3px solid ${T.primary}` : '3px solid transparent',
                }}
              >
                {tab.icon}
                <span style={{ fontSize: 10, fontWeight: isA ? 600 : 500 }}>{tab.label}</span>
              </button>
            );
          })}
          <div style={{ flex: 1 }}/>
          <button style={{ height: 48, border: 'none', background: 'transparent',
            color: T.ink3, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconBell/>
          </button>
        </div>

        {/* 메인 영역 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* 가로 모드 컴팩트 헤더 */}
          <div style={{
            height: 44, flexShrink: 0, background: T.surface,
            display: 'flex', alignItems: 'center', padding: '0 16px',
            borderBottom: `1px solid ${T.line2}`, gap: 12,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>
              {bottomTab === 'design' ? '내 디자인' :
               bottomTab === 'shared' ? '공유 파일' : '내 정보'}
            </div>
            <div style={{ flex: 1 }}/>
            {bottomTab === 'design' && (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  height: 30, borderRadius: 8,
                  background: T.bg, border: `1px solid ${T.line}`,
                  padding: '0 10px', width: 220,
                }}>
                  <span style={{ color: T.ink3, display: 'flex' }}><IconSearch/></span>
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="검색"
                    style={{
                      flex: 1, border: 'none', outline: 'none',
                      background: 'transparent', fontSize: 12, color: T.ink,
                    }}
                  />
                </div>
                <button onClick={handleNew} style={{
                  height: 30, borderRadius: 8, border: 'none',
                  background: T.primary, color: '#fff', padding: '0 12px',
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>
                  <IconPlus/> 새 디자인
                </button>
              </>
            )}
          </div>

          {/* 가로 모드에서는 빠른 액세스/탑섹션 생략하고 곧바로 리스트 */}
          <div style={{ flex: 1, overflow: 'auto', background: T.bg }}>
            {bottomTab === 'design' && (
              <>
                {/* 빠른 액세스 - 가로로 한줄 */}
                <div style={{ padding: '12px 16px 0',
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <QuickCard icon={<IconActivity/>} label="진행중" value={stats.active} compact/>
                  <QuickCard icon={<IconCheck/>} label="완료" value={stats.done} compact/>
                  <QuickCard icon={<IconUpload/>} label="공유" value={stats.shared} compact/>
                </div>

                <ListHeader/>
                {loading ? (
                  <div style={{ padding: 32, textAlign: 'center', color: T.ink3, fontSize: 13 }}>
                    불러오는 중...
                  </div>
                ) : filtered.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: T.ink3, fontSize: 13 }}>
                    {query ? '검색 결과가 없습니다' : '아직 디자인 파일이 없습니다'}
                  </div>
                ) : viewMode === 'grid' ? (
                  <div style={{ padding: '0 16px 24px',
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    {filtered.map(d => <DesignCard key={d.id} d={d}/>)}
                  </div>
                ) : (
                  <div style={{ paddingBottom: 24, background: T.surface }}>
                    {filtered.map(d => <DesignRow key={d.id} d={d}/>)}
                  </div>
                )}
              </>
            )}
            {bottomTab === 'shared' && (
              <div style={{ padding: 40, textAlign: 'center', color: T.ink3, fontSize: 13 }}>
                공유받은 파일이 없습니다
              </div>
            )}
            {bottomTab === 'my' && (
              <div style={{ padding: 20, maxWidth: 480 }}>
                <div style={{
                  background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12,
                  padding: 16, display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%',
                    background: T.primarySoft, color: T.primary,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 700 }}>
                    {user?.displayName?.[0] || user?.email?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>
                      {user?.displayName || '사용자'}
                    </div>
                    <div style={{ fontSize: 12, color: T.ink3,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {user?.email}
                    </div>
                  </div>
                </div>
                <button onClick={handleLogout} style={{
                  marginTop: 16, width: '100%', height: 48, borderRadius: 12,
                  border: `1px solid ${T.line}`, background: T.surface,
                  color: '#EF4444', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>로그아웃</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════ 세로 모드 레이아웃 ═══════════════
  return (
    <div className="mobile-editor-root" style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: T.bg, color: T.ink, fontFamily: FONT,
      display: 'flex', flexDirection: 'column',
    }}>
      <Header/>
      <MainArea/>

      {/* 하단 탭바 */}
      <div style={{
        height: 64, flexShrink: 0, background: T.surface,
        borderTop: `1px solid ${T.line}`,
        display: 'flex', alignItems: 'stretch',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}>
        {Tabs.map(tab => {
          const isA = bottomTab === tab.k;
          return (
            <button key={tab.k}
              onClick={() => setBottomTab(tab.k)}
              style={{
                flex: 1, border: 'none', cursor: 'pointer', background: 'transparent',
                color: isA ? T.primary : T.ink3,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 3,
              }}
            >
              {tab.icon}
              <span style={{ fontSize: 11, fontWeight: isA ? 600 : 500 }}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── 빠른 액세스 카드 ─────────────────────────────────────────
const QuickCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  compact?: boolean;
}> = ({ icon, label, value, compact }) => (
  <div style={{
    background: T.surface, border: `1px solid ${T.line}`,
    borderRadius: 14, padding: compact ? '10px 12px' : '14px 14px',
    display: 'flex', flexDirection: 'column', gap: compact ? 4 : 8,
  }}>
    <div style={{
      width: compact ? 32 : 38, height: compact ? 32 : 38, borderRadius: 10,
      background: T.primarySoft, color: T.primary,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{icon}</div>
    <div style={{ fontSize: compact ? 11 : 12, color: T.ink3 }}>{label}</div>
    <div style={{ fontSize: compact ? 18 : 22, fontWeight: 800, color: T.ink, lineHeight: 1 }}>
      {value}
    </div>
  </div>
);

// ─── 공통 스타일 ─────────────────────────────────────────────
const iconBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 10,
  border: `1px solid ${T.line}`, background: T.surface,
  color: T.ink2, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

export default MobileDashboard;

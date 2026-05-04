/**
 * SketchUp 전용 대시보드
 * - SketchUp HtmlDialog 안에서 표시되는 단순화된 대시보드
 * - 디자인 목록 → "가져오기" 클릭 시 에디터 거치지 않고 바로 SketchUp 임포트
 * - "편집" 버튼은 일반 에디터 열기
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { signOutUser } from '@/firebase/auth';
import { getUserProjects, getDesignFiles } from '@/firebase/projects';
import type { ProjectSummary, DesignFileSummary } from '@/firebase/types';
import { isSketchUpEnvironment, canImportDaeToSketchUp } from '@/editor/shared/utils/sketchupBridge';
import styles from './SketchUpDashboard.module.css';

interface DesignEntry extends DesignFileSummary {
  projectTitle: string;
}

const formatDate = (ts: any): string => {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
};

const SketchUpDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [, setProjects] = useState<ProjectSummary[]>([]);
  const [designs, setDesigns] = useState<DesignEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  const inSketchUp = useMemo(() => isSketchUpEnvironment(), []);

  // 비로그인 → 로그인 페이지로
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login?sketchup=1', { replace: true });
    }
  }, [authLoading, user, navigate]);

  // 프로젝트 + 디자인 파일 로드
  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const { projects: ps, error: pErr } = await getUserProjects();
      if (pErr) {
        setError(pErr);
        setLoading(false);
        return;
      }
      const validProjects = (ps || []).filter(p => !p.isDeleted);
      setProjects(validProjects);

      // 각 프로젝트의 디자인 파일 모두 가져와서 평탄화
      const allDesigns: DesignEntry[] = [];
      for (const p of validProjects) {
        const { designFiles } = await getDesignFiles(p.id);
        (designFiles || [])
          .filter(d => !d.isDeleted)
          .forEach(d => {
            allDesigns.push({ ...d, projectTitle: p.title });
          });
      }

      // 최신순 정렬
      allDesigns.sort((a, b) => {
        const ta = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
        const tb = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
        return tb - ta;
      });

      setDesigns(allDesigns);
    } catch (e: any) {
      console.error('[SketchUpDashboard] 로드 실패:', e);
      setError(e?.message || '디자인 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // SketchUp 임포트 결과 콜백 (루비가 호출)
  useEffect(() => {
    (window as any).__sketchupImportDone = (result: { success: boolean; error?: string }) => {
      setImportingId(null);
      if (!result?.success) {
        alert('SketchUp 임포트 실패' + (result?.error ? `\n${result.error}` : ''));
      }
    };
    return () => {
      delete (window as any).__sketchupImportDone;
    };
  }, []);

  // "가져오기" — 에디터를 거치지 않고 바로 SketchUp으로 보내기 위해 에디터를 헤드리스로 열어 export
  // (현재 단계: 에디터를 sketchup_autoexport 모드로 새 탭/같은 창으로 열어 자동 내보내기)
  // 가장 단순한 방법: configurator 페이지로 이동하면서 자동 export 트리거 쿼리 부여.
  const handleImport = (design: DesignEntry) => {
    if (!canImportDaeToSketchUp()) {
      alert('SketchUp 환경이 감지되지 않았습니다.\nSketchUp 플러그인 안에서 열어주세요.');
      return;
    }
    setImportingId(design.id);
    // 에디터로 진입하면서 자동 export 모드 트리거
    const params = new URLSearchParams({
      designFileId: design.id,
      projectId: design.projectId,
      sketchup: '1',
      autoexport: 'dae',
    });
    navigate(`/configurator?${params.toString()}`);
  };

  // "편집" — 일반 에디터 열기 (사용자가 수정하고 직접 export)
  const handleEdit = (design: DesignEntry) => {
    const params = new URLSearchParams({
      designFileId: design.id,
      projectId: design.projectId,
      sketchup: '1',
    });
    navigate(`/configurator?${params.toString()}`);
  };

  const handleLogout = async () => {
    await signOutUser();
    navigate('/login?sketchup=1', { replace: true });
  };

  if (authLoading) {
    return (
      <div className={styles.root}>
        <div className={styles.body}>
          <div className={styles.stateBox}>로딩 중…</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* 미니 헤더 */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.brand}>tttcraft</span>
          {inSketchUp && <span className={styles.modeBadge}>SketchUp</span>}
        </div>
        <div className={styles.headerRight}>
          <button className={styles.iconBtn} onClick={loadAll} title="새로고침">
            새로고침
          </button>
          <div className={styles.userChip}>
            {user?.photoURL ? (
              <img className={styles.avatar} src={user.photoURL} alt="" />
            ) : (
              <div className={styles.avatarFallback}>
                {(user?.displayName || user?.email || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
            <span>{user?.displayName || user?.email?.split('@')[0] || '사용자'}</span>
          </div>
          <button className={styles.iconBtn} onClick={handleLogout}>로그아웃</button>
        </div>
      </header>

      {/* 본문 */}
      <main className={styles.body}>
        <div className={styles.titleBar}>
          <div>
            <h1 className={styles.pageTitle}>내 디자인</h1>
            <div className={styles.pageSubtitle}>
              가져오기 버튼을 누르면 SketchUp 모델에 즉시 추가됩니다.
            </div>
          </div>
        </div>

        {loading ? (
          <div className={styles.stateBox}>디자인을 불러오는 중…</div>
        ) : error ? (
          <div className={styles.stateBox}>{error}</div>
        ) : designs.length === 0 ? (
          <div className={styles.stateBox}>
            아직 저장된 디자인이 없습니다. tttcraft 웹에서 먼저 디자인을 만들어 주세요.
          </div>
        ) : (
          <div className={styles.grid}>
            {designs.map(d => (
              <div key={d.id} className={styles.card}>
                <div className={styles.thumb}>
                  {d.thumbnail ? (
                    <img src={d.thumbnail} alt={d.name} />
                  ) : (
                    <span className={styles.thumbPlaceholder}>미리보기 없음</span>
                  )}
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{d.name}</h3>
                  <span className={styles.cardMeta}>
                    {d.projectTitle} · {formatDate(d.updatedAt)} · 가구 {d.furnitureCount}개
                  </span>
                </div>
                <div className={styles.cardActions}>
                  <button
                    className={styles.primaryBtn}
                    onClick={() => handleImport(d)}
                    disabled={!!importingId}
                  >
                    {importingId === d.id ? '가져오는 중…' : 'SketchUp으로 가져오기'}
                  </button>
                  <button className={styles.secondaryBtn} onClick={() => handleEdit(d)}>
                    편집
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.footerHint}>
          {inSketchUp ? (
            <>SketchUp 플러그인 안에서 실행 중입니다. 가져오기를 누르면 활성 모델에 가구가 즉시 추가됩니다.</>
          ) : (
            <>SketchUp 플러그인이 감지되지 않았습니다. 브라우저에서 미리보기 중입니다.</>
          )}
        </div>
      </main>

      {/* 임포트 진행 오버레이 */}
      {importingId && (
        <div className={styles.overlay}>
          <div className={styles.overlayCard}>
            <div className={styles.spinner} />
            <div className={styles.overlayText}>SketchUp으로 가져오는 중…</div>
            <div className={styles.overlaySubtext}>잠시만 기다려 주세요</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SketchUpDashboard;

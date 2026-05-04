/**
 * SketchUp 전용 대시보드
 * - SketchUp HtmlDialog 안에서 표시되는 단순화된 대시보드
 * - "SketchUp으로 가져오기" 클릭 시 에디터를 거치지 않고
 *   화면 밖 헤드리스 Three.js 씬을 렌더하여 DAE를 즉시 SketchUp에 임포트
 * - "편집" 버튼은 일반 에디터 열기
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { useAuth } from '@/auth/AuthProvider';
import { signOutUser } from '@/firebase/auth';
import {
  getUserProjects,
  getDesignFiles,
  getDesignFileById,
} from '@/firebase/projects';
import type { ProjectSummary, DesignFileSummary, DesignFile } from '@/firebase/types';
import {
  isSketchUpEnvironment,
  canImportDaeToSketchUp,
  canImportPanelsToSketchUp,
  sendDaeToSketchUp,
  sendPanelsToSketchUp,
} from '@/editor/shared/utils/sketchupBridge';
import { ColladaExporter } from '@/editor/shared/utils/ColladaExporter';
import { sceneToPanelJSON } from '@/editor/shared/utils/sceneToPanelJSON';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
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
  const [importingDesign, setImportingDesign] = useState<DesignFile | null>(null);
  const [importStatus, setImportStatus] = useState<string>('');

  // 헤드리스 Canvas의 Three.js Scene 참조 (export 시점에 가구 메시 추출)
  const headlessSceneRef = useRef<THREE.Scene | null>(null);

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

      const allDesigns: DesignEntry[] = [];
      for (const p of validProjects) {
        const { designFiles } = await getDesignFiles(p.id);
        (designFiles || [])
          .filter(d => !d.isDeleted)
          .forEach(d => {
            allDesigns.push({ ...d, projectTitle: p.title });
          });
      }

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
      setImportingDesign(null);
      setImportStatus('');
      if (!result?.success) {
        alert('SketchUp 임포트 실패' + (result?.error ? `\n${result.error}` : ''));
      }
    };
    return () => {
      delete (window as any).__sketchupImportDone;
    };
  }, []);

  // === 핵심: 헤드리스 export 흐름 ===
  // 1) 디자인 카드 클릭
  // 2) Firebase에서 DesignFile 전체 데이터 로드 (spaceConfig + placedModules)
  // 3) 화면 밖에 Space3DViewerReadOnly 마운트 → 렌더 완료 대기
  // 4) headlessSceneRef.current에서 Scene 추출 → ColladaExporter로 DAE 생성
  // 5) sendDaeToSketchUp으로 루비에 전송
  // 6) 헤드리스 컴포넌트 언마운트
  const handleImport = async (design: DesignEntry) => {
    if (!canImportDaeToSketchUp()) {
      alert('SketchUp 환경이 감지되지 않았습니다.\nSketchUp 플러그인 안에서 열어주세요.');
      return;
    }

    setImportingId(design.id);
    setImportStatus('디자인 정보 불러오는 중…');

    try {
      // 1) 전체 DesignFile 로드 (spaceConfig + placedModules 포함)
      const { designFile, error: dErr } = await getDesignFileById(design.id);
      if (dErr || !designFile) {
        throw new Error(dErr || '디자인 데이터를 불러오지 못했습니다.');
      }

      // 2) Room 컴포넌트가 store에서 직접 읽으므로 헤드리스 마운트 전에 store에 주입
      try {
        useSpaceConfigStore.getState().setSpaceInfo(designFile.spaceConfig);
        useFurnitureStore.getState().setPlacedModules(
          designFile.furniture?.placedModules || []
        );
        // 치수/텍스트/가이드 등 export 대상이 아닌 보조 표시 모두 끄기
        const ui = useUIStore.getState();
        ui.setShowDimensions(false);
        ui.setShowDimensionsText(false);
      } catch (storeErr) {
        console.warn('[SketchUpDashboard] store 주입 경고:', storeErr);
      }

      // 3) 헤드리스 Canvas에 마운트 → useEffect에서 렌더 완료 후 export 실행
      setImportStatus('3D 모델 구성 중…');
      headlessSceneRef.current = null;
      setImportingDesign(designFile);
      // 이후 흐름은 useEffect[importingDesign] 에서 처리
    } catch (e: any) {
      console.error('[SketchUpDashboard] 임포트 실패:', e);
      alert(`가져오기 실패: ${e?.message || e}`);
      setImportingId(null);
      setImportingDesign(null);
      setImportStatus('');
    }
  };

  // 헤드리스 Scene이 마운트되면 한 번만 export 실행
  useEffect(() => {
    if (!importingDesign) return;

    let cancelled = false;
    let attempts = 0;
    let firstMeshSeenAt: number | null = null;
    const MAX_ATTEMPTS = 150; // 약 15초 (100ms × 150)
    const STABILIZE_MS = 1500; // 첫 메시 발견 후 추가 대기 (전체 가구 마운트 보장)

    const countMeshes = (scene: THREE.Scene): number => {
      let n = 0;
      scene.traverse((o) => {
        if ((o as any).isMesh) n++;
      });
      return n;
    };

    const tryExport = async () => {
      if (cancelled) return;
      attempts++;

      const scene = headlessSceneRef.current;
      const meshCount = scene ? countMeshes(scene) : 0;

      // 가구 메시가 한 개라도 들어올 때까지 대기
      if (!scene || meshCount === 0) {
        if (attempts < MAX_ATTEMPTS) {
          setTimeout(tryExport, 100);
        } else {
          alert(`3D 모델 렌더링 시간 초과 (mesh=${meshCount}). 다시 시도해 주세요.`);
          setImportingId(null);
          setImportingDesign(null);
          setImportStatus('');
        }
        return;
      }

      // 첫 메시 등장 시점 기록 후, STABILIZE_MS 만큼 추가 대기 (가구 전체 마운트)
      const now = Date.now();
      if (firstMeshSeenAt === null) {
        firstMeshSeenAt = now;
      }
      if (now - firstMeshSeenAt < STABILIZE_MS) {
        setTimeout(tryExport, 100);
        return;
      }

      try {
        // 가구만 추출하기 위해 FurnitureContainer를 찾는다.
        // 없으면 전체 Scene에서 라이트/카메라 등을 제외하고 export.
        const exportTarget = findFurnitureGroup(scene) || cleanupScene(scene);

        if (exportTarget.children.length === 0) {
          throw new Error('내보낼 가구가 없습니다.');
        }

        // 1순위: 루비가 패널 JSON을 직접 받아 Sketchup::Group/Layer 생성 가능한 경우
        //         → 패널별 그룹/태그 100% 보장
        if (canImportPanelsToSketchUp()) {
          setImportStatus('패널 정보 직렬화 중…');
          const payload = sceneToPanelJSON(exportTarget, importingDesign.name);

          if (payload.groups.length === 0 && payload.unnamed.length === 0) {
            throw new Error('내보낼 메시가 없습니다.');
          }

          const jsonString = JSON.stringify(payload);
          setImportStatus('SketchUp으로 전송 중…');
          const sent = sendPanelsToSketchUp(jsonString);
          if (!sent) {
            throw new Error('SketchUp으로 전송하지 못했습니다.');
          }
          setImportStatus('SketchUp이 모델을 가져오는 중…');
          return;
        }

        // 2순위 폴백: 구버전 루비 플러그인은 DAE만 지원
        setImportStatus('DAE 파일 생성 중…');
        const exporter = new ColladaExporter();
        const xml = exporter.parse(exportTarget);
        if (!xml || xml.length === 0) {
          throw new Error('DAE 변환 실패');
        }

        const blob = new Blob([xml], { type: 'model/vnd.collada+xml' });
        const filename = `${(importingDesign.name || 'tttcraft').replace(/[^A-Za-z0-9_\-가-힣]/g, '_')}.dae`;

        setImportStatus('SketchUp으로 전송 중…');
        const sent = await sendDaeToSketchUp(blob, filename);
        if (!sent) {
          throw new Error('SketchUp으로 전송하지 못했습니다.');
        }

        // 결과는 __sketchupImportDone 콜백에서 처리됨
        setImportStatus('SketchUp이 모델을 가져오는 중…');
      } catch (err: any) {
        console.error('[SketchUpDashboard] export 실패:', err);
        alert(`가져오기 실패: ${err?.message || err}`);
        setImportingId(null);
        setImportingDesign(null);
        setImportStatus('');
      }
    };

    // 첫 시도는 800ms 후 - Scene이 자식 메시를 만들 시간 확보
    const initialDelay = setTimeout(tryExport, 800);

    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
    };
  }, [importingDesign]);

  // "편집" — 일반 에디터 열기
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
            <div className={styles.overlaySubtext}>{importStatus || '잠시만 기다려 주세요'}</div>
          </div>
        </div>
      )}

      {/* === 헤드리스 3D 뷰어 === */}
      {/* 사용자에게 보이지 않는 영역에 가구만 렌더해서 Scene을 추출한다. */}
      {/* visibility:hidden + position:absolute 로 화면 밖에 배치. */}
      {/* (display:none이면 Three.js Canvas가 렌더되지 않으므로 visibility 사용) */}
      {importingDesign && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: -10000,
            top: 0,
            width: 800,
            height: 600,
            visibility: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <HeadlessExportViewer
            designFile={importingDesign}
            onSceneReady={(scene) => {
              headlessSceneRef.current = scene;
            }}
          />
        </div>
      )}
    </div>
  );
};

// === 헤드리스 뷰어 (sceneRef 노출 전용) ===

interface HeadlessExportViewerProps {
  designFile: DesignFile;
  onSceneReady: (scene: THREE.Scene) => void;
}

const HeadlessExportViewer: React.FC<HeadlessExportViewerProps> = ({
  designFile,
  onSceneReady,
}) => {
  // 에디터의 검증된 Space3DView를 그대로 헤드리스로 마운트.
  // store에 spaceInfo / placedModules가 이미 주입되어 있어야 가구가 그려진다.
  // sceneRef로 Three.js Scene을 직접 받음.
  const sceneRef = useRef<THREE.Scene | null>(null);

  useEffect(() => {
    // sceneRef가 채워질 때까지 기다리다가 한번 콜백 호출
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (sceneRef.current) {
        onSceneReady(sceneRef.current);
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [designFile.id, onSceneReady]);

  return (
    <Space3DView
      spaceInfo={designFile.spaceConfig}
      svgSize={{ width: 800, height: 600 }}
      viewMode="3D"
      renderMode="solid"
      showAll={false}
      showFrame={true}
      showDimensions={false}
      readOnly={true}
      sceneRef={sceneRef}
    />
  );
};

// === Scene 정리 헬퍼 ===

/** Scene 트리에서 FurnitureContainer 그룹을 찾는다 (있으면 해당 그룹만 export) */
function findFurnitureGroup(scene: THREE.Scene): THREE.Group | null {
  let found: THREE.Group | null = null;
  scene.traverse((obj) => {
    if (found) return;
    if (obj.name === 'FurnitureContainer' && (obj as THREE.Group).isGroup) {
      found = obj as THREE.Group;
    }
  });
  return found;
}

/** FurnitureContainer를 못 찾으면 라이트/카메라 등을 제외하고 export할 그룹을 만든다. */
function cleanupScene(scene: THREE.Scene): THREE.Group {
  const exportGroup = new THREE.Group();
  exportGroup.name = 'tttcraft_export';

  scene.children.forEach((child) => {
    if (
      (child as any).isLight ||
      (child as any).isCamera ||
      child.type.includes('Helper')
    ) {
      return;
    }
    // 클론하지 않고 참조만 추가 (export 후 곧장 언마운트되므로 안전)
    exportGroup.add(child.clone(true));
  });

  return exportGroup;
}

export default SketchUpDashboard;

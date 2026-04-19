import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styles from './IslandEditor.module.css';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useProjectStore } from '@/store/core/projectStore';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import IslandSetupModal, { IslandSetupValues } from '@/components/common/IslandSetupModal';
import ModuleGallery from '@/editor/shared/controls/furniture/ModuleGallery';
import MaterialPanel from '@/editor/shared/controls/styling/MaterialPanel';

type SidePanel = 'module' | 'material';
type IslandSub = 'basic' | 'door-raise' | 'top-down';

/**
 * 아일랜드 전용 에디터
 * - 기존 Configurator와 분리된 별도 라우트 (/island-editor)
 * - 상/하 분할 뷰어 (상=앞면, 하=반대편)
 * - 사이드바: 사이즈 편집 / 모듈(기본장·도어올림·상판내림) / 재질
 */
const IslandEditor: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId');
  const designFileId = searchParams.get('designFileId');

  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const { setPlacedModules } = useFurnitureStore();
  const { setBasicInfo } = useProjectStore();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sidePanel, setSidePanel] = useState<SidePanel>('module');
  const [islandSub, setIslandSub] = useState<IslandSub>('basic');
  const [designName, setDesignName] = useState<string>('');
  const [sizeEditOpen, setSizeEditOpen] = useState(false);

  // 초기 로드: designFileId가 있으면 해당 디자인을 로드
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!designFileId) {
        // 디자인 ID 없음 — 대시보드로 리다이렉트
        setLoading(false);
        setLoadError('아일랜드 디자인 ID가 없습니다.');
        return;
      }
      try {
        const { getDesignFileById } = await import('@/firebase/projects');
        const { designFile, error } = await getDesignFileById(designFileId);
        if (cancelled) return;
        if (error || !designFile) {
          setLoadError(error || '아일랜드 디자인을 불러오지 못했습니다.');
          setLoading(false);
          return;
        }

        // 아일랜드가 아닌 디자인이면 일반 Configurator로 리다이렉트
        if (!designFile.spaceConfig?.isIsland) {
          navigate(`/configurator?projectId=${projectId || ''}&designFileId=${designFileId}`, { replace: true });
          return;
        }

        setDesignName(designFile.name || '아일랜드');
        setBasicInfo({ title: designFile.name || '아일랜드' } as any);
        setSpaceInfo(designFile.spaceConfig as any);
        setPlacedModules(designFile.furniture?.placedModules || []);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('IslandEditor 로드 오류:', err);
        setLoadError('아일랜드 디자인 로드 중 오류가 발생했습니다.');
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [designFileId, projectId, navigate, setSpaceInfo, setPlacedModules, setBasicInfo]);

  // ModuleGallery에 전달할 kitchenSubCategory 매핑 (island sub → kitchen sub 재사용)
  const kitchenSubCategory = useMemo(() => {
    if (islandSub === 'door-raise') return 'door-raise' as const;
    if (islandSub === 'top-down') return 'top-down' as const;
    return 'basic' as const;
  }, [islandSub]);

  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.loadingWrap}>
          <LoadingSpinner message="아일랜드 디자인 로딩 중..." />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.root}>
        <div className={styles.loadingWrap}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: 12 }}>{loadError}</p>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                padding: '8px 20px',
                border: '1px solid var(--theme-border)',
                borderRadius: 6,
                background: 'var(--theme-surface)',
                cursor: 'pointer',
              }}
            >
              대시보드로
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        {/* 왼쪽 사이드바 */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarTitle}>{designName || '아일랜드'}</div>
            <button
              className={styles.sizeEditBtn}
              onClick={() => setSizeEditOpen(true)}
              title="아일랜드 사이즈 편집"
            >
              사이즈 편집
            </button>
          </div>
          <div className={styles.sizeInfo}>
            <span className={styles.sizeInfoItem}>
              <span className={styles.sizeInfoLabel}>W</span>
              <span className={styles.sizeInfoValue}>{spaceInfo.width}mm</span>
            </span>
            <span className={styles.sizeInfoItem}>
              <span className={styles.sizeInfoLabel}>D</span>
              <span className={styles.sizeInfoValue}>{spaceInfo.depth}mm</span>
            </span>
            <span className={styles.sizeInfoItem}>
              <span className={styles.sizeInfoLabel}>H</span>
              <span className={styles.sizeInfoValue}>{spaceInfo.height}mm</span>
            </span>
          </div>

          <div className={styles.sidebarTabs}>
            <button
              className={`${styles.sidebarTab} ${sidePanel === 'module' ? styles.active : ''}`}
              onClick={() => setSidePanel('module')}
            >
              모듈
            </button>
            <button
              className={`${styles.sidebarTab} ${sidePanel === 'material' ? styles.active : ''}`}
              onClick={() => setSidePanel('material')}
            >
              재질
            </button>
          </div>

          <div className={styles.sidebarContent}>
            {sidePanel === 'module' && (
              <>
                <div className={styles.subCategoryTabs}>
                  <button
                    className={`${styles.subCategoryTab} ${islandSub === 'basic' ? styles.active : ''}`}
                    onClick={() => setIslandSub('basic')}
                  >
                    기본장
                  </button>
                  <button
                    className={`${styles.subCategoryTab} ${islandSub === 'door-raise' ? styles.active : ''}`}
                    onClick={() => setIslandSub('door-raise')}
                  >
                    도어올림
                  </button>
                  <button
                    className={`${styles.subCategoryTab} ${islandSub === 'top-down' ? styles.active : ''}`}
                    onClick={() => setIslandSub('top-down')}
                  >
                    상판내림
                  </button>
                </div>
                <ModuleGallery
                  moduleCategory="kitchen"
                  kitchenSubCategory={kitchenSubCategory}
                  hideTabMenu
                />
              </>
            )}
            {sidePanel === 'material' && <MaterialPanel />}
          </div>
        </aside>

        {/* 뷰어 영역 — 상/하 분할 */}
        <div className={styles.viewerArea}>
          <div className={styles.viewerHalf}>
            <div className={styles.viewerLabel}>앞면</div>
            <Space3DView
              spaceInfo={spaceInfo}
              viewMode="3D"
              renderMode="solid"
              showAll
              showFrame
              svgSize={{ width: 800, height: 600 }}
              islandViewSide="front"
            />
          </div>
          <div className={styles.viewerHalf}>
            <div className={styles.viewerLabel}>반대편</div>
            <Space3DView
              spaceInfo={spaceInfo}
              viewMode="3D"
              renderMode="solid"
              showAll
              showFrame
              svgSize={{ width: 800, height: 600 }}
              islandViewSide="back"
            />
          </div>
        </div>
      </div>

      {/* 사이즈 편집 팝업 */}
      <IslandSetupModal
        isOpen={sizeEditOpen}
        mode="edit"
        initialValues={{
          name: designName,
          width: spaceInfo.width,
          depth: spaceInfo.depth,
          height: spaceInfo.height,
        }}
        onCancel={() => setSizeEditOpen(false)}
        onConfirm={(values: IslandSetupValues) => {
          setSizeEditOpen(false);
          setSpaceInfo({
            width: values.width,
            depth: values.depth,
            height: values.height,
          });
        }}
      />
    </div>
  );
};

export default IslandEditor;

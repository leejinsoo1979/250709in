import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XIcon, MaximizeIcon, MinimizeIcon } from './Icons';
import { getProjectById, getDesignFileById } from '../../firebase/projects';
import { ProjectSummary } from '../../firebase/types';
import Space3DViewerReadOnly from '../../editor/shared/viewer3d/Space3DViewerReadOnly';
import { ShareLinkModal } from '../ShareLinkModal';
import styles from './ProjectViewerModal.module.css';

interface ProjectViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  designFileId?: string;
  initialViewMode?: '2D' | '3D';
}

const ProjectViewerModal: React.FC<ProjectViewerModalProps> = ({ isOpen, onClose, projectId, designFileId, initialViewMode = '3D' }) => {
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 섬네일과 동일한 뷰로 초기화: 3D 정면 뷰 + perspective 카메라
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('3D');
  const [cameraMode, setCameraMode] = useState<'perspective' | 'orthographic'>('perspective');
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    if (isOpen && projectId) {
      loadProject();
    }
  }, [isOpen, projectId, designFileId]);

  const loadProject = async () => {
    console.log('🔥 ProjectViewerModal - loadProject 시작:', { projectId, designFileId });
    setLoading(true);
    setError(null);

    try {
      // 항상 프로젝트를 로드 (공유 링크와 동일한 가구 데이터를 표시하기 위해)
      // designFileId는 무시하고 프로젝트의 최신 가구 데이터를 사용
      console.log('🔥 프로젝트 로드 시도:', projectId);
      const result = await getProjectById(projectId);

      if (result.project) {
        // Firebase 프로젝트 데이터를 뷰어용으로 변환
        const projectSummary: ProjectSummary = {
          id: result.project.id,
          title: result.project.title,
          createdAt: result.project.createdAt,
          updatedAt: result.project.updatedAt,
          furnitureCount: result.project.stats?.furnitureCount || 0,
          spaceSize: {
            width: result.project.spaceConfig?.width || 3600,
            height: result.project.spaceConfig?.height || 2400,
            depth: result.project.spaceConfig?.depth || 1500,
          },
          thumbnail: result.project.thumbnail,
          folderId: result.project.folderId,
          // 뷰어를 위한 추가 데이터 - 전체 프로젝트 데이터 사용
          spaceInfo: result.project.spaceConfig || {
            width: 3600,
            height: 2400,
            depth: 1500,
            installType: 'builtin',  // installationType이 아닌 installType
            surroundType: 'surround',
            baseConfig: {
              type: 'floor',
              height: 65,
              placementType: 'ground',
            },
            hasFloorFinish: false,
            floorFinish: null,
            wallConfig: {
              left: true,
              right: true,
              top: true,
            },
            materialConfig: {
              interiorColor: '#FFFFFF',
              doorColor: '#E0E0E0', // Changed from #FFFFFF to light gray
            },
            columns: [],
            frameSize: { upper: 50, left: 50, right: 50 },
            gapConfig: { left: 2, right: 2 },
          },
          placedModules: result.project.furniture?.placedModules || []
        };
        console.log('🔥 프로젝트 뷰어 데이터 로드 (공유 링크와 동일):', {
          title: projectSummary.title,
          placedModulesCount: projectSummary.placedModules?.length || 0,
          placedModulesData: projectSummary.placedModules,
          spaceInfo: !!projectSummary.spaceInfo,
          fullProjectData: result.project
        });
        setProject(projectSummary);
      } else {
        setError(result.error || '프로젝트를 찾을 수 없습니다.');
      }
    } catch (err) {
      console.error('프로젝트 로드 실패:', err);
      setError('프로젝트를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setIsFullscreen(false);
    onClose();
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        className={`${styles.modalOverlay} ${isFullscreen ? styles.fullscreen : ''}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
      >
        <motion.div 
          className={`${styles.modalContent} ${isFullscreen ? styles.fullscreenContent : ''}`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 모달 헤더 */}
          <div className={styles.modalHeader}>
            <div className={styles.headerLeft}>
              <h2 className={styles.modalTitle}>
                {loading ? '프로젝트 로딩 중...' : (project ? project.title : '프로젝트를 찾을 수 없음')}
              </h2>
            </div>

            {/* 2D/3D 및 Perspective/Orthographic 토글 버튼 - 중앙 정렬 */}
            {project && !loading && !error && (
              <div className={styles.headerCenter}>
                <div className={styles.viewModeToggle}>
                  <button
                    className={`${styles.viewModeButton} ${viewMode === '2D' ? styles.active : ''}`}
                    onClick={() => setViewMode('2D')}
                  >
                    2D
                  </button>
                  <button
                    className={`${styles.viewModeButton} ${viewMode === '3D' ? styles.active : ''}`}
                    onClick={() => setViewMode('3D')}
                  >
                    3D
                  </button>
                </div>
                {/* Perspective/Orthographic 토글 버튼 (3D 모드일 때만) */}
                {viewMode === '3D' && (
                  <div className={styles.viewModeToggle}>
                    <button
                      className={`${styles.viewModeButton} ${cameraMode === 'perspective' ? styles.active : ''}`}
                      onClick={() => setCameraMode('perspective')}
                      title="원근 투영"
                    >
                      Perspective
                    </button>
                    <button
                      className={`${styles.viewModeButton} ${cameraMode === 'orthographic' ? styles.active : ''}`}
                      onClick={() => setCameraMode('orthographic')}
                      title="정투영"
                    >
                      Orthographic
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className={styles.headerActions}>
              <button
                className={styles.actionButton}
                onClick={toggleFullscreen}
                title={isFullscreen ? '창 모드' : '전체화면'}
              >
                {isFullscreen ? <MinimizeIcon size={20} /> : <MaximizeIcon size={20} />}
              </button>
              <button
                className={styles.closeButton}
                onClick={handleClose}
                title="닫기"
              >
                <XIcon size={20} />
              </button>
            </div>
          </div>

          {/* 모달 콘텐츠 */}
          <div className={styles.modalBody}>
            {loading && (
              <div className={styles.loadingState}>
                <div className={styles.spinner} />
                <p>프로젝트를 불러오는 중...</p>
              </div>
            )}

            {error && (
              <div className={styles.errorState}>
                <p className={styles.errorMessage}>{error}</p>
                <button onClick={loadProject} className={styles.retryButton}>
                  다시 시도
                </button>
              </div>
            )}

            {project && !loading && !error && (
              <div className={styles.viewerContainer}>
                {console.log('🎨 읽기 전용 뷰어 렌더링:', {
                  projectId,
                  viewMode,
                  hasProject: !!project,
                  hasSpaceInfo: !!project.spaceInfo,
                  spaceInfo: project.spaceInfo,
                  placedModulesCount: project.placedModules?.length || 0
                })}
                <Space3DViewerReadOnly
                  key={`${projectId}-${viewMode}-${cameraMode}`}
                  spaceConfig={project.spaceInfo}
                  placedModules={project.placedModules || []}
                  viewMode={viewMode}
                  renderMode="solid"
                  cameraMode={cameraMode}
                />
              </div>
            )}
          </div>

          {/* 모달 푸터 */}
          {project && !loading && !error && (
            <div className={styles.modalFooter}>
              <div className={styles.projectMeta}>
                <span>마지막 수정: {
                  (() => {
                    if (project.updatedAt) {
                      try {
                        // Firebase Timestamp 처리
                        const date = project.updatedAt.seconds ? 
                          new Date(project.updatedAt.seconds * 1000) : 
                          new Date(project.updatedAt);
                        
                        const now = new Date();
                        const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
                        
                        if (diffInHours < 1) {
                          return '방금 전';
                        } else if (diffInHours < 24) {
                          return `${diffInHours}시간 전`;
                        } else if (diffInHours < 24 * 7) {
                          const days = Math.floor(diffInHours / 24);
                          return `${days}일 전`;
                        } else {
                          return date.toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          });
                        }
                      } catch (error) {
                        console.error('날짜 변환 오류:', error);
                        return '알 수 없음';
                      }
                    }
                    
                    // createdAt이 있다면 그것을 사용
                    if (project.createdAt) {
                      try {
                        const date = project.createdAt.seconds ? 
                          new Date(project.createdAt.seconds * 1000) : 
                          new Date(project.createdAt);
                        return date.toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        });
                      } catch (error) {
                        console.error('생성일 변환 오류:', error);
                      }
                    }
                    
                    return '알 수 없음';
                  })()
                }</span>
              </div>
              <button
                className={styles.shareButton}
                onClick={() => setShowShareModal(true)}
              >
                공유하기
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* 공유 링크 모달 */}
      {showShareModal && project && (
        <ShareLinkModal
          projectId={projectId}
          projectName={project.title}
          designFileId={designFileId}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </AnimatePresence>
  );
};

export default ProjectViewerModal;
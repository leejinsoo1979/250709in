import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XIcon, MaximizeIcon, MinimizeIcon } from './Icons';
import { getProjectById, getDesignFileById } from '../../firebase/projects';
import { ProjectSummary } from '../../firebase/types';
import { createShareLink } from '../../firebase/shareLinks';
import { useAuth } from '../../auth/AuthProvider';
import { Md3dRotation } from 'react-icons/md';
import styles from './ProjectViewerModal.module.css';

interface ProjectViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  designFileId?: string;
}

const ProjectViewerModal: React.FC<ProjectViewerModalProps> = ({ isOpen, onClose, projectId, designFileId }) => {
  const { user } = useAuth();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [isViewerLoaded, setIsViewerLoaded] = useState(false);
  const [isIframeLoading, setIsIframeLoading] = useState(false);

  // 모달 열림/닫힘 처리 (상태 초기화만, 로드는 하지 않음)
  useEffect(() => {
    if (!isOpen) {
      console.log('🧹 모달 닫힘 - 상태 초기화');
      // 모달이 닫힐 때만 초기화
      setProject(null);
      setError(null);
      setIsViewerLoaded(false);
      setIsIframeLoading(false);
    }
  }, [isOpen]);

  // 프로젝트 데이터 로드 (projectId, designFileId 변경 시에만)
  useEffect(() => {
    console.log('🔍 ProjectViewerModal 데이터 로드:', { projectId, designFileId });

    if (projectId) {
      console.log('🔄 프로젝트 로드 시작:', { projectId, designFileId });
      loadProject();
    }
  }, [projectId, designFileId]);

  const loadProject = async () => {
    console.log('🔥 ProjectViewerModal - loadProject 시작:', { projectId, designFileId });
    setLoading(true);
    setError(null);

    try {
      // 디자인 파일 ID가 있으면 디자인 파일 로드, 없으면 프로젝트 로드
      if (designFileId) {
        console.log('🔥 디자인 파일 로드 시도:', designFileId);
        const designResult = await getDesignFileById(designFileId);
        console.log('🔥 디자인 파일 로드 결과:', designResult);

        if (designResult.designFile) {
          const projectSummary: ProjectSummary = {
            id: designResult.designFile.projectId,
            title: designResult.designFile.name,
            createdAt: designResult.designFile.createdAt,
            updatedAt: designResult.designFile.updatedAt,
            furnitureCount: designResult.designFile.furniture?.placedModules?.length || 0,
            spaceSize: {
              width: designResult.designFile.spaceConfig?.width || 3600,
              height: designResult.designFile.spaceConfig?.height || 2400,
              depth: designResult.designFile.spaceConfig?.depth || 1500,
            },
            thumbnail: designResult.designFile.thumbnail,
            folderId: '',
            spaceInfo: designResult.designFile.spaceConfig,
            placedModules: designResult.designFile.furniture?.placedModules || []
          };

          console.log('🔥 디자인 파일 로드 성공:', {
            designFileId,
            name: designResult.designFile.name,
            placedModulesCount: projectSummary.placedModules?.length || 0,
            placedModules: projectSummary.placedModules,
            spaceConfig: projectSummary.spaceInfo
          });

          setProject(projectSummary);
        } else {
          setError(designResult.error || '디자인 파일을 찾을 수 없습니다.');
        }
      } else {
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
          console.log('🔥 프로젝트 뷰어 데이터 로드:', {
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
    setIsViewerLoaded(false);
    setIsIframeLoading(false);
    onClose();
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handle3DViewer = () => {
    setIsIframeLoading(true);
    setIsViewerLoaded(true);
  };

  const handleShare = async () => {
    if (!user || !project) {
      alert('로그인이 필요합니다.');
      return;
    }

    setIsGeneratingLink(true);
    try {
      console.log('🔗 조회 권한 공유 링크 생성 중:', { projectId, designFileId, projectName: project.title });

      const link = await createShareLink(
        projectId,
        project.title,
        user.uid,
        user.displayName || user.email || '사용자',
        'viewer', // 조회 권한
        7, // 7일 만료
        undefined, // 비밀번호 없음
        undefined, // 사용 횟수 제한 없음
        designFileId || undefined, // 디자인 파일 ID
        undefined // 디자인 파일명
      );

      const shareUrl = `${window.location.origin}/share/${link.token}`;

      // 클립보드에 복사
      await navigator.clipboard.writeText(shareUrl);
      alert(`조회 권한 공유 링크가 클립보드에 복사되었습니다!\n\n${shareUrl}\n\n※ 7일간 유효하며, 조회만 가능합니다.`);

      console.log('✅ 공유 링크 생성 완료:', link.token);
    } catch (error: any) {
      console.error('❌ 공유 링크 생성 실패:', error);
      alert('공유 링크 생성에 실패했습니다: ' + (error.message || '알 수 없는 오류'));
    } finally {
      setIsGeneratingLink(false);
    }
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

            <div className={styles.headerCenter}>
              {/* Configurator iframe이 뷰 모드 컨트롤을 처리 */}
            </div>

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
              <div className={styles.viewerContainer} style={{ position: 'relative' }}>
                {!isViewerLoaded ? (
                  // 썸네일 이미지와 3D 버튼
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '100%',
                      backgroundColor: '#f5f5f5'
                    }}
                  >
                    {/* 썸네일 이미지 */}
                    {project.thumbnail && (
                      <img
                        src={project.thumbnail}
                        alt={project.title}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain'
                        }}
                      />
                    )}

                    {/* 중앙 3D 버튼 */}
                    <button
                      onClick={handle3DViewer}
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        border: '3px solid white',
                        color: 'white',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                        e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
                        e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)';
                      }}
                    >
                      <Md3dRotation size={40} />
                    </button>
                  </div>
                ) : (
                  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    {/* 로딩 상태 */}
                    {isIframeLoading && (
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#f5f5f5',
                        zIndex: 10
                      }}>
                        <div className={styles.spinner} />
                        <p style={{ marginTop: '16px', color: '#666', fontSize: '14px' }}>3D 뷰어 로딩 중...</p>
                      </div>
                    )}

                    {/* Configurator iframe - projectId와 designFileId만으로 구분 */}
                    <iframe
                      key={`${projectId}-${designFileId || 'default'}`}
                      src={`/configurator?projectId=${projectId}${designFileId ? `&designFileId=${designFileId}` : ''}&mode=readonly&panelClosed=true`}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        backgroundColor: '#f5f5f5',
                        opacity: isIframeLoading ? 0 : 1,
                        transition: 'opacity 0.3s ease'
                      }}
                      title="Project Preview"
                      onLoad={() => {
                        console.log('🎬 iframe onLoad 이벤트:', { projectId, designFileId });
                        setIsIframeLoading(false);
                      }}
                      onError={(e) => {
                        console.error('❌ iframe 로드 에러:', e);
                        setIsIframeLoading(false);
                        setError('미리보기를 불러올 수 없습니다.');
                      }}
                    />
                  </div>
                )}
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
                onClick={handleShare}
                disabled={isGeneratingLink}
              >
                {isGeneratingLink ? '링크 생성 중...' : '공유하기'}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ProjectViewerModal;
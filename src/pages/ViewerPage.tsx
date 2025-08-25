import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getProjectByIdPublic, getDesignFileByIdPublic } from '@/firebase/projects';
import { ProjectSummary } from '@/firebase/types';
import Space3DViewerReadOnly from '@/editor/shared/viewer3d/Space3DViewerReadOnly';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { XIcon, MaximizeIcon, MinimizeIcon } from '@/components/common/Icons';
import styles from './ViewerPage.module.css';

const ViewerPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('3D');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (projectId) {
      loadProject();
    }
  }, [projectId]);

  const loadProject = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // 먼저 디자인 파일로 시도 (design_ 접두사가 없어도)
      const designResult = await getDesignFileByIdPublic(projectId);
      
      if (designResult.designFile) {
        // 디자인 파일로 성공
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
        
        
        setProject(projectSummary);
      } else {
        // 디자인 파일이 아니면 프로젝트로 시도
        const result = await getProjectByIdPublic(projectId);
        
        if (result.project) {
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
            spaceInfo: result.project.spaceConfig || {
              width: 3600,
              height: 2400,
              depth: 1500,
              installType: 'builtin',
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
              materialConfig: result.project.spaceConfig?.materialConfig || {
                interiorColor: '#FFFFFF',
                doorColor: '#E0E0E0',
                interiorTexture: result.project.spaceConfig?.materialConfig?.interiorTexture || null,
                doorTexture: result.project.spaceConfig?.materialConfig?.doorTexture || null
              },
              columns: [],
              frameSize: { upper: 50, left: 50, right: 50 },
              gapConfig: { left: 2, right: 2 },
            },
            placedModules: result.project.furniture?.placedModules || []
          };
          setProject(projectSummary);
        } else {
          setError(result.error || '프로젝트를 찾을 수 없습니다.');
        }
      }
    } catch (err: any) {
      console.error('프로젝트 로드 실패:', err);
      setError(`프로젝트를 불러오는 중 오류가 발생했습니다: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  if (loading) {
    return <LoadingSpinner fullscreen message="프로젝트를 불러오는 중..." />;
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <p className={styles.errorMessage}>{error}</p>
        <button onClick={loadProject} className={styles.retryButton}>
          다시 시도
        </button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className={styles.errorState}>
        <p className={styles.errorMessage}>프로젝트를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className={styles.viewerPage}>
      {/* 헤더 */}
      <div className={styles.viewerHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.projectTitle}>{project.title}</h1>
          <span className={styles.projectInfo}>{viewMode} 미리보기</span>
        </div>
        
        {/* 2D/3D 토글 */}
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
            className={styles.shareButton}
            onClick={() => {
              const shareUrl = window.location.href;
              navigator.clipboard.writeText(shareUrl).then(() => {
                alert(`공유 링크가 클립보드에 복사되었습니다!\n${shareUrl}`);
              }).catch(() => {
                prompt('공유 링크를 복사하세요:', shareUrl);
              });
            }}
          >
            공유하기
          </button>
        </div>
      </div>

      {/* 뷰어 콘텐츠 */}
      <div className={styles.viewerContent}>
        <Space3DViewerReadOnly
          key={`${projectId}-${viewMode}`}
          spaceConfig={project.spaceInfo}
          placedModules={project.placedModules || []}
          viewMode={viewMode}
          renderMode="solid"
        />
      </div>

      {/* 푸터 */}
      <div className={styles.viewerFooter}>
        <div className={styles.projectMeta}>
          <span>마지막 수정: {
            (() => {
              if (project.updatedAt) {
                try {
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
      </div>
    </div>
  );
};

export default ViewerPage;
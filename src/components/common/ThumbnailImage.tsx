import React, { useState, useEffect } from 'react';
import { ProjectSummary } from '../../firebase/types';
import { generateProjectThumbnail } from '../../utils/thumbnailGenerator';

// 스핀 애니메이션을 위한 CSS 주입
const injectSpinAnimation = () => {
  if (typeof document !== 'undefined' && !document.querySelector('#thumbnail-spin-animation')) {
    const style = document.createElement('style');
    style.id = 'thumbnail-spin-animation';
    style.innerHTML = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
};

// 컴포넌트 로드 시 애니메이션 주입
if (typeof window !== 'undefined') {
  injectSpinAnimation();
}

interface ThumbnailImageProps {
  project: ProjectSummary;
  designFile?: {
    thumbnail?: string;
    updatedAt?: any;
    spaceConfig?: any;
    furniture?: any;
  };
  className?: string;
  alt?: string;
}

const ThumbnailImage: React.FC<ThumbnailImageProps> = ({
  project,
  designFile,
  className = '',
  alt = '프로젝트 썸네일'
}) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadThumbnail = async () => {
      try {
        setLoading(true);
        setError(false);

        // 디자인 파일 전용 썸네일 생성
        if (designFile && designFile.spaceConfig && designFile.furniture) {
          console.log('🎨 디자인 파일 썸네일 생성 시작:', {
            hasSpaceConfig: !!designFile.spaceConfig,
            hasFurniture: !!designFile.furniture,
            furnitureCount: designFile.furniture?.placedModules?.length || 0,
            hasThumbnail: !!designFile.thumbnail,
            spaceConfigData: designFile.spaceConfig,
            furnitureData: designFile.furniture
          });

          // 디자인 파일이 있으면 저장된 썸네일 우선 사용
          if (designFile.thumbnail) {
            console.log('💾 저장된 디자인 썸네일 사용');
            setThumbnailUrl(designFile.thumbnail);
            setLoading(false);
            return;
          }

          // 저장된 썸네일이 없으면 디자인 전용 데이터로 생성
          const designProjectData: ProjectSummary = {
            ...project,
            spaceInfo: {
              width: designFile.spaceConfig.width,
              height: designFile.spaceConfig.height,
              depth: designFile.spaceConfig.depth,
              columns: designFile.spaceConfig.columns || []
            } as any,
            placedModules: designFile.furniture.placedModules || []
          };

          console.log('🔧 디자인 전용 ProjectSummary 생성:', designProjectData);

          const generatedThumbnail = await generateProjectThumbnail(designProjectData);

          console.log('📸 디자인 썸네일 생성 완료:', {
            success: !!generatedThumbnail,
            thumbnailLength: generatedThumbnail?.length || 0,
            isDataUrl: generatedThumbnail?.startsWith('data:') || false
          });

          if (mounted) {
            // 썸네일 생성에 실패했으면 fallback 사용
            if (!generatedThumbnail || generatedThumbnail.length === 0) {
              console.warn('⚠️ 썸네일 생성 실패, fallback 사용');
              setError(true);
            } else {
              setThumbnailUrl(generatedThumbnail);
            }
            setLoading(false);
          }
          return;
        }

        // 기존 project.thumbnail이 있으면 우선 사용
        // 하지만 프로젝트가 최근에 업데이트되었거나 가구가 변경된 경우 새로 생성
        const isRecentlyUpdated = project.updatedAt &&
          new Date(project.updatedAt.seconds * 1000).getTime() > Date.now() - 300000; // 5분 이내

        const hasPlacedModules = project.placedModules && project.placedModules.length > 0;
        const shouldRegenerateThumbnail = true; // [DEBUG] 신규 디자인 반영을 위해 강제로 다시 생성

        if (project.thumbnail && !shouldRegenerateThumbnail) {
          setThumbnailUrl(project.thumbnail);
          setLoading(false);
          return;
        }

        // 3D 썸네일 생성
        const generatedThumbnail = await generateProjectThumbnail(project);

        if (mounted) {
          setThumbnailUrl(generatedThumbnail || '');
          setLoading(false);
        }
      } catch (err) {
        console.error('썸네일 로드 실패:', err);
        if (mounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    loadThumbnail();

    return () => {
      mounted = false;
    };
  }, [project.id, project.thumbnail, project.updatedAt, project.placedModules?.length, designFile?.thumbnail, designFile?.updatedAt, designFile?.spaceConfig, designFile?.furniture]);

  if (loading) {
    return (
      <div className={`${className} thumbnail-loading`} style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f3f4f6',
        color: '#6b7280'
      }}>
        <div style={{
          width: '20px',
          height: '20px',
          border: '2px solid #e5e7eb',
          borderTop: '2px solid var(--theme-primary, #10b981)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
      </div>
    );
  }

  if (error || !thumbnailUrl) {
    const spaceConfig = designFile?.spaceConfig;
    const hasDimensions = spaceConfig?.width && spaceConfig?.depth && spaceConfig?.height;

    return (
      <div className={`${className} thumbnail-fallback`} style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, var(--theme-primary, #10b981), color-mix(in srgb, var(--theme-primary, #10b981) 80%, black))',
        color: 'white',
        gap: '4px'
      }}>
        {hasDimensions ? (
          <>
            <span style={{ fontSize: '12px', fontWeight: '700', opacity: 0.95 }}>
              {Math.round(spaceConfig.width)} × {Math.round(spaceConfig.depth)} × {Math.round(spaceConfig.height)}mm
            </span>
            <span style={{ fontSize: '10px', fontWeight: '400', opacity: 0.75 }}>
              현재 배치된 가구가 없습니다.
            </span>
          </>
        ) : (
          <span style={{ fontSize: '12px', fontWeight: '600' }}>디자인</span>
        )}
      </div>
    );
  }

  return (
    <img
      src={thumbnailUrl}
      alt={alt}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover'
      }}
      onError={() => setError(true)}
    />
  );
};

export default ThumbnailImage;
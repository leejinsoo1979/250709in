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

/**
 * 빈 디자인용 CSS 기반 썸네일 (테마 색상 실시간 반영)
 * Canvas 이미지와 달리 var(--theme-primary)가 테마 변경 시 즉시 반영됨
 */
const EmptyDesignThumbnail: React.FC<{
  className: string;
  spaceConfig?: { width: number; height: number; depth: number };
}> = ({ className }) => {
  return (
    <div className={`${className} thumbnail-empty-design`} style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, var(--theme-primary, #10b981), color-mix(in srgb, var(--theme-primary, #10b981) 80%, black))',
      color: 'white',
      gap: 'clamp(2px, 0.5vw, 6px)',
      width: '100%',
      height: '100%',
      padding: '8px',
      boxSizing: 'border-box',
    }}>
      <span style={{ fontSize: 'clamp(8px, 0.8vw, 11px)', fontWeight: '400', opacity: 0.75, textAlign: 'center' }}>
        현재 배치된 가구가 없습니다.
      </span>
    </div>
  );
};

const ThumbnailImage: React.FC<ThumbnailImageProps> = ({
  project,
  designFile,
  className = '',
  alt = '프로젝트 썸네일'
}) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // 가구가 있는지 판별
  const furnitureCount = designFile?.furniture?.placedModules?.length
    ?? project.placedModules?.length
    ?? 0;
  const isEmpty = furnitureCount === 0;

  // 빈 디자인이면 Canvas 생성 없이 바로 CSS div 렌더링
  if (isEmpty) {
    const spaceConfig = designFile?.spaceConfig || (
      (project.spaceInfo || project.spaceSize) ? {
        width: (project.spaceInfo as any)?.width || (project.spaceSize as any)?.width || 0,
        height: (project.spaceInfo as any)?.height || (project.spaceSize as any)?.height || 0,
        depth: (project.spaceInfo as any)?.depth || (project.spaceSize as any)?.depth || 0,
      } : undefined
    );
    return <EmptyDesignThumbnail className={className} spaceConfig={spaceConfig} />;
  }

  useEffect(() => {
    let mounted = true;

    const loadThumbnail = async () => {
      try {
        setLoading(true);
        setError(false);

        // 디자인 파일 전용 썸네일 생성
        if (designFile && designFile.spaceConfig && designFile.furniture) {
          // 가구가 있으면 저장된 썸네일 우선 사용
          if (designFile.thumbnail) {
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

          const generatedThumbnail = await generateProjectThumbnail(designProjectData);

          if (mounted) {
            if (!generatedThumbnail || generatedThumbnail.length === 0) {
              setError(true);
            } else {
              setThumbnailUrl(generatedThumbnail);
            }
            setLoading(false);
          }
          return;
        }

        // 기존 project.thumbnail이 있으면 우선 사용
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
    return <EmptyDesignThumbnail className={className} spaceConfig={designFile?.spaceConfig} />;
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

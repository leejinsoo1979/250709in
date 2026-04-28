// Configurator 진입 시 리소스 프리로드 → 완료 후 실제 Configurator 마운트
// 에디터 진입 시 버벅임 제거
import React, { lazy, Suspense, useEffect, useState } from 'react';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { preloadEditorAssets } from './preloader';

const Configurator = lazy(() => import('./index'));
// 모바일 사이즈에서는 MobileEditor로 자동 전환 (창 크기 줄이면 즉시 반영)
const MobileEditor = lazy(() => import('@/editor/MobileEditor'));

const MOBILE_BREAKPOINT = 768; // px

const useIsMobileViewport = () => {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
};

const ConfiguratorWrapper: React.FC = () => {
  const [assetsReady, setAssetsReady] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 1 });
  const isMobile = useIsMobileViewport();

  useEffect(() => {
    // 모바일 뷰포트에서는 데스크톱 에디터 프리로드 스킵 (불필요한 자원 낭비 방지)
    if (isMobile) {
      setAssetsReady(true);
      return;
    }
    let cancelled = false;
    preloadEditorAssets((loaded, total) => {
      if (!cancelled) setProgress({ loaded, total });
    })
      .catch(() => { /* 프리로드 실패해도 진입은 가능 */ })
      .finally(() => {
        if (!cancelled) setAssetsReady(true);
      });
    return () => { cancelled = true; };
  }, [isMobile]);

  // 모바일 뷰포트: MobileEditor로 자동 전환
  if (isMobile) {
    return (
      <Suspense fallback={<LoadingSpinner fullscreen message="모바일 에디터 로딩 중..." />}>
        <MobileEditor />
      </Suspense>
    );
  }

  if (!assetsReady) {
    const pct = progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0;
    return (
      <LoadingSpinner
        fullscreen
        message={`에디터 준비 중... ${pct}%`}
      />
    );
  }

  return (
    <Suspense fallback={<LoadingSpinner fullscreen message="에디터 로딩 중..." />}>
      <Configurator />
    </Suspense>
  );
};

export default ConfiguratorWrapper;

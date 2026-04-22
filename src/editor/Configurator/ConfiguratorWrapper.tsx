// Configurator 진입 시 리소스 프리로드 → 완료 후 실제 Configurator 마운트
// 에디터 진입 시 버벅임 제거
import React, { lazy, Suspense, useEffect, useState } from 'react';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { preloadEditorAssets } from './preloader';

const Configurator = lazy(() => import('./index'));

const ConfiguratorWrapper: React.FC = () => {
  const [assetsReady, setAssetsReady] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 1 });

  useEffect(() => {
    let cancelled = false;
    preloadEditorAssets((loaded, total) => {
      if (!cancelled) setProgress({ loaded, total });
    })
      .catch(() => { /* 프리로드 실패해도 진입은 가능 */ })
      .finally(() => {
        if (!cancelled) setAssetsReady(true);
      });
    return () => { cancelled = true; };
  }, []);

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

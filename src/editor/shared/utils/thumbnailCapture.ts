/**
 * 썸네일 캡처 유틸리티
 * 기존 3D 렌더링 로직에 최소한의 영향을 주면서 썸네일 생성
 */

// 3D 뷰어 컨테이너 찾기
export const find3DViewerContainer = (): HTMLElement | null => {
  // Space3DView 컨테이너 찾기 (여러 가능한 셀렉터 시도)
  const selectors = [
    '[data-testid="space-3d-view"]',
    '.space-3d-view',
    '[class*="space3d"]',
    '[class*="viewer"]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector) as HTMLElement;
    if (element) {
      return element;
    }
  }
  
  // 캔버스의 부모 컨테이너 찾기
  const canvas = findThreeCanvas();
  if (canvas) {
    let parent = canvas.parentElement;
    while (parent) {
      // 적절한 크기를 가진 부모 요소 찾기
      if (parent.offsetWidth > 400 && parent.offsetHeight > 300) {
        return parent;
      }
      parent = parent.parentElement;
    }
  }
  
  return null;
};

// 현재 화면에서 Three.js 캔버스 찾기
export const findThreeCanvas = (): HTMLCanvasElement | null => {
  // React Three Fiber가 생성한 캔버스 찾기
  const canvases = document.querySelectorAll('canvas');
  
  for (const canvas of canvases) {
    // Three.js 캔버스인지 확인 (WebGL 컨텍스트 존재 여부로 판단)
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
    if (gl && canvas.offsetWidth > 100 && canvas.offsetHeight > 100) {
      return canvas;
    }
  }
  
  return null;
};

// 캔버스에서 썸네일 이미지 캡처 (개선된 버전)
export const captureCanvasThumbnail = (
  canvas: HTMLCanvasElement,
  options: {
    width?: number;
    height?: number;
    quality?: number;
  } = {}
): string | null => {
  try {
    const { width = 300, height = 200, quality = 0.8 } = options;
    
    // 캔버스가 실제로 렌더링되었는지 확인
    if (canvas.width === 0 || canvas.height === 0) {
      console.warn('캔버스 크기가 0입니다.');
      return null;
    }
    
    // 임시 캔버스 생성 (리사이징용)
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    if (!tempCtx) {
      console.error('임시 캔버스 컨텍스트를 생성할 수 없습니다.');
      return null;
    }
    
    // 썸네일 크기 설정
    tempCanvas.width = width;
    tempCanvas.height = height;
    
    // 배경색 설정 (투명도 방지)
    tempCtx.fillStyle = '#f5f5f5';
    tempCtx.fillRect(0, 0, width, height);
    
    // 원본 캔버스를 썸네일 크기로 리사이징하여 복사
    tempCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, width, height);
    
    // base64 이미지로 변환
    return tempCanvas.toDataURL('image/png', quality);
    
  } catch (error) {
    console.error('썸네일 캡처 실패:', error);
    return null;
  }
};



// 정면 뷰로 전환하여 썸네일 캡처
export const captureFrontViewThumbnail = async (): Promise<string | null> => {
  const canvas = findThreeCanvas();
  
  if (!canvas) {
    console.warn('3D 캔버스를 찾을 수 없어 썸네일을 생성할 수 없습니다.');
    return null;
  }
  
  // 캔버스가 보이는 상태인지 확인
  if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
    console.warn('캔버스가 보이지 않는 상태입니다.');
    return null;
  }
  
  console.log('📸 정면 뷰 썸네일 캡처 시작...');
  
  // 현재 뷰 상태 저장 (나중에 복원하기 위해)
  const currentViewMode = document.querySelector('[data-view-mode]')?.getAttribute('data-view-mode');
  const currentViewDirection = document.querySelector('[data-view-direction]')?.getAttribute('data-view-direction');
  
  try {
    // 2D 정면 뷰로 전환
    const viewModeButton = document.querySelector('[data-view-mode="2D"]') as HTMLElement;
    const frontViewButton = document.querySelector('[data-view-direction="front"]') as HTMLElement;
    
    if (viewModeButton) {
      viewModeButton.click();
      console.log('🔄 2D 모드로 전환');
    }
    
    if (frontViewButton) {
      frontViewButton.click();
      console.log('🔄 정면 뷰로 전환');
    }
    
    // 뷰 전환 후 렌더링 완료 대기 (시간 단축)
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // 썸네일 캡처
    const thumbnail = captureCanvasThumbnail(canvas, {
      width: 300,
      height: 200,
      quality: 0.8
    });
    
    if (thumbnail && thumbnail.length > 1000) {
      console.log('📸 정면 뷰 썸네일 캡처 성공');
      return thumbnail;
    }
    
  } catch (error) {
    console.error('정면 뷰 썸네일 캡처 실패:', error);
  } finally {
    // 원래 뷰 상태로 복원
    if (currentViewMode && currentViewMode !== '2D') {
      const originalViewModeButton = document.querySelector(`[data-view-mode="${currentViewMode}"]`) as HTMLElement;
      if (originalViewModeButton) {
        originalViewModeButton.click();
        console.log('🔄 원래 뷰 모드로 복원');
      }
    }
    
    if (currentViewDirection && currentViewDirection !== 'front') {
      const originalViewDirectionButton = document.querySelector(`[data-view-direction="${currentViewDirection}"]`) as HTMLElement;
      if (originalViewDirectionButton) {
        originalViewDirectionButton.click();
        console.log('🔄 원래 뷰 방향으로 복원');
      }
    }
  }
  
  return null;
};

// 프로젝트 저장 시 자동 썸네일 캡처 (Blob 반환)
export const captureProjectThumbnail = async (): Promise<Blob | null> => {
  // 먼저 정면 뷰로 캡처 시도
  const frontViewThumbnail = await captureFrontViewThumbnail();
  if (frontViewThumbnail) {
    return dataURLToBlob(frontViewThumbnail);
  }
  
  // 정면 뷰 캡처 실패 시 기존 방식 사용
  const canvas = findThreeCanvas();
  
  if (!canvas) {
    console.warn('3D 캔버스를 찾을 수 없어 썸네일을 생성할 수 없습니다.');
    return null;
  }
  
  // 캔버스가 보이는 상태인지 확인
  if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
    console.warn('캔버스가 보이지 않는 상태입니다.');
    return null;
  }
  
  console.log('📸 3D 캔버스 썸네일 캡처 시작...', {
    canvasSize: `${canvas.width}x${canvas.height}`,
    displaySize: `${canvas.offsetWidth}x${canvas.offsetHeight}`
  });
  
  // 렌더링이 완료될 시간을 주기 위해 잠시 대기
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 여러 번 시도하여 가장 좋은 결과 선택
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const thumbnail = captureCanvasThumbnail(canvas, {
        width: 300,
        height: 200,
        quality: 0.7
      });
      
      if (thumbnail && thumbnail.length > 1000) { // 최소 크기 확인
        console.log(`📸 썸네일 캡처 성공 (${attempt}번째 시도)`);
        return dataURLToBlob(thumbnail);
      }
      
      // 실패 시 100ms 대기 후 재시도
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.warn(`썸네일 캡처 시도 ${attempt} 실패:`, error);
    }
  }
  
  console.warn('모든 썸네일 캡처 시도 실패');
  return null;
};

// Base64 데이터 URL을 Blob으로 변환하는 유틸리티 함수
export const dataURLToBlob = (dataURL: string): Blob => {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

// 기본 썸네일 생성 (3D 렌더링이 없을 때 사용)
export const generateDefaultThumbnail = (
  spaceInfo: { width: number; height: number; depth: number },
  furnitureCount: number
): string => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    return '';
  }
  
  canvas.width = 300;
  canvas.height = 200;
  
  // 나무 질감 배경 그라데이션
  const gradient = ctx.createLinearGradient(0, 0, 300, 200);
  gradient.addColorStop(0, '#f3e8d6');
  gradient.addColorStop(1, '#d4b896');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 300, 200);
  
  // 공간 정보 텍스트
  ctx.fillStyle = '#8B4513';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  
  const widthMm = Math.round(spaceInfo.width);
  const heightMm = Math.round(spaceInfo.height);
  const depthMm = Math.round(spaceInfo.depth);
  
  ctx.fillText(`${widthMm} × ${heightMm} × ${depthMm}mm`, 150, 80);
  
  // 가구 개수
  ctx.font = '14px Arial';
  ctx.fillText(`가구 ${furnitureCount}개`, 150, 120);
  
  // V5.0 뱃지 - 테마 색상 사용
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--theme-primary').trim() || '#10b981';
  ctx.fillRect(10, 10, 40, 20);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('V5.0', 15, 24);
  
  return canvas.toDataURL('image/png', 0.8);
}; 
import React, { useState } from 'react';
import styles from './ConvertModal.module.css';
import { PDFTemplatePreview } from '@/editor/shared/components/PDFTemplatePreview';
import { useUIStore } from '@/store/uiStore';
import { useTranslation } from '@/i18n/useTranslation';
import { usePDFExport } from '@/editor/shared/hooks/usePDFExport';
import { useDXFExport, type DrawingType } from '@/editor/shared/hooks/useDXFExport';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';

interface ConvertModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ConvertModal: React.FC<ConvertModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [capturedViews, setCapturedViews] = useState<{
    top?: string;
    front?: string;
    side?: string;
    door?: string;
  }>({});
  const [isCapturing, setIsCapturing] = useState(false);
  
  // 내보내기 옵션 상태
  const [exportType, setExportType] = useState<'pdf' | 'dxf'>('pdf');
  const [renderMode, setRenderMode] = useState<'solid' | 'wireframe'>('solid');
  const [selectedViews, setSelectedViews] = useState({
    '3d': true,
    '2d-top': true,
    '2d-front': false,
    '2d-left': false,
    '2d-right': false
  });
  const [selectedDXFTypes, setSelectedDXFTypes] = useState<DrawingType[]>(['front', 'plan']);
  
  // 내보내기 훅 사용
  const { exportToPDF, isExporting: isPDFExporting } = usePDFExport();
  const { exportToZIP, canExportDXF, isExporting: isDXFExporting } = useDXFExport();
  const spaceInfo = useSpaceConfigStore((state) => state.spaceInfo);
  const placedModules = useFurnitureStore((state) => state.placedModules);

  if (!isOpen) return null;

  // 뷰 캡처 함수
  const captureViews = async () => {
    console.log('captureViews 시작');
    setIsCapturing(true);
    const { 
      viewMode, 
      view2DDirection, 
      setViewMode, 
      setView2DDirection, 
      setRenderMode,
      showGuides,
      showAxis,
      showDimensions,
      setShowGuides,
      setShowAxis,
      setShowDimensions
    } = useUIStore.getState();
    
    console.log('현재 상태:', { viewMode, view2DDirection });
    
    // 현재 상태 저장
    const originalViewMode = viewMode;
    const originalView2DDirection = view2DDirection;
    const originalShowGuides = showGuides;
    const originalShowAxis = showAxis;
    const originalShowDimensions = showDimensions;
    
    // 캡처를 위해 그리드, 축, 컬럼 끄기
    if (showGuides) setShowGuides(false);
    if (showAxis) setShowAxis(false);
    if (showDimensions) setShowDimensions(false);
    
    const captures: typeof capturedViews = {};
    
    try {
      // 모든 캔버스 찾기
      const canvases = document.querySelectorAll('canvas');
      console.log('찾은 캔버스 개수:', canvases.length);
      
      // Three.js 캔버스 찾기 (일반적으로 가장 큰 캔버스)
      let threeCanvas: HTMLCanvasElement | null = null;
      canvases.forEach(canvas => {
        console.log('캔버스 크기:', canvas.width, 'x', canvas.height);
        if (canvas.width > 100 && canvas.height > 100) {
          threeCanvas = canvas;
        }
      });
      
      if (!threeCanvas) {
        console.error('Three.js 캔버스를 찾을 수 없습니다');
        setIsCapturing(false);
        return;
      }
      
      // 상부뷰 캡처
      console.log('상부뷰 캡처 시작');
      setViewMode('2D');
      setView2DDirection('top');
      setRenderMode('wireframe');
      await new Promise(resolve => setTimeout(resolve, 1500));
      captures.top = threeCanvas.toDataURL();
      console.log('상부뷰 캡처 완료');
      
      // 정면뷰 캡처
      console.log('정면뷰 캡처 시작');
      setView2DDirection('front');
      await new Promise(resolve => setTimeout(resolve, 1000));
      captures.front = threeCanvas.toDataURL();
      console.log('정면뷰 캡처 완료');
      
      // 측면뷰 캡처
      console.log('측면뷰 캡처 시작');
      setView2DDirection('left');
      await new Promise(resolve => setTimeout(resolve, 1000));
      captures.side = threeCanvas.toDataURL();
      console.log('측면뷰 캡처 완료');
      
      // 도어뷰 캡처 (3D 정면)
      console.log('도어뷰 캡처 시작');
      setViewMode('3D');
      setRenderMode('solid');
      await new Promise(resolve => setTimeout(resolve, 1500));
      captures.door = threeCanvas.toDataURL();
      console.log('도어뷰 캡처 완료');
      
      setCapturedViews(captures);
      console.log('모든 캡처 완료:', captures);
      
      // 원래 상태로 복원
      setViewMode(originalViewMode);
      setView2DDirection(originalView2DDirection);
      if (originalShowGuides) setShowGuides(true);
      if (originalShowAxis) setShowAxis(true);
      if (originalShowDimensions) setShowDimensions(true);
      
      setIsCapturing(false);
      setShowPDFPreview(true);
    } catch (error) {
      console.error('뷰 캡처 실패:', error);
      // 원래 상태로 복원
      setViewMode(originalViewMode);
      setView2DDirection(originalView2DDirection);
      if (originalShowGuides) setShowGuides(true);
      if (originalShowAxis) setShowAxis(true);
      if (originalShowDimensions) setShowDimensions(true);
      setIsCapturing(false);
      alert(t('messages.captureFailure'));
    }
  };

  const handleViewToggle = (view: string) => {
    setSelectedViews(prev => ({
      ...prev,
      [view]: !prev[view as keyof typeof prev]
    }));
  };

  const handleDXFTypeToggle = (type: DrawingType) => {
    setSelectedDXFTypes(prev => {
      if (prev.includes(type)) {
        return prev.filter(t => t !== type);
      } else {
        return [...prev, type];
      }
    });
  };

  const handleDXFDownload = async () => {
    console.log('📐 DXF 다운로드 버튼 클릭됨');
    
    if (!spaceInfo) {
      alert('공간 정보가 없습니다. 먼저 공간을 설정해주세요.');
      return;
    }
    
    if (selectedDXFTypes.length === 0) {
      alert('최소 하나 이상의 도면을 선택해주세요.');
      return;
    }
    
    if (!canExportDXF(spaceInfo, placedModules)) {
      alert('DXF 내보내기를 할 수 없습니다. 가구를 배치해주세요.');
      return;
    }
    
    try {
      const result = await exportToZIP(spaceInfo, placedModules, selectedDXFTypes);
      
      if (result.success) {
        console.log('✅ DXF 다운로드 성공:', result.filename);
        // 모달 자동 닫기
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        console.error('❌ DXF 다운로드 실패:', result.message);
        alert(`DXF 다운로드 실패: ${result.message}`);
      }
    } catch (error) {
      console.error('❌ DXF 다운로드 예외:', error);
      alert('DXF 다운로드 중 오류가 발생했습니다.');
    }
  };

  const handlePDFDownload = async () => {
    console.log('📄 PDF 다운로드 버튼 클릭됨');
    
    if (!spaceInfo) {
      alert('공간 정보가 없습니다. 먼저 공간을 설정해주세요.');
      return;
    }
    
    // 선택된 뷰만 필터링 및 올바른 ID로 매핑
    const viewsToExport = Object.entries(selectedViews)
      .filter(([_, selected]) => selected)
      .map(([view, _]) => {
        // '3d'를 '3d-front'로 매핑
        if (view === '3d') return '3d-front';
        return view;
      });
    
    if (viewsToExport.length === 0) {
      alert('최소 하나 이상의 뷰를 선택해주세요.');
      return;
    }
    
    try {
      const result = await exportToPDF(spaceInfo, placedModules, viewsToExport as any, renderMode);
      
      if (result.success) {
        console.log('✅ PDF 다운로드 성공:', result.filename);
        // 모달 자동 닫기
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        console.error('❌ PDF 다운로드 실패:', result.message);
        alert(`PDF 다운로드 실패: ${result.message}`);
      }
    } catch (error) {
      console.error('❌ PDF 다운로드 예외:', error);
      alert('PDF 다운로드 중 오류가 발생했습니다.');
    }
  };

  return (
    <>
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.header}>
            <h2>내보내기</h2>
            <button className={styles.closeButton} onClick={onClose}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <div className={styles.content}>
            {/* 파일 형식 선택 */}
            <div className={styles.section}>
              <p className={styles.sectionTitle}>현재 가구 배치를 도면 또는 PDF로 내보냅니다</p>
              <div className={styles.formatTabs}>
                <button 
                  className={`${styles.formatTab} ${exportType === 'dxf' ? styles.active : ''}`}
                  onClick={() => setExportType('dxf')}
                >
                  CAD 도면 (DXF)
                </button>
                <button 
                  className={`${styles.formatTab} ${exportType === 'pdf' ? styles.active : ''}`}
                  onClick={() => setExportType('pdf')}
                >
                  PDF 문서
                </button>
              </div>
            </div>

            {/* DXF 옵션 */}
            {exportType === 'dxf' && (
              <>
                <div className={styles.section}>
                  <h3 className={styles.sectionHeader}>포함할 도면 선택</h3>
                  <div className={styles.viewList}>
                    <label className={`${styles.viewOption} ${selectedDXFTypes.includes('front') ? styles.selected : ''}`}>
                      <input 
                        type="checkbox"
                        checked={selectedDXFTypes.includes('front')}
                        onChange={() => handleDXFTypeToggle('front')}
                      />
                      <span>정면도</span>
                      <span className={styles.viewDescription}>정면에서 본 도면</span>
                    </label>
                    <label className={`${styles.viewOption} ${selectedDXFTypes.includes('plan') ? styles.selected : ''}`}>
                      <input 
                        type="checkbox"
                        checked={selectedDXFTypes.includes('plan')}
                        onChange={() => handleDXFTypeToggle('plan')}
                      />
                      <span>평면도</span>
                      <span className={styles.viewDescription}>위에서 본 도면</span>
                    </label>
                    <label className={`${styles.viewOption} ${selectedDXFTypes.includes('side') ? styles.selected : ''}`}>
                      <input 
                        type="checkbox"
                        checked={selectedDXFTypes.includes('side')}
                        onChange={() => handleDXFTypeToggle('side')}
                      />
                      <span>측면도</span>
                      <span className={styles.viewDescription}>측면에서 본 도면</span>
                    </label>
                  </div>
                </div>

                {/* DXF 다운로드 버튼 */}
                <button 
                  className={styles.downloadButton}
                  onClick={handleDXFDownload}
                  disabled={isDXFExporting || selectedDXFTypes.length === 0 || !canExportDXF(spaceInfo, placedModules)}
                >
                  {isDXFExporting ? '처리 중...' : `DXF ZIP 다운로드 (${selectedDXFTypes.length}개 도면)`}
                </button>
              </>
            )}

            {/* PDF 옵션 */}
            {exportType === 'pdf' && (
              <>
                {/* 렌더링 모드 선택 */}
                <div className={styles.section}>
                  <h3 className={styles.sectionHeader}>렌더링 모드</h3>
                  <div className={styles.renderModes}>
                    <label className={`${styles.renderMode} ${renderMode === 'solid' ? styles.active : ''}`}>
                      <input 
                        type="radio"
                        name="renderMode"
                        value="solid"
                        checked={renderMode === 'solid'}
                        onChange={(e) => setRenderMode(e.target.value as 'solid' | 'wireframe')}
                      />
                      <div className={styles.renderModeContent}>
                        <h4>솔리드</h4>
                        <p>재질과 색상이 표현됩니다</p>
                      </div>
                    </label>
                    <label className={`${styles.renderMode} ${renderMode === 'wireframe' ? styles.active : ''}`}>
                      <input 
                        type="radio"
                        name="renderMode"
                        value="wireframe"
                        checked={renderMode === 'wireframe'}
                        onChange={(e) => setRenderMode(e.target.value as 'solid' | 'wireframe')}
                      />
                      <div className={styles.renderModeContent}>
                        <h4>와이어프레임</h4>
                        <p>구조만 표현됩니다</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* 포함할 뷰 선택 */}
                <div className={styles.section}>
                  <h3 className={styles.sectionHeader}>포함할 뷰 선택</h3>
                  <div className={styles.viewList}>
                    <label className={`${styles.viewOption} ${selectedViews['3d'] ? styles.selected : ''}`}>
                      <input 
                        type="checkbox"
                        checked={selectedViews['3d']}
                        onChange={() => handleViewToggle('3d')}
                      />
                      <span>3D 정면뷰</span>
                    </label>
                    <label className={`${styles.viewOption} ${selectedViews['2d-top'] ? styles.selected : ''}`}>
                      <input 
                        type="checkbox"
                        checked={selectedViews['2d-top']}
                        onChange={() => handleViewToggle('2d-top')}
                      />
                      <span>2D 평면도 (위에서 본 뷰)</span>
                      <button className={styles.viewDetail}>치수 포함</button>
                    </label>
                    <label className={`${styles.viewOption} ${selectedViews['2d-front'] ? styles.selected : ''}`}>
                      <input 
                        type="checkbox"
                        checked={selectedViews['2d-front']}
                        onChange={() => handleViewToggle('2d-front')}
                      />
                      <span>2D 정면도 (앞에서 본 뷰)</span>
                      <button className={styles.viewDetail}>치수 포함</button>
                    </label>
                    <label className={`${styles.viewOption} ${selectedViews['2d-left'] ? styles.selected : ''}`}>
                      <input 
                        type="checkbox"
                        checked={selectedViews['2d-left']}
                        onChange={() => handleViewToggle('2d-left')}
                      />
                      <span>2D 좌측면도 (왼쪽에서 본 뷰)</span>
                      <button className={styles.viewDetail}>치수 포함</button>
                    </label>
                    <label className={`${styles.viewOption} ${selectedViews['2d-right'] ? styles.selected : ''}`}>
                      <input 
                        type="checkbox"
                        checked={selectedViews['2d-right']}
                        onChange={() => handleViewToggle('2d-right')}
                      />
                      <span>2D 우측면도 (오른쪽에서 본 뷰)</span>
                      <button className={styles.viewDetail}>치수 포함</button>
                    </label>
                  </div>
                </div>

                {/* PDF 다운로드 버튼 */}
                <button 
                  className={styles.downloadButton}
                  onClick={handlePDFDownload}
                  disabled={isPDFExporting || Object.values(selectedViews).every(v => !v)}
                >
                  {isPDFExporting ? '처리 중...' : `PDF 다운로드 (${Object.values(selectedViews).filter(v => v).length}개 뷰)`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* PDF 미리보기 */}
      <PDFTemplatePreview 
        isOpen={showPDFPreview}
        onClose={() => {
          setShowPDFPreview(false);
          onClose();
        }}
        capturedViews={capturedViews}
      />
    </>
  );
};

export default ConvertModal;
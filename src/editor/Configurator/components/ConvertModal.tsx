import React, { useState } from 'react';
import styles from './ConvertModal.module.css';
import { PDFTemplatePreview } from '@/editor/shared/components/PDFTemplatePreview';
import { useUIStore } from '@/store/uiStore';
import { useTranslation } from '@/i18n/useTranslation';
import { usePDFExport } from '@/editor/shared/hooks/usePDFExport';
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
  
  // PDF 내보내기 훅 사용
  const { exportToPDF, isExporting } = usePDFExport();
  const spaceInfo = useSpaceConfigStore((state) => state.spaceInfo);
  const placedModules = useFurnitureStore((state) => state.placedModules);

  if (!isOpen) return null;

  // 뷰 캡처 함수
  const captureViews = async () => {
    console.log('captureViews 시작');
    setIsCapturing(true);
    const { viewMode, view2DDirection, setViewMode, setView2DDirection, setRenderMode } = useUIStore.getState();
    
    console.log('현재 상태:', { viewMode, view2DDirection });
    
    // 현재 상태 저장
    const originalViewMode = viewMode;
    const originalView2DDirection = view2DDirection;
    
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
      
      setIsCapturing(false);
      setShowPDFPreview(true);
    } catch (error) {
      console.error('뷰 캡처 실패:', error);
      // 원래 상태로 복원
      setViewMode(originalViewMode);
      setView2DDirection(originalView2DDirection);
      setIsCapturing(false);
      alert(t('messages.captureFailure'));
    }
  };

  const handlePDFDownload = async () => {
    console.log('📄 PDF 다운로드 버튼 클릭됨');
    
    if (!spaceInfo) {
      alert('공간 정보가 없습니다. 먼저 공간을 설정해주세요.');
      return;
    }
    
    try {
      // 정면도, 평면도, 측면도를 포함한 PDF 생성
      // 2D 모드에서 그리드 컬럼 축 자동 비활성화 처리됨
      const selectedViews = ['2d-front', '2d-top', '2d-left'] as const;
      
      const result = await exportToPDF(spaceInfo, placedModules, selectedViews, 'solid');
      
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
            <h2>{t('export.title')}</h2>
            <button className={styles.closeButton} onClick={onClose}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <div className={styles.content}>
            <div className={styles.optionList}>
              <button 
                className={styles.optionButton}
                onClick={handlePDFDownload}
                disabled={isExporting}
              >
                <div className={styles.optionIcon}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                    <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                    <line x1="4" y1="9" x2="20" y2="9" stroke="currentColor" strokeWidth="1.5"/>
                    <line x1="9" y1="4" x2="9" y2="20" stroke="currentColor" strokeWidth="1.5"/>
                    <rect x="11" y="11" width="7" height="7" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                </div>
                <div className={styles.optionInfo}>
                  <h3>{t('export.pdf')}</h3>
                  <p>{t('export.pdfDesc')}</p>
                </div>
                {isExporting && <span className={styles.loading}>{t('export.capturing')}</span>}
              </button>

              <button className={styles.optionButton} disabled>
                <div className={styles.optionIcon}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className={styles.optionInfo}>
                  <h3>{t('export.dxf')}</h3>
                  <p>{t('export.dxfDesc')}</p>
                </div>
              </button>

              <button className={styles.optionButton} disabled>
                <div className={styles.optionIcon}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M9 9L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M15 9L9 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className={styles.optionInfo}>
                  <h3>{t('export.image')}</h3>
                  <p>{t('export.imageDesc')}</p>
                </div>
              </button>
            </div>
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
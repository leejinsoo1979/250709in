import React, { useState } from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useDXFExport, type DrawingType } from '@/editor/shared/hooks/useDXFExport';
import { usePDFExport, type ViewType } from '@/editor/shared/hooks/usePDFExport';
import styles from './ExportPanel.module.css';

interface DrawingTypeInfo {
  id: DrawingType;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const DRAWING_TYPES: DrawingTypeInfo[] = [
  { 
    id: 'front', 
    name: '정면도', 
    description: '정면에서 본 도면', 
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="6" width="16" height="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="4" y1="14" x2="20" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="12" y1="6" x2="12" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2"/>
      </svg>
    )
  },
  { 
    id: 'plan', 
    name: '평면도', 
    description: '위에서 본 도면', 
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="16" height="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <rect x="8" y="8" width="8" height="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="4" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2"/>
        <line x1="16" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2"/>
      </svg>
    )
  },
  { 
    id: 'side', 
    name: '측면도', 
    description: '측면에서 본 도면', 
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M4 6L8 8V18L4 20V6Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="8" y="8" width="12" height="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="8" y1="13" x2="20" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2"/>
      </svg>
    )
  }
];

const ExportPanel: React.FC = () => {
  const { spaceInfo } = useSpaceConfigStore();
  const placedModules = useFurnitureStore(state => state.placedModules);
  const { exportToDXF, exportToZIP, canExportDXF, getExportStatusMessage } = useDXFExport();
  const { exportToPDF, canExportPDF, VIEW_TYPES, isExporting: isPDFExporting } = usePDFExport();
  
  const [isExporting, setIsExporting] = useState(false);
  const [selectedDrawingTypes, setSelectedDrawingTypes] = useState<DrawingType[]>(['front']);
  const [selectedPDFViews, setSelectedPDFViews] = useState<ViewType[]>(['3d-front', '2d-front']);
  const [pdfRenderMode, setPDFRenderMode] = useState<'solid' | 'wireframe'>('solid');
  const [activeTab, setActiveTab] = useState<'dxf' | 'pdf'>('dxf');
  const [lastExportResult, setLastExportResult] = useState<{
    success: boolean;
    message: string;
    filename?: string;
  } | null>(null);

  // 도면 타입 선택/해제 핸들러
  const handleDrawingTypeToggle = (drawingType: DrawingType) => {
    setSelectedDrawingTypes(prev => {
      if (prev.includes(drawingType)) {
        return prev.filter(type => type !== drawingType);
      } else {
        return [...prev, drawingType];
      }
    });
  };

  // PDF 뷰 선택/해제 핸들러
  const handlePDFViewToggle = (viewType: ViewType) => {
    setSelectedPDFViews(prev => {
      if (prev.includes(viewType)) {
        return prev.filter(type => type !== viewType);
      } else {
        return [...prev, viewType];
      }
    });
  };

  // DXF 내보내기 실행 (개별 파일)
  const handleExportDXF = async () => {
    if (!spaceInfo || !canExportDXF(spaceInfo, placedModules) || selectedDrawingTypes.length === 0) {
      return;
    }

    setIsExporting(true);
    setLastExportResult(null);

    try {
      const results = [];
      for (const drawingType of selectedDrawingTypes) {
        const result = await exportToDXF(spaceInfo, placedModules, drawingType);
        results.push({ drawingType, result });
      }

      const allSuccess = results.every(r => r.result.success);
      const successCount = results.filter(r => r.result.success).length;
      
      if (allSuccess) {
        setLastExportResult({
          success: true,
          message: `${successCount}개 도면이 성공적으로 생성되었습니다.`
        });
      } else {
        setLastExportResult({
          success: false,
          message: `${successCount}/${results.length}개 도면이 생성되었습니다.`
        });
      }
      
      if (allSuccess) {
        setTimeout(() => {
          setLastExportResult(null);
        }, 3000);
      }
    } catch {
      setLastExportResult({
        success: false,
        message: '예상치 못한 오류가 발생했습니다.'
      });
    } finally {
      setIsExporting(false);
    }
  };

  // DXF 내보내기 실행 (ZIP 파일)
  const handleExportDXFZip = async () => {
    if (!spaceInfo || !canExportDXF(spaceInfo, placedModules) || selectedDrawingTypes.length === 0) {
      return;
    }

    setIsExporting(true);
    setLastExportResult(null);

    try {
      const result = await exportToZIP(spaceInfo, placedModules, selectedDrawingTypes);
      
      setLastExportResult(result);
      
      if (result.success) {
        setTimeout(() => {
          setLastExportResult(null);
        }, 3000);
      }
    } catch {
      setLastExportResult({
        success: false,
        message: '예상치 못한 오류가 발생했습니다.'
      });
    } finally {
      setIsExporting(false);
    }
  };

  // PDF 내보내기 실행
  const handleExportPDF = async () => {
    console.log('PDF Export clicked', {
      spaceInfo: !!spaceInfo,
      canExport: spaceInfo ? canExportPDF(spaceInfo, placedModules) : false,
      selectedViews: selectedPDFViews.length,
      placedModules: placedModules.length
    });
    
    if (!spaceInfo || !canExportPDF(spaceInfo, placedModules) || selectedPDFViews.length === 0) {
      console.log('Export blocked:', {
        hasSpaceInfo: !!spaceInfo,
        canExport: spaceInfo ? canExportPDF(spaceInfo, placedModules) : false,
        hasSelectedViews: selectedPDFViews.length > 0
      });
      return;
    }

    try {
      const result = await exportToPDF(spaceInfo, placedModules, selectedPDFViews, pdfRenderMode);
      setLastExportResult(result);
      
      if (result.success) {
        setTimeout(() => {
          setLastExportResult(null);
        }, 3000);
      }
    } catch (error) {
      console.error('PDF Export error:', error);
      setLastExportResult({
        success: false,
        message: '예상치 못한 오류가 발생했습니다.'
      });
    }
  };

  const isExportEnabled = spaceInfo && canExportDXF(spaceInfo, placedModules) && selectedDrawingTypes.length > 0;
  const isPDFExportEnabled = spaceInfo && canExportPDF(spaceInfo, placedModules) && selectedPDFViews.length > 0;
  const statusMessage = spaceInfo ? getExportStatusMessage(spaceInfo, placedModules) : '공간 정보가 없습니다.';
  
  // PDF 버튼 상태 디버깅
  console.log('PDF Button State:', {
    isPDFExportEnabled,
    isPDFExporting,
    disabled: !isPDFExportEnabled || isPDFExporting,
    spaceInfo: !!spaceInfo,
    canExportPDF: spaceInfo ? canExportPDF(spaceInfo, placedModules) : false,
    selectedPDFViews: selectedPDFViews.length,
    placedModules: placedModules.length
  });

  return (
    <div className={styles.exportPanel}>
      <div className={styles.header}>
        <h3 className={styles.title}>내보내기</h3>
        <p className={styles.description}>
          현재 가구 배치를 도면 또는 PDF로 내보냅니다
        </p>
      </div>

      {/* 탭 메뉴 */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'dxf' ? styles.active : ''}`}
          onClick={() => setActiveTab('dxf')}
        >
          CAD 도면 (DXF)
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'pdf' ? styles.active : ''}`}
          onClick={() => setActiveTab('pdf')}
        >
          PDF 문서
        </button>
      </div>

      {/* DXF 탭 내용 */}
      {activeTab === 'dxf' && (
        <>
          <div className={styles.drawingTypeSelection}>
            <h4 className={styles.selectionTitle}>내보낼 도면 선택</h4>
            <div className={styles.drawingTypes}>
              {DRAWING_TYPES.map(drawingType => (
                <label key={drawingType.id} className={styles.drawingTypeItem}>
                  <input
                    type="checkbox"
                    checked={selectedDrawingTypes.includes(drawingType.id)}
                    onChange={() => handleDrawingTypeToggle(drawingType.id)}
                    className={styles.checkbox}
                  />
                  <div className={styles.drawingTypeInfo}>
                    <div className={styles.drawingTypeIcon}>{drawingType.icon}</div>
                    <div className={styles.drawingTypeText}>
                      <span className={styles.drawingTypeName}>{drawingType.name}</span>
                      <span className={styles.drawingTypeDescription}>{drawingType.description}</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.actions}>
            <button
              className={`${styles.exportButton} ${!isExportEnabled ? styles.disabled : ''}`}
              onClick={handleExportDXFZip}
              disabled={!isExportEnabled || isExporting}
            >
              {isExporting ? (
                <>
                  <span className={styles.spinner}></span>
                  내보내는 중...
                </>
              ) : (
                <>
                  ZIP 파일로 다운로드 ({selectedDrawingTypes.length}개)
                </>
              )}
            </button>
            
            <button
              className={`${styles.exportButton} ${styles.secondary} ${!isExportEnabled ? styles.disabled : ''}`}
              onClick={handleExportDXF}
              disabled={!isExportEnabled || isExporting}
            >
              {isExporting ? (
                <>
                  <span className={styles.spinner}></span>
                  내보내는 중...
                </>
              ) : (
                <>
                  개별 파일로 다운로드
                </>
              )}
            </button>
          </div>

          <div className={styles.info}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>파일 형식:</span>
              <span className={styles.infoValue}>DXF (AutoCAD 호환)</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>축척:</span>
              <span className={styles.infoValue}>1:100</span>
            </div>
          </div>
        </>
      )}

      {/* PDF 탭 내용 */}
      {activeTab === 'pdf' && (
        <>
          <div className={styles.drawingTypeSelection}>
            <h4 className={styles.selectionTitle}>렌더링 모드</h4>
            <div className={styles.renderModeSelection}>
              <label className={`${styles.renderModeOption} ${pdfRenderMode === 'solid' ? styles.active : ''}`}>
                <input
                  type="radio"
                  name="pdfRenderMode"
                  value="solid"
                  checked={pdfRenderMode === 'solid'}
                  onChange={() => setPDFRenderMode('solid')}
                  className={styles.radio}
                />
                <div className={styles.renderModeInfo}>
                  <span className={styles.renderModeName}>솔리드</span>
                  <span className={styles.renderModeDescription}>재질과 색상이 표현됩니다</span>
                </div>
              </label>
              <label className={`${styles.renderModeOption} ${pdfRenderMode === 'wireframe' ? styles.active : ''}`}>
                <input
                  type="radio"
                  name="pdfRenderMode"
                  value="wireframe"
                  checked={pdfRenderMode === 'wireframe'}
                  onChange={() => setPDFRenderMode('wireframe')}
                  className={styles.radio}
                />
                <div className={styles.renderModeInfo}>
                  <span className={styles.renderModeName}>와이어프레임</span>
                  <span className={styles.renderModeDescription}>구조만 표현됩니다</span>
                </div>
              </label>
            </div>
          </div>

          <div className={styles.drawingTypeSelection}>
            <h4 className={styles.selectionTitle}>포함할 뷰 선택</h4>
            <div className={styles.pdfViews}>
              {VIEW_TYPES.map(view => (
                <label key={view.id} className={styles.pdfViewItem}>
                  <input
                    type="checkbox"
                    checked={selectedPDFViews.includes(view.id)}
                    onChange={() => handlePDFViewToggle(view.id)}
                    className={styles.checkbox}
                  />
                  <div className={styles.pdfViewInfo}>
                    <span className={styles.pdfViewName}>{view.name}</span>
                    {view.viewMode === '2D' && (
                      <span className={styles.pdfViewBadge}>치수 포함</span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.actions}>
            <button
              className={`${styles.exportButton} ${!isPDFExportEnabled ? styles.disabled : ''}`}
              onClick={handleExportPDF}
              disabled={!isPDFExportEnabled || isPDFExporting}
            >
              {isPDFExporting ? (
                <>
                  <span className={styles.spinner}></span>
                  PDF 생성 중...
                </>
              ) : (
                <>
                  PDF 다운로드 ({selectedPDFViews.length}개 뷰)
                </>
              )}
            </button>
          </div>

          <div className={styles.info}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>파일 형식:</span>
              <span className={styles.infoValue}>PDF (A4 가로)</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>포함 내용:</span>
              <span className={styles.infoValue}>3D/2D 뷰, 치수, 가구 정보</span>
            </div>
          </div>
        </>
      )}

      {/* 공통 상태 메시지 */}
      <div className={styles.status}>
        <div className={styles.statusMessage}>
          {statusMessage}
        </div>
        
        {spaceInfo && (
          <div className={styles.spaceInfo}>
            <span className={styles.spaceSize}>
              {spaceInfo.width}W × {spaceInfo.height}H × {spaceInfo.depth}D mm
            </span>
            <span className={styles.moduleCount}>
              {placedModules.length}개 가구
            </span>
          </div>
        )}
      </div>

      {/* 결과 메시지 */}
      {lastExportResult && (
        <div className={`${styles.result} ${lastExportResult.success ? styles.success : styles.error}`}>
          <div className={styles.resultMessage}>
            {lastExportResult.message}
          </div>
          {lastExportResult.filename && (
            <div className={styles.filename}>
              파일명: {lastExportResult.filename}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExportPanel;
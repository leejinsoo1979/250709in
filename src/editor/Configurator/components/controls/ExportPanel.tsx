import React, { useState } from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useDXFExport, type DrawingType } from '@/editor/shared/hooks/useDXFExport';
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

/**
 * 도면 내보내기 패널 컴포넌트
 * 오른쪽 컨트롤 패널 하단에 위치
 */
const ExportPanel: React.FC = () => {
  const { spaceInfo } = useSpaceConfigStore();
  const placedModules = useFurnitureStore(state => state.placedModules);
  const { exportToDXF, canExportDXF, getExportStatusMessage } = useDXFExport();
  
  const [isExporting, setIsExporting] = useState(false);
  const [selectedDrawingTypes, setSelectedDrawingTypes] = useState<DrawingType[]>(['front']);
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

  // DXF 내보내기 실행
  const handleExportDXF = async () => {
    if (!spaceInfo || !canExportDXF(spaceInfo, placedModules) || selectedDrawingTypes.length === 0) {
      return;
    }

    setIsExporting(true);
    setLastExportResult(null);

    try {
      // 선택된 각 도면 타입별로 내보내기 실행
      const results = [];
      for (const drawingType of selectedDrawingTypes) {
        const result = await exportToDXF(spaceInfo, placedModules, drawingType);
        results.push({ drawingType, result });
      }

      // 모든 결과가 성공인지 확인
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
      
      // 성공 메시지는 3초 후 자동 사라짐
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

  const isExportEnabled = spaceInfo && canExportDXF(spaceInfo, placedModules) && selectedDrawingTypes.length > 0;
  const statusMessage = spaceInfo ? getExportStatusMessage(spaceInfo, placedModules) : '공간 정보가 없습니다.';

  return (
    <div className={styles.exportPanel}>
      <div className={styles.header}>
        <h3 className={styles.title}>도면 내보내기</h3>
        <p className={styles.description}>
          현재 가구 배치를 CAD 도면(DXF)으로 내보냅니다
        </p>
      </div>

      {/* 도면 타입 선택 */}
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

      <div className={styles.actions}>
        <button
          className={`${styles.exportButton} ${!isExportEnabled ? styles.disabled : ''}`}
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
              DXF 도면 다운로드 ({selectedDrawingTypes.length}개)
            </>
          )}
        </button>
      </div>

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

      <div className={styles.info}>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>파일 형식:</span>
          <span className={styles.infoValue}>DXF (AutoCAD 호환)</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>축척:</span>
          <span className={styles.infoValue}>1:100</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>단위:</span>
          <span className={styles.infoValue}>밀리미터(mm)</span>
        </div>
      </div>
    </div>
  );
};

export default ExportPanel; 
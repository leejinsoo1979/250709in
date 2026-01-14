/**
 * 보링 데이터 내보내기 대화상자
 */

import React, { useState, useMemo } from 'react';
import {
  exportBoringData,
  SUPPORTED_EXPORT_FORMATS,
  downloadCSV,
  downloadCSVAsZip,
  downloadDXF,
  downloadMPR,
  downloadCIX,
} from '@/domain/boring/exporters';
import type {
  PanelBoringData,
  ExportFormat,
  BoringExportResult,
} from '@/domain/boring/types';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './BoringExportDialog.module.css';

interface BoringExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  panels: PanelBoringData[];
}

const BoringExportDialog: React.FC<BoringExportDialogProps> = ({
  isOpen,
  onClose,
  panels,
}) => {
  const { t } = useTranslation();
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv');
  const [filePerPanel, setFilePerPanel] = useState(true);
  const [includeDimensions, setIncludeDimensions] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<BoringExportResult | null>(null);

  const selectedFormatInfo = useMemo(
    () => SUPPORTED_EXPORT_FORMATS.find((f) => f.format === selectedFormat),
    [selectedFormat]
  );

  const handleExport = async () => {
    setIsExporting(true);
    setExportResult(null);

    try {
      const result = exportBoringData(panels, selectedFormat, {
        filePerPanel,
        includeDimensions,
      });

      setExportResult(result);

      if (result.success && result.files.length > 0) {
        // 파일 다운로드
        // 여러 파일이면 자동으로 ZIP 압축 (특히 MPR, CIX는 패널별 파일이므로)
        const shouldZip = result.files.length > 1;

        if (shouldZip) {
          // ZIP으로 다운로드
          await downloadCSVAsZip(
            result.files.map((f) => ({ filename: f.filename, content: f.content })),
            `boring_data_${selectedFormat}.zip`
          );
        } else {
          // 단일 파일 다운로드
          const file = result.files[0];
          switch (selectedFormat) {
            case 'csv':
              downloadCSV(file.content, file.filename);
              break;
            case 'dxf':
              downloadDXF(file.content, file.filename);
              break;
            case 'mpr':
              downloadMPR(file.content, file.filename);
              break;
            case 'cix':
              downloadCIX(file.content, file.filename);
              break;
          }
        }
      }
    } catch (error) {
      setExportResult({
        success: false,
        format: selectedFormat,
        files: [],
        summary: {
          totalPanels: 0,
          totalBorings: 0,
          boringsByType: {},
        },
        error: error instanceof Error ? error.message : '내보내기 실패',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const formatBoringType = (type: string): string => {
    const typeMap: Record<string, string> = {
      'hinge-cup': '힌지 컵홀',
      'hinge-screw': '힌지 나사홀',
      'cam-housing': '캠 하우징',
      'cam-bolt': '캠 볼트',
      'shelf-pin': '선반핀',
      'adjustable-foot': '조절발',
      'drawer-rail': '서랍레일',
      'drawer-rail-slot': '서랍레일 장공',
    };
    return typeMap[type] || type;
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>보링 데이터 내보내기</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.content}>
          {/* 패널 요약 */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>내보내기 대상</h3>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>패널 수</span>
                <span className={styles.summaryValue}>{panels.length}개</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>총 보링 수</span>
                <span className={styles.summaryValue}>
                  {panels.reduce((sum, p) => sum + p.borings.length, 0)}개
                </span>
              </div>
            </div>
          </div>

          {/* 포맷 선택 */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>내보내기 형식</h3>
            <div className={styles.formatGrid}>
              {SUPPORTED_EXPORT_FORMATS.map((format) => (
                <button
                  key={format.format}
                  className={`${styles.formatButton} ${
                    selectedFormat === format.format ? styles.formatButtonActive : ''
                  }`}
                  onClick={() => setSelectedFormat(format.format)}
                >
                  <span className={styles.formatName}>{format.name}</span>
                  <span className={styles.formatExt}>{format.extension}</span>
                </button>
              ))}
            </div>
            {selectedFormatInfo && (
              <div className={styles.formatInfo}>
                <p className={styles.formatDescription}>{selectedFormatInfo.description}</p>
                <p className={styles.formatSoftware}>
                  지원 소프트웨어: {selectedFormatInfo.software.join(', ')}
                </p>
              </div>
            )}
          </div>

          {/* 옵션 */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>옵션</h3>
            <div className={styles.optionsList}>
              <label className={styles.option}>
                <input
                  type="checkbox"
                  checked={filePerPanel}
                  onChange={(e) => setFilePerPanel(e.target.checked)}
                />
                <span>패널별 개별 파일 생성</span>
              </label>
              {selectedFormat === 'dxf' && (
                <label className={styles.option}>
                  <input
                    type="checkbox"
                    checked={includeDimensions}
                    onChange={(e) => setIncludeDimensions(e.target.checked)}
                  />
                  <span>치수 포함</span>
                </label>
              )}
              {filePerPanel && panels.length > 1 && (
                <p className={styles.optionNote}>
                  ※ 패널이 여러 개인 경우 ZIP 파일로 자동 압축됩니다
                </p>
              )}
            </div>
          </div>

          {/* 결과 */}
          {exportResult && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>내보내기 결과</h3>
              {exportResult.success ? (
                <div className={styles.resultSuccess}>
                  <div className={styles.resultIcon}>✓</div>
                  <div className={styles.resultText}>
                    <p className={styles.resultTitle}>내보내기 완료!</p>
                    <p className={styles.resultDetail}>
                      {exportResult.files.length}개 파일 생성됨
                    </p>
                    <div className={styles.resultStats}>
                      <span>패널: {exportResult.summary.totalPanels}개</span>
                      <span>보링: {exportResult.summary.totalBorings}개</span>
                    </div>
                    {Object.keys(exportResult.summary.boringsByType).length > 0 && (
                      <div className={styles.boringTypeBreakdown}>
                        {Object.entries(exportResult.summary.boringsByType).map(([type, count]) => (
                          <span key={type} className={styles.boringTypeItem}>
                            {formatBoringType(type)}: {count}개
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className={styles.resultError}>
                  <div className={styles.resultIcon}>✕</div>
                  <div className={styles.resultText}>
                    <p className={styles.resultTitle}>내보내기 실패</p>
                    <p className={styles.resultDetail}>{exportResult.error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            닫기
          </button>
          <button
            className={styles.exportButton}
            onClick={handleExport}
            disabled={isExporting || panels.length === 0}
          >
            {isExporting ? '내보내는 중...' : '내보내기'}
          </button>
        </div>
      </div>
    </>
  );
};

export default BoringExportDialog;

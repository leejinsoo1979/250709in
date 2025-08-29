import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';
import { usePDFExport } from '@/editor/shared/hooks/usePDFExport';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import styles from './PDFDownloadModal.module.css';

interface PDFDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PDFDownloadModal: React.FC<PDFDownloadModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { exportToPDF } = usePDFExport();
  const { spaceInfo } = useSpaceConfigStore();
  const { placedModules } = useFurnitureStore();
  
  const [selectedViews, setSelectedViews] = useState<string[]>(['3d-front', '2d-top', '2d-front']);
  const [isGenerating, setIsGenerating] = useState(false);

  const viewOptions = [
    { id: '3d-front', label: '3D 정면뷰' },
    { id: '3d-iso', label: '3D ISO뷰' },
    { id: '2d-top', label: '2D 상부뷰' },
    { id: '2d-front', label: '2D 정면뷰' },
    { id: '2d-side', label: '2D 측면뷰' },
  ];

  const handleToggleView = (viewId: string) => {
    setSelectedViews(prev => {
      if (prev.includes(viewId)) {
        return prev.filter(id => id !== viewId);
      }
      return [...prev, viewId];
    });
  };

  const handleDownload = async () => {
    if (selectedViews.length === 0) {
      alert('최소 하나의 뷰를 선택해주세요.');
      return;
    }

    setIsGenerating(true);
    try {
      const result = await exportToPDF(spaceInfo, placedModules, selectedViews as any, 'solid');
      
      if (result.success) {
        console.log('✅ PDF 다운로드 성공:', result.filename);
        onClose();
      } else {
        alert(`PDF 생성 실패: ${result.message}`);
      }
    } catch (error) {
      console.error('PDF 다운로드 오류:', error);
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>PDF 다운로드</h2>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>다운로드할 뷰 선택</h3>
            <div className={styles.viewGrid}>
              {viewOptions.map(view => (
                <label key={view.id} className={styles.viewOption}>
                  <input
                    type="checkbox"
                    checked={selectedViews.includes(view.id)}
                    onChange={() => handleToggleView(view.id)}
                    className={styles.checkbox}
                  />
                  <span className={styles.viewLabel}>{view.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.selectedInfo}>
            선택된 뷰: {selectedViews.length}개
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            취소
          </button>
          <button 
            className={styles.downloadButton} 
            onClick={handleDownload}
            disabled={isGenerating || selectedViews.length === 0}
          >
            {isGenerating ? '생성 중...' : 'PDF 다운로드'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PDFDownloadModal;
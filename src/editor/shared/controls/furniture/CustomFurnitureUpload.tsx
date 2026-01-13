import React, { useRef, useState, useCallback } from 'react';
import { useCustomFurnitureLoader } from '@/editor/shared/hooks/useCustomFurnitureLoader';
import { useCustomFurnitureStore } from '@/store/core/customFurnitureStore';
import styles from './CustomFurnitureUpload.module.css';

interface CustomFurnitureUploadProps {
  onClose?: () => void;
  onSuccess?: () => void;
}

const CustomFurnitureUpload: React.FC<CustomFurnitureUploadProps> = ({
  onClose,
  onSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { loadCustomFurniture } = useCustomFurnitureLoader();
  const { isLoading, loadingProgress, error } = useCustomFurnitureStore();

  const [isDragOver, setIsDragOver] = useState(false);
  const [customName, setCustomName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState<'full' | 'upper' | 'lower'>('full');
  const [scaleMode, setScaleMode] = useState<'uniform' | 'non-uniform' | 'fixed'>('non-uniform');

  // 파일 선택 핸들러
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      const validExtensions = ['.dae', '.glb', '.gltf', '.obj'];
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();

      if (!validExtensions.includes(extension)) {
        alert('지원하지 않는 파일 형식입니다.\n지원 형식: DAE, GLB, GLTF, OBJ');
        return;
      }

      setSelectedFile(file);
      setCustomName(file.name.replace(/\.[^/.]+$/, ''));
    }
  }, []);

  // 드래그 앤 드롭 핸들러
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  // 파일 업로드 버튼 클릭
  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 파일 입력 변경
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
  }, [handleFileSelect]);

  // 가구 추가 실행
  const handleSubmit = useCallback(async () => {
    if (!selectedFile) {
      alert('파일을 선택해주세요.');
      return;
    }

    const result = await loadCustomFurniture(selectedFile, {
      name: customName || selectedFile.name.replace(/\.[^/.]+$/, ''),
      category,
      scaleMode,
    });

    if (result.success) {
      onSuccess?.();
      onClose?.();
    }
  }, [selectedFile, customName, category, scaleMode, loadCustomFurniture, onSuccess, onClose]);

  // 취소
  const handleCancel = useCallback(() => {
    setSelectedFile(null);
    setCustomName('');
    onClose?.();
  }, [onClose]);

  return (
    <div className={styles.uploadContainer}>
      <div className={styles.header}>
        <h3>커스텀 가구 추가</h3>
        <button className={styles.closeButton} onClick={handleCancel}>
          ×
        </button>
      </div>

      <div className={styles.content}>
        {/* 파일 드롭존 */}
        <div
          className={`${styles.dropzone} ${isDragOver ? styles.dragOver : ''} ${selectedFile ? styles.hasFile : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleBrowseClick}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".dae,.glb,.gltf,.obj"
            onChange={handleInputChange}
            style={{ display: 'none' }}
          />

          {selectedFile ? (
            <div className={styles.selectedFile}>
              <span className={styles.fileIcon}>📦</span>
              <span className={styles.fileName}>{selectedFile.name}</span>
              <span className={styles.fileSize}>
                ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </span>
            </div>
          ) : (
            <div className={styles.dropzoneContent}>
              <span className={styles.uploadIcon}>📁</span>
              <p>3D 파일을 드래그하거나 클릭하여 선택</p>
              <span className={styles.supportedFormats}>
                지원 형식: DAE, GLB, GLTF, OBJ
              </span>
            </div>
          )}
        </div>

        {/* 설정 옵션 */}
        {selectedFile && (
          <div className={styles.options}>
            {/* 이름 입력 */}
            <div className={styles.optionGroup}>
              <label>가구 이름</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="커스텀 가구 이름"
              />
            </div>

            {/* 카테고리 선택 */}
            <div className={styles.optionGroup}>
              <label>카테고리</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as 'full' | 'upper' | 'lower')}
              >
                <option value="full">전체장 (Full)</option>
                <option value="upper">상부장 (Upper)</option>
                <option value="lower">하부장 (Lower)</option>
              </select>
            </div>

            {/* 스케일 모드 */}
            <div className={styles.optionGroup}>
              <label>크기 조정 방식</label>
              <select
                value={scaleMode}
                onChange={(e) => setScaleMode(e.target.value as 'uniform' | 'non-uniform' | 'fixed')}
              >
                <option value="non-uniform">비균등 (슬롯에 맞춤)</option>
                <option value="uniform">균등 (비율 유지)</option>
                <option value="fixed">고정 (원본 크기)</option>
              </select>
              <span className={styles.optionHint}>
                {scaleMode === 'non-uniform' && '슬롯 크기에 맞게 각 축 독립 조정'}
                {scaleMode === 'uniform' && '비율을 유지하며 크기 조정'}
                {scaleMode === 'fixed' && '원본 크기 그대로 배치'}
              </span>
            </div>
          </div>
        )}

        {/* 로딩 상태 */}
        {isLoading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.loadingContent}>
              <div className={styles.spinner}></div>
              <p>불러오는 중... {loadingProgress}%</p>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${loadingProgress}%` }}
                ></div>
              </div>
            </div>
          </div>
        )}

        {/* 에러 메시지 */}
        {error && (
          <div className={styles.errorMessage}>
            <span>⚠️</span>
            {error}
          </div>
        )}

        {/* 안내 메시지 */}
        <div className={styles.infoBox}>
          <h4>📋 패널 명명 규칙</h4>
          <p>
            SketchUp에서 각 패널 그룹에 다음 이름을 지정하면 자동 인식됩니다:
          </p>
          <ul>
            <li><code>LeftPanel</code>, <code>RightPanel</code> - 측면판</li>
            <li><code>TopPanel</code>, <code>BottomPanel</code> - 상/하판</li>
            <li><code>BackPanel</code> - 백패널</li>
            <li><code>Shelf_1</code>, <code>Shelf_2</code> - 선반</li>
            <li><code>Drawer_1</code>, <code>Drawer_2</code> - 서랍</li>
          </ul>
          <a href="#" className={styles.guideLink}>
            전체 가이드 보기 →
          </a>
        </div>
      </div>

      {/* 버튼 */}
      <div className={styles.footer}>
        <button
          className={styles.cancelButton}
          onClick={handleCancel}
          disabled={isLoading}
        >
          취소
        </button>
        <button
          className={styles.submitButton}
          onClick={handleSubmit}
          disabled={!selectedFile || isLoading}
        >
          {isLoading ? '불러오는 중...' : '추가하기'}
        </button>
      </div>
    </div>
  );
};

export default CustomFurnitureUpload;

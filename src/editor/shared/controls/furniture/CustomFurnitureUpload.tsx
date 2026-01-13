import React, { useRef, useState, useCallback } from 'react';
import { useCustomFurnitureLoader } from '@/editor/shared/hooks/useCustomFurnitureLoader';
import { useCustomFurnitureStore } from '@/store/core/customFurnitureStore';
import styles from './CustomFurnitureUpload.module.css';

interface CustomFurnitureUploadProps {
  onClose?: () => void;
  onSuccess?: () => void;
}

// 썸네일 사이즈 상수
const THUMBNAIL_SIZE = {
  width: 200,
  height: 200,
  maxFileSize: 2 * 1024 * 1024, // 2MB
};

const CustomFurnitureUpload: React.FC<CustomFurnitureUploadProps> = ({
  onClose,
  onSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const { loadCustomFurniture } = useCustomFurnitureLoader();
  const { isLoading, loadingProgress, error } = useCustomFurnitureStore();

  const [isDragOver, setIsDragOver] = useState(false);
  const [isThumbnailDragOver, setIsThumbnailDragOver] = useState(false);
  const [customName, setCustomName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [category, setCategory] = useState<'full' | 'upper' | 'lower'>('full');
  const [scaleMode, setScaleMode] = useState<'uniform' | 'non-uniform' | 'fixed'>('non-uniform');

  // 3D 파일 선택 핸들러
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

  // 썸네일 파일 선택 핸들러
  const handleThumbnailSelect = useCallback((files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();

      if (!validExtensions.includes(extension)) {
        alert('지원하지 않는 이미지 형식입니다.\n지원 형식: JPG, PNG, WEBP');
        return;
      }

      if (file.size > THUMBNAIL_SIZE.maxFileSize) {
        alert(`파일 크기가 너무 큽니다.\n최대 ${THUMBNAIL_SIZE.maxFileSize / 1024 / 1024}MB까지 지원합니다.`);
        return;
      }

      setThumbnailFile(file);

      // 미리보기 생성
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // 캔버스로 리사이즈
          const canvas = document.createElement('canvas');
          canvas.width = THUMBNAIL_SIZE.width;
          canvas.height = THUMBNAIL_SIZE.height;
          const ctx = canvas.getContext('2d');

          if (ctx) {
            // 비율 유지하며 중앙 정렬
            const scale = Math.max(
              THUMBNAIL_SIZE.width / img.width,
              THUMBNAIL_SIZE.height / img.height
            );
            const scaledWidth = img.width * scale;
            const scaledHeight = img.height * scale;
            const x = (THUMBNAIL_SIZE.width - scaledWidth) / 2;
            const y = (THUMBNAIL_SIZE.height - scaledHeight) / 2;

            ctx.fillStyle = '#f5f5f5';
            ctx.fillRect(0, 0, THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height);
            ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

            setThumbnailPreview(canvas.toDataURL('image/png'));
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // 3D 파일 드래그 앤 드롭 핸들러
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

  // 썸네일 드래그 앤 드롭 핸들러
  const handleThumbnailDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsThumbnailDragOver(true);
  }, []);

  const handleThumbnailDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsThumbnailDragOver(false);
  }, []);

  const handleThumbnailDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsThumbnailDragOver(false);
    handleThumbnailSelect(e.dataTransfer.files);
  }, [handleThumbnailSelect]);

  // 3D 파일 업로드 버튼 클릭
  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 썸네일 업로드 버튼 클릭
  const handleThumbnailBrowseClick = useCallback(() => {
    thumbnailInputRef.current?.click();
  }, []);

  // 파일 입력 변경
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
  }, [handleFileSelect]);

  // 썸네일 입력 변경
  const handleThumbnailInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleThumbnailSelect(e.target.files);
  }, [handleThumbnailSelect]);

  // 썸네일 삭제
  const handleRemoveThumbnail = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setThumbnailFile(null);
    setThumbnailPreview(null);
    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = '';
    }
  }, []);

  // 가구 추가 실행
  const handleSubmit = useCallback(async () => {
    if (!selectedFile) {
      alert('3D 파일을 선택해주세요.');
      return;
    }

    const result = await loadCustomFurniture(selectedFile, {
      name: customName || selectedFile.name.replace(/\.[^/.]+$/, ''),
      category,
      scaleMode,
      customThumbnail: thumbnailPreview || undefined,
    });

    if (result.success) {
      onSuccess?.();
      onClose?.();
    }
  }, [selectedFile, customName, category, scaleMode, thumbnailPreview, loadCustomFurniture, onSuccess, onClose]);

  // 취소
  const handleCancel = useCallback(() => {
    setSelectedFile(null);
    setThumbnailFile(null);
    setThumbnailPreview(null);
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
        {/* 업로드 영역 컨테이너 */}
        <div className={styles.uploadAreas}>
          {/* 3D 파일 드롭존 */}
          <div className={styles.uploadAreaWrapper}>
            <label className={styles.uploadLabel}>3D 모델 파일 *</label>
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
                  <svg className={styles.fileIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                  <span className={styles.fileName}>{selectedFile.name}</span>
                  <span className={styles.fileSize}>
                    ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                </div>
              ) : (
                <div className={styles.dropzoneContent}>
                  <svg className={styles.uploadIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                  <p>3D 파일 선택</p>
                  <span className={styles.supportedFormats}>
                    DAE, GLB, GLTF, OBJ
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 썸네일 드롭존 */}
          <div className={styles.uploadAreaWrapper}>
            <label className={styles.uploadLabel}>
              썸네일 이미지
              <span className={styles.optionalBadge}>선택</span>
            </label>
            <div
              className={`${styles.dropzone} ${styles.thumbnailDropzone} ${isThumbnailDragOver ? styles.dragOver : ''} ${thumbnailPreview ? styles.hasFile : ''}`}
              onDragOver={handleThumbnailDragOver}
              onDragLeave={handleThumbnailDragLeave}
              onDrop={handleThumbnailDrop}
              onClick={handleThumbnailBrowseClick}
            >
              <input
                ref={thumbnailInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={handleThumbnailInputChange}
                style={{ display: 'none' }}
              />

              {thumbnailPreview ? (
                <div className={styles.thumbnailPreview}>
                  <img src={thumbnailPreview} alt="썸네일 미리보기" />
                  <button
                    className={styles.removeThumbnailButton}
                    onClick={handleRemoveThumbnail}
                    title="썸네일 삭제"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className={styles.dropzoneContent}>
                  <svg className={styles.uploadIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <p>이미지 선택</p>
                  <span className={styles.supportedFormats}>
                    {THUMBNAIL_SIZE.width}×{THUMBNAIL_SIZE.height}px
                  </span>
                  <span className={styles.supportedFormats}>
                    JPG, PNG, WEBP
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 설정 옵션 */}
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

          <div className={styles.optionRow}>
            {/* 카테고리 선택 */}
            <div className={styles.optionGroup}>
              <label>카테고리</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as 'full' | 'upper' | 'lower')}
              >
                <option value="full">전체장</option>
                <option value="upper">상부장</option>
                <option value="lower">하부장</option>
              </select>
            </div>

            {/* 스케일 모드 */}
            <div className={styles.optionGroup}>
              <label>크기 조정</label>
              <select
                value={scaleMode}
                onChange={(e) => setScaleMode(e.target.value as 'uniform' | 'non-uniform' | 'fixed')}
              >
                <option value="non-uniform">슬롯 맞춤</option>
                <option value="uniform">비율 유지</option>
                <option value="fixed">원본 크기</option>
              </select>
            </div>
          </div>
        </div>

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
            <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}
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

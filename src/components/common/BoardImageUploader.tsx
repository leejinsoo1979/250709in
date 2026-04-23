import React, { useRef, useState } from 'react';
import { uploadBoardImage } from '@/firebase/storage';

interface Props {
  value: string[]; // 이미지 URL 배열
  onChange: (urls: string[]) => void;
  prefix: 'news' | 'qna';
  disabled?: boolean;
  max?: number; // 최대 장수 (기본 10)
}

/**
 * 게시판 본문에 첨부할 이미지 업로드 컴포넌트.
 * 썸네일 그리드 + 파일 선택 + 삭제 지원.
 */
const BoardImageUploader: React.FC<Props> = ({ value, onChange, prefix, disabled, max = 10 }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSelect = () => {
    if (disabled || uploading) return;
    fileInputRef.current?.click();
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // 같은 파일 재선택 허용
    if (files.length === 0) return;

    const remaining = max - value.length;
    if (remaining <= 0) {
      setErr(`최대 ${max}장까지 첨부할 수 있습니다.`);
      return;
    }
    const toUpload = files.slice(0, remaining);

    setUploading(true);
    setErr(null);
    try {
      const urls: string[] = [];
      for (const f of toUpload) {
        const url = await uploadBoardImage(f, prefix);
        urls.push(url);
      }
      onChange([...value, ...urls]);
    } catch (e: any) {
      setErr(e?.message || '업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (idx: number) => {
    const next = value.filter((_, i) => i !== idx);
    onChange(next);
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        style={{ display: 'none' }}
        onChange={handleFiles}
        disabled={disabled || uploading}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {value.map((url, idx) => (
          <div
            key={url + idx}
            style={{
              position: 'relative',
              width: 96,
              height: 96,
              borderRadius: 6,
              overflow: 'hidden',
              border: '1px solid var(--theme-border, #e0e0e0)',
              background: '#f5f5f5',
            }}
          >
            <img
              src={url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              disabled={disabled}
              title="삭제"
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(0,0,0,0.65)',
                color: '#fff',
                fontSize: 13,
                lineHeight: '20px',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >×</button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleSelect}
        disabled={disabled || uploading || value.length >= max}
        style={{
          padding: '8px 14px',
          fontSize: 13,
          border: '1px dashed var(--theme-border, #bbb)',
          borderRadius: 6,
          background: 'transparent',
          color: 'var(--theme-text-secondary, #555)',
          cursor: disabled || uploading ? 'not-allowed' : 'pointer',
        }}
      >
        {uploading ? '업로드 중...' : `+ 이미지 추가 (${value.length}/${max})`}
      </button>

      {err && (
        <div style={{ color: '#d32f2f', fontSize: 12, marginTop: 6 }}>{err}</div>
      )}
    </div>
  );
};

export default BoardImageUploader;

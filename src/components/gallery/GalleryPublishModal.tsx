import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { publishToGallery, unpublishFromGallery, getGalleryPost, GalleryPost } from '@/firebase/gallery';

interface Props {
  open: boolean;
  onClose: () => void;
  designFileId: string;
  designFileName: string;
  projectId: string;
  thumbnail?: string;
  dimensions?: { width: number; height: number; depth: number };
}

export default function GalleryPublishModal({
  open,
  onClose,
  designFileId,
  designFileName,
  projectId,
  thumbnail,
  dimensions,
}: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [existing, setExisting] = useState<GalleryPost | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !designFileId) return;
    let mounted = true;
    getGalleryPost(designFileId).then(post => {
      if (!mounted) return;
      setExisting(post);
      setTitle(post?.title || designFileName || '');
      setDescription(post?.description || '');
    });
    return () => { mounted = false; };
  }, [open, designFileId, designFileName]);

  if (!open) return null;

  const onPublish = async () => {
    if (!user) { alert('로그인이 필요합니다'); return; }
    if (!title.trim()) { alert('제목을 입력하세요'); return; }
    setLoading(true);
    try {
      await publishToGallery({
        designFileId,
        projectId,
        userId: user.uid,
        userName: user.displayName || user.email || '익명',
        title: title.trim(),
        description: description.trim(),
        thumbnail: thumbnail || '',
        dimensions,
      });
      alert('갤러리에 게시되었습니다');
      onClose();
    } catch (e: any) {
      alert('게시 실패: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  const onUnpublish = async () => {
    if (!confirm('갤러리에서 게시 해제하시겠습니까?')) return;
    setLoading(true);
    try {
      await unpublishFromGallery(designFileId, true);
      alert('게시 해제되었습니다');
      onClose();
    } catch (e: any) {
      alert('해제 실패: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--theme-surface, #1e1e1e)',
          color: 'var(--theme-text, #fff)',
          borderRadius: 10, padding: 24, width: 480, maxWidth: '90vw',
          border: '1px solid var(--theme-border, #333)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 }}>
          {existing?.isPublic ? '갤러리 게시 정보 수정' : '갤러리 게시'}
        </h2>

        {thumbnail && (
          <div style={{ marginBottom: 16 }}>
            <img
              src={thumbnail}
              alt=""
              style={{
                width: '100%', height: 180, objectFit: 'cover',
                borderRadius: 6, background: '#2a2a2a',
              }}
            />
          </div>
        )}

        <label style={{ display: 'block', fontSize: 12, color: 'var(--theme-text-secondary, #888)', marginBottom: 4 }}>
          제목
        </label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="갤러리에 표시될 제목"
          style={{
            width: '100%', padding: '8px 10px', marginBottom: 12,
            border: '1px solid var(--theme-border, #333)', borderRadius: 4,
            background: 'var(--theme-background, #141414)', color: 'inherit',
            boxSizing: 'border-box', fontSize: 13,
          }}
        />

        <label style={{ display: 'block', fontSize: 12, color: 'var(--theme-text-secondary, #888)', marginBottom: 4 }}>
          설명 (선택)
        </label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="이 디자인에 대한 설명을 입력하세요"
          rows={4}
          style={{
            width: '100%', padding: '8px 10px', marginBottom: 16,
            border: '1px solid var(--theme-border, #333)', borderRadius: 4,
            background: 'var(--theme-background, #141414)', color: 'inherit',
            boxSizing: 'border-box', fontSize: 13, resize: 'vertical',
          }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {existing?.isPublic && (
            <button
              onClick={onUnpublish}
              disabled={loading}
              style={{
                padding: '8px 14px', borderRadius: 4, border: '1px solid #ef4444',
                background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 13,
              }}
            >
              게시 해제
            </button>
          )}
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '8px 14px', borderRadius: 4, border: '1px solid var(--theme-border, #333)',
              background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 13,
            }}
          >
            취소
          </button>
          <button
            onClick={onPublish}
            disabled={loading}
            style={{
              padding: '8px 14px', borderRadius: 4, border: 'none',
              background: 'var(--theme-primary, #3b82f6)', color: '#fff', cursor: 'pointer', fontSize: 13,
              fontWeight: 600,
            }}
          >
            {loading ? '처리 중...' : (existing?.isPublic ? '수정' : '게시')}
          </button>
        </div>
      </div>
    </div>
  );
}

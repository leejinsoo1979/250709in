import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Eye, Heart, ArrowLeft } from 'lucide-react';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import {
  GalleryPost,
  getGalleryPost,
  incrementGalleryLike,
  incrementGalleryView,
} from '@/firebase/gallery';
import { getDesignFileByIdPublic } from '@/firebase/projects';
import Space3DViewerReadOnly from '@/editor/shared/viewer3d/Space3DViewerReadOnly';

export default function GalleryDetailPage() {
  const navigate = useNavigate();
  const { postId } = useParams<{ postId: string }>();
  const [post, setPost] = useState<GalleryPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [designFile, setDesignFile] = useState<any>(null);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    (async () => {
      try {
        const p = await getGalleryPost(postId);
        if (!p || !p.isPublic) {
          setError('게시물을 찾을 수 없습니다');
          return;
        }
        setPost(p);
        await incrementGalleryView(postId).catch(() => {});
        const res = await getDesignFileByIdPublic(p.designFileId);
        setDesignFile(res.designFile);
      } catch (e: any) {
        setError(e?.message || '로드 실패');
      } finally {
        setLoading(false);
      }
    })();
  }, [postId]);

  const onLike = async () => {
    if (!postId || liked) return;
    setLiked(true);
    setPost(prev => prev ? { ...prev, likes: prev.likes + 1 } : prev);
    try { await incrementGalleryLike(postId, 1); } catch {}
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--theme-background, #0f0f0f)', color: 'var(--theme-text, #fff)' }}>
      <DashboardHeader onLogoClick={() => navigate('/dashboard')} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 32px' }}>
        <button
          onClick={() => navigate('/gallery')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 4,
            border: '1px solid var(--theme-border, #333)', background: 'transparent', color: 'inherit',
            fontSize: 13, cursor: 'pointer', marginBottom: 16,
          }}
        >
          <ArrowLeft size={14} /> 갤러리로
        </button>

        {loading && (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--theme-text-secondary, #888)' }}>
            불러오는 중...
          </div>
        )}
        {error && (
          <div style={{ padding: 48, textAlign: 'center', color: '#ef4444' }}>{error}</div>
        )}

        {post && !loading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
            {/* 3D 뷰어 */}
            <div style={{
              width: '100%', height: 640,
              background: '#1a1a1a', borderRadius: 8, overflow: 'hidden',
              border: '1px solid var(--theme-border, #333)',
            }}>
              {designFile ? (
                <Space3DViewerReadOnly
                  spaceConfig={designFile.spaceConfig || designFile.spaceInfo}
                  placedModules={designFile.furniture?.placedModules || designFile.placedModules || []}
                  viewMode="3D"
                  cameraMode="perspective"
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
                  디자인 파일을 불러올 수 없습니다
                </div>
              )}
            </div>

            {/* 메타 */}
            <aside>
              <h1 style={{ margin: 0, marginBottom: 8, fontSize: 22, fontWeight: 700 }}>{post.title}</h1>
              <div style={{ fontSize: 13, color: 'var(--theme-text-secondary, #888)', marginBottom: 16 }}>
                by {post.userName}
                {post.dimensions && (
                  <div style={{ marginTop: 4 }}>
                    {post.dimensions.width} × {post.dimensions.height} × {post.dimensions.depth} mm
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 13, color: 'var(--theme-text-secondary, #888)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Eye size={14} /> {post.views}
                </span>
                <button
                  onClick={onLike}
                  disabled={liked}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 4,
                    border: '1px solid var(--theme-border, #333)',
                    background: liked ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
                    color: liked ? '#ef4444' : 'inherit',
                    fontSize: 13, cursor: liked ? 'default' : 'pointer',
                  }}
                >
                  <Heart size={14} fill={liked ? '#ef4444' : 'none'} /> {post.likes}
                </button>
              </div>

              {post.description && (
                <div style={{
                  padding: 12, borderRadius: 6,
                  background: 'var(--theme-surface, #1e1e1e)',
                  border: '1px solid var(--theme-border, #333)',
                  fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {post.description}
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

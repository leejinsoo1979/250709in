import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Heart, MessageCircle } from 'lucide-react';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import { listPublicGalleryPosts, getCommentCounts, GalleryPost } from '@/firebase/gallery';

export default function GalleryPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<GalleryPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'latest' | 'likes' | 'views'>('latest');
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    setLoading(true);
    listPublicGalleryPosts({ sortBy, limit: 60 })
      .then(async (list) => {
        setPosts(list);
        if (list.length > 0) {
          try {
            const counts = await getCommentCounts(list.map(p => p.id));
            setCommentCounts(counts);
          } catch (e) { console.error('댓글 수 로드 실패', e); }
        }
      })
      .catch(err => console.error('갤러리 로드 실패', err))
      .finally(() => setLoading(false));
  }, [sortBy]);

  const onCardClick = (post: GalleryPost) => {
    navigate(`/gallery/${post.id}`);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--theme-background, #0f0f0f)', color: 'var(--theme-text, #fff)' }}>
      <DashboardHeader onLogoClick={() => navigate('/dashboard')} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>갤러리</h1>
          <div style={{ display: 'inline-flex', gap: 4 }}>
            {([
              { k: 'latest', label: '최신' },
              { k: 'likes', label: '인기' },
              { k: 'views', label: '조회' },
            ] as const).map(opt => (
              <button
                key={opt.k}
                onClick={() => setSortBy(opt.k)}
                style={{
                  padding: '6px 14px', borderRadius: 6,
                  border: '1px solid var(--theme-border, #333)',
                  background: sortBy === opt.k ? 'var(--theme-primary, #3b82f6)' : 'transparent',
                  color: sortBy === opt.k ? '#fff' : 'inherit',
                  fontSize: 13, fontWeight: sortBy === opt.k ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--theme-text-secondary, #888)' }}>불러오는 중...</div>
        ) : posts.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--theme-text-secondary, #888)' }}>
            아직 게시된 디자인이 없습니다.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            {posts.map(post => (
              <div
                key={post.id}
                onClick={() => onCardClick(post)}
                style={{
                  background: 'var(--theme-surface, #1e1e1e)',
                  border: '1px solid var(--theme-border, #333)',
                  borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                  transition: 'transform 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.borderColor = 'var(--theme-primary, #3b82f6)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = 'var(--theme-border, #333)';
                }}
              >
                <div
                  style={{
                    width: '100%', aspectRatio: '4 / 3',
                    background: post.thumbnail ? `#2a2a2a url(${post.thumbnail}) center/cover no-repeat` : '#2a2a2a',
                  }}
                />
                <div style={{ padding: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {post.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--theme-text-secondary, #888)', marginBottom: 8 }}>
                    {post.userName}
                    {post.dimensions && ` · ${post.dimensions.width}×${post.dimensions.height}×${post.dimensions.depth}`}
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--theme-text-secondary, #888)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Eye size={12} /> {post.views}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Heart size={12} /> {post.likes}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <MessageCircle size={12} /> {commentCounts[post.id] || 0}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

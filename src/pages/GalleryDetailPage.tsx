import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Eye, Heart, ArrowLeft } from 'lucide-react';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import {
  GalleryPost,
  GalleryComment,
  getGalleryPost,
  incrementGalleryLike,
  incrementGalleryView,
  listGalleryComments,
  addGalleryComment,
  deleteGalleryComment,
} from '@/firebase/gallery';
import { useAuth } from '@/auth/AuthProvider';
import { getDesignFileByIdPublic } from '@/firebase/projects';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';

export default function GalleryDetailPage() {
  const navigate = useNavigate();
  const { postId } = useParams<{ postId: string }>();
  const [post, setPost] = useState<GalleryPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [designFile, setDesignFile] = useState<any>(null);
  const [liked, setLiked] = useState(false);
  const [comments, setComments] = useState<GalleryComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [doorsOpen, setDoorsOpenLocal] = useState(false);
  const { user } = useAuth();

  const { setSpaceInfo, resetSpaceInfo } = useSpaceConfigStore();
  const { setPlacedModules } = useFurnitureStore();
  const viewMode = useUIStore(s => s.viewMode);
  const setViewMode = useUIStore(s => s.setViewMode);

  const [viewerReady, setViewerReady] = useState(false);

  // 마운트 즉시 store 값 false로 설정 후 뷰어 활성화
  useEffect(() => {
    const ui: any = useUIStore.getState();
    const prev = { showDimensions: ui.showDimensions, doorsOpen: ui.doorsOpen };
    ui.setShowDimensions && ui.setShowDimensions(false);
    ui.setDoorsOpen && ui.setDoorsOpen(false);
    setViewerReady(true);
    return () => {
      const u: any = useUIStore.getState();
      u.setShowDimensions && u.setShowDimensions(prev.showDimensions);
      u.setDoorsOpen && u.setDoorsOpen(prev.doorsOpen);
    };
  }, []);

  // store.showDimensions가 진입 후에도 true로 돌아가면 다시 false 강제
  const storeShowDim = useUIStore(s => s.showDimensions);
  useEffect(() => {
    if (viewerReady && storeShowDim) {
      const ui: any = useUIStore.getState();
      ui.setShowDimensions && ui.setShowDimensions(false);
    }
  }, [storeShowDim, viewerReady]);

  const toggleDoors = () => {
    const next = !doorsOpen;
    setDoorsOpenLocal(next);
    const ui: any = useUIStore.getState();
    ui.setDoorsOpen && ui.setDoorsOpen(next);
  };

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
        // 스토어에 주입해서 Space3DView가 렌더할 수 있게 함
        if (res.designFile) {
          const spaceCfg = res.designFile.spaceConfig || (res.designFile as any).spaceInfo;
          const modules = res.designFile.furniture?.placedModules || (res.designFile as any).placedModules || [];
          // 이전 사용자 설정(재질/색상 등) 초기화 후 저장된 값 완전 적용
          resetSpaceInfo && resetSpaceInfo();
          if (spaceCfg) setSpaceInfo(spaceCfg);
          setPlacedModules(modules);
          setViewMode('3D');
        }
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

  // 댓글 로드
  useEffect(() => {
    if (!postId) return;
    listGalleryComments(postId).then(setComments).catch(e => console.error('댓글 로드 실패', e));
  }, [postId]);

  const onSubmitComment = async (parentId: string | null = null, textOverride?: string) => {
    const body = (textOverride ?? (parentId ? replyText : commentText)).trim();
    if (!postId || !user || !body || commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      const id = await addGalleryComment({
        postId,
        parentId,
        userId: user.uid,
        userName: user.displayName || user.email || '익명',
        userPhotoURL: user.photoURL || undefined,
        text: body,
      });
      const newComment: GalleryComment = {
        id,
        postId,
        parentId,
        userId: user.uid,
        userName: user.displayName || user.email || '익명',
        userPhotoURL: user.photoURL || undefined,
        text: body,
        createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
        updatedAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
      };
      setComments(prev => [newComment, ...prev]);
      if (parentId) {
        setReplyText('');
        setReplyingTo(null);
      } else {
        setCommentText('');
      }
    } catch (e) {
      console.error('댓글 작성 실패', e);
      alert('댓글 작성에 실패했습니다.');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const onDeleteComment = async (commentId: string) => {
    if (!confirm('댓글을 삭제하시겠습니까?')) return;
    try {
      await deleteGalleryComment(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (e) {
      console.error('댓글 삭제 실패', e);
      alert('댓글 삭제에 실패했습니다.');
    }
  };

  const formatDate = (ts: any) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts.seconds ? ts.seconds * 1000 : ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return '방금 전';
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffHour < 24) return `${diffHour}시간 전`;
    if (diffDay < 7) return `${diffDay}일 전`;
    return d.toLocaleDateString('ko-KR');
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>
            {/* 3D 뷰어 */}
            <div style={{
              width: '100%', height: 640,
              background: '#1a1a1a', borderRadius: 8, overflow: 'hidden',
              border: '1px solid var(--theme-border, #333)',
              position: 'relative',
            }}>
              {/* 뷰어 상단 중앙: 도어 Close/Open 토글 (pill) — 도어 달린 가구가 있을 때만 */}
              {designFile && (designFile.furniture?.placedModules || (designFile as any).placedModules || []).some((m: any) => m.hasDoor) && (
                <div
                  onClick={toggleDoors}
                  role="button"
                  style={{
                    position: 'absolute', top: 12, left: '50%',
                    transform: 'translateX(-50%)', zIndex: 10,
                    display: 'flex', alignItems: 'center',
                    height: 30, borderRadius: 999,
                    background: '#E5E7EB',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                    userSelect: 'none',
                    padding: 3, gap: 0,
                  }}
                >
                  <div style={{
                    padding: '0 14px', height: 24, minWidth: 54,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 999,
                    background: !doorsOpen ? '#6B5CFF' : 'transparent',
                    color: !doorsOpen ? '#FFFFFF' : '#6B7280',
                    fontSize: 11, fontWeight: 600,
                    transition: 'background 0.18s, color 0.18s',
                  }}>Close</div>
                  <div style={{
                    padding: '0 14px', height: 24, minWidth: 54,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 999,
                    background: doorsOpen ? '#6B5CFF' : 'transparent',
                    color: doorsOpen ? '#FFFFFF' : '#6B7280',
                    fontSize: 11, fontWeight: 600,
                    transition: 'background 0.18s, color 0.18s',
                  }}>Open</div>
                </div>
              )}
              {designFile && viewerReady ? (
                <Space3DView
                  spaceInfo={designFile.spaceConfig || (designFile as any).spaceInfo}
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                  renderMode="solid"
                  showAll={false}
                  showFrame={true}
                  showDimensions={false}
                  readOnly={true}
                  svgSize={{ width: 800, height: 640 }}
                />
              ) : !designFile ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
                  디자인 파일을 불러올 수 없습니다
                </div>
              ) : null}
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
                  marginBottom: 20,
                }}>
                  {post.description}
                </div>
              )}

              {/* 댓글 섹션 — 우측 aside 내부 */}
              <div style={{
                borderTop: '1px solid var(--theme-border, #333)',
                paddingTop: 16,
              }}>
                <h2 style={{ margin: 0, marginBottom: 12, fontSize: 15, fontWeight: 700 }}>
                  댓글 <span style={{ color: 'var(--theme-text-secondary, #888)', fontWeight: 400 }}>({comments.length})</span>
                </h2>

                {/* 댓글 작성 */}
                {user ? (
                  <div style={{
                    marginBottom: 16,
                    padding: 10, borderRadius: 8,
                    background: 'var(--theme-surface, #1e1e1e)',
                    border: '1px solid var(--theme-border, #333)',
                  }}>
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmitComment(null);
                      }}
                      placeholder="댓글을 입력하세요..."
                      rows={3}
                      style={{
                        width: '100%', resize: 'vertical', minHeight: 60,
                        padding: '8px 10px', borderRadius: 6,
                        border: '1px solid var(--theme-border, #333)',
                        background: 'var(--theme-background, #0f0f0f)',
                        color: 'inherit', fontSize: 13, lineHeight: 1.5,
                        outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                        marginBottom: 8,
                      }}
                    />
                    <button
                      onClick={() => onSubmitComment(null)}
                      disabled={!commentText.trim() || commentSubmitting}
                      style={{
                        width: '100%', padding: '8px 0', borderRadius: 6, border: 'none',
                        background: commentText.trim() && !commentSubmitting ? 'var(--theme-primary, #7C5CFF)' : 'var(--theme-border, #333)',
                        color: '#fff', fontSize: 13, fontWeight: 600,
                        cursor: commentText.trim() && !commentSubmitting ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {commentSubmitting ? '등록중...' : '등록'}
                    </button>
                  </div>
                ) : (
                  <div style={{
                    padding: 12, borderRadius: 8, marginBottom: 16,
                    background: 'var(--theme-surface, #1e1e1e)',
                    border: '1px solid var(--theme-border, #333)',
                    fontSize: 12, color: 'var(--theme-text-secondary, #888)', textAlign: 'center',
                  }}>
                    댓글은 <button onClick={() => navigate('/login')} style={{
                      background: 'none', border: 'none', color: 'var(--theme-primary, #7C5CFF)',
                      cursor: 'pointer', fontWeight: 600, padding: 0,
                    }}>로그인</button> 후 작성 가능
                  </div>
                )}

                {/* 댓글 목록 (트리: 최상위 + 대댓글) */}
                {comments.length === 0 ? (
                  <div style={{
                    padding: 20, textAlign: 'center',
                    color: 'var(--theme-text-secondary, #888)', fontSize: 12,
                  }}>
                    아직 댓글이 없습니다
                  </div>
                ) : (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 10,
                    maxHeight: 480, overflowY: 'auto', paddingRight: 4,
                  }}>
                    {comments
                      .filter(c => !c.parentId)
                      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                      .map(c => {
                        const replies = comments
                          .filter(r => r.parentId === c.id)
                          .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
                        return (
                          <div key={c.id} style={{
                            padding: 10, borderRadius: 8,
                            background: 'var(--theme-surface, #1e1e1e)',
                            border: '1px solid var(--theme-border, #333)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              {c.userPhotoURL ? (
                                <img src={c.userPhotoURL} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />
                              ) : (
                                <div style={{
                                  width: 24, height: 24, borderRadius: '50%',
                                  background: 'var(--theme-primary, #7C5CFF)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: '#fff', fontSize: 11, fontWeight: 600,
                                }}>{c.userName.charAt(0)}</div>
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.userName}</div>
                                <div style={{ fontSize: 10, color: 'var(--theme-text-secondary, #888)' }}>{formatDate(c.createdAt)}</div>
                              </div>
                              {user && user.uid === c.userId && (
                                <button
                                  onClick={() => onDeleteComment(c.id)}
                                  style={{
                                    background: 'none', border: 'none',
                                    color: 'var(--theme-text-secondary, #888)',
                                    fontSize: 11, cursor: 'pointer', padding: '2px 6px',
                                  }}
                                >삭제</button>
                              )}
                            </div>
                            <div style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 6 }}>
                              {c.text}
                            </div>
                            {user && (
                              <button
                                onClick={() => {
                                  setReplyingTo(replyingTo === c.id ? null : c.id);
                                  setReplyText('');
                                }}
                                style={{
                                  background: 'none', border: 'none',
                                  color: 'var(--theme-primary, #7C5CFF)',
                                  fontSize: 11, cursor: 'pointer', padding: 0, fontWeight: 600,
                                }}
                              >{replyingTo === c.id ? '취소' : '답글'}</button>
                            )}

                            {/* 답글 입력 */}
                            {replyingTo === c.id && user && (
                              <div style={{ marginTop: 8 }}>
                                <textarea
                                  value={replyText}
                                  onChange={(e) => setReplyText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmitComment(c.id);
                                  }}
                                  placeholder="답글을 입력하세요..."
                                  rows={2}
                                  autoFocus
                                  style={{
                                    width: '100%', resize: 'vertical', minHeight: 48,
                                    padding: '6px 8px', borderRadius: 6,
                                    border: '1px solid var(--theme-border, #333)',
                                    background: 'var(--theme-background, #0f0f0f)',
                                    color: 'inherit', fontSize: 12, lineHeight: 1.5,
                                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                                    marginBottom: 6,
                                  }}
                                />
                                <button
                                  onClick={() => onSubmitComment(c.id)}
                                  disabled={!replyText.trim() || commentSubmitting}
                                  style={{
                                    width: '100%', padding: '6px 0', borderRadius: 6, border: 'none',
                                    background: replyText.trim() && !commentSubmitting ? 'var(--theme-primary, #7C5CFF)' : 'var(--theme-border, #333)',
                                    color: '#fff', fontSize: 12, fontWeight: 600,
                                    cursor: replyText.trim() && !commentSubmitting ? 'pointer' : 'not-allowed',
                                  }}
                                >{commentSubmitting ? '등록중...' : '답글 등록'}</button>
                              </div>
                            )}

                            {/* 대댓글 목록 */}
                            {replies.length > 0 && (
                              <div style={{
                                marginTop: 10, paddingLeft: 12,
                                borderLeft: '2px solid var(--theme-border, #333)',
                                display: 'flex', flexDirection: 'column', gap: 8,
                              }}>
                                {replies.map(r => (
                                  <div key={r.id}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                      {r.userPhotoURL ? (
                                        <img src={r.userPhotoURL} alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} />
                                      ) : (
                                        <div style={{
                                          width: 20, height: 20, borderRadius: '50%',
                                          background: 'var(--theme-primary, #7C5CFF)',
                                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          color: '#fff', fontSize: 10, fontWeight: 600,
                                        }}>{r.userName.charAt(0)}</div>
                                      )}
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.userName}</div>
                                        <div style={{ fontSize: 9, color: 'var(--theme-text-secondary, #888)' }}>{formatDate(r.createdAt)}</div>
                                      </div>
                                      {user && user.uid === r.userId && (
                                        <button
                                          onClick={() => onDeleteComment(r.id)}
                                          style={{
                                            background: 'none', border: 'none',
                                            color: 'var(--theme-text-secondary, #888)',
                                            fontSize: 10, cursor: 'pointer', padding: '2px 6px',
                                          }}
                                        >삭제</button>
                                      )}
                                    </div>
                                    <div style={{ fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap', paddingLeft: 26 }}>
                                      {r.text}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

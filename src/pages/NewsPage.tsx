import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { useAdmin } from '@/hooks/useAdmin';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import BoardImageUploader from '@/components/common/BoardImageUploader';
import styles from './NewsPage.module.css';
import {
  listNews,
  getNews,
  createNews,
  updateNews,
  deleteNews,
  NewsItem,
  NewsCategory,
} from '@/firebase/news';

type Mode = 'list' | 'detail' | 'new' | 'edit';

interface Props {
  mode: Mode;
}

const formatDate = (ts: any) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const NewsPage: React.FC<Props> = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin(user, authLoading);

  const [items, setItems] = useState<NewsItem[]>([]);
  const [currentItem, setCurrentItem] = useState<NewsItem | null>(null);
  const [tab, setTab] = useState<'all' | NewsCategory>('all');
  const [loading, setLoading] = useState(true);

  // 폼 상태
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<NewsCategory>('notice');
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // 권한 체크: 작성/수정 모드는 관리자만 접근 가능 (조회는 모두 허용)
  useEffect(() => {
    const isWriteMode = mode === 'new' || mode === 'edit';
    if (isWriteMode && !authLoading && !adminLoading && !isAdmin) {
      navigate('/news', { replace: true });
    }
  }, [mode, authLoading, adminLoading, isAdmin, navigate]);

  // 목록 로드
  useEffect(() => {
    if (mode !== 'list') return;
    setLoading(true);
    listNews().then(({ items }) => {
      setItems(items);
      setLoading(false);
    });
  }, [mode]);

  // 상세 / 수정 로드
  useEffect(() => {
    if ((mode !== 'detail' && mode !== 'edit') || !id) return;
    setLoading(true);
    getNews(id).then(({ item }) => {
      if (item) {
        setCurrentItem(item);
        setTitle(item.title);
        setBody(item.body);
        setCategory(item.category);
        setImages(item.images || []);
      }
      setLoading(false);
    });
  }, [mode, id]);

  const filteredItems = useMemo(() => {
    if (tab === 'all') return items;
    return items.filter(i => i.category === tab);
  }, [items, tab]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }
    setSaving(true);
    if (mode === 'new') {
      const { id: newId, error } = await createNews({ title: title.trim(), body, category, images });
      setSaving(false);
      if (error || !newId) {
        alert('작성 실패: ' + (error || ''));
        return;
      }
      navigate(`/news/${newId}`);
    } else if (mode === 'edit' && id) {
      const { error } = await updateNews(id, { title: title.trim(), body, category, images });
      setSaving(false);
      if (error) {
        alert('수정 실패: ' + error);
        return;
      }
      navigate(`/news/${id}`);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm('이 게시글을 삭제하시겠습니까?')) return;
    const { error } = await deleteNews(id);
    if (error) {
      alert('삭제 실패: ' + error);
      return;
    }
    navigate('/news', { replace: true });
  };

  // 관리자 판정 로딩 중
  if (authLoading || adminLoading) {
    return (
      <div className={styles.root}>
        <div className={styles.loadingWrap}>로딩 중...</div>
      </div>
    );
  }
  if (!isAdmin) return null;

  return (
    <div className={styles.root}>
      <DashboardHeader
        onLogoClick={() => navigate('/dashboard')}
        onProfileClick={() => navigate('/dashboard')}
      />
      <div className={styles.body}>
        {/* 헤더 */}
        <div className={styles.titleBar}>
          <h1 className={styles.pageTitle}>공지 및 업데이트</h1>
        </div>

        {/* 리스트 */}
        {mode === 'list' && (
          <>
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${tab === 'all' ? styles.active : ''}`}
                onClick={() => setTab('all')}
              >전체</button>
              <button
                className={`${styles.tab} ${tab === 'notice' ? styles.active : ''}`}
                onClick={() => setTab('notice')}
              >공지</button>
              <button
                className={`${styles.tab} ${tab === 'update' ? styles.active : ''}`}
                onClick={() => setTab('update')}
              >업데이트</button>
            </div>

            {isAdmin && (
              <div className={styles.toolbar}>
                <button className={styles.primaryBtn} onClick={() => navigate('/news/new')}>
                  + 새 글 작성
                </button>
              </div>
            )}

            {loading ? (
              <div className={styles.loadingWrap}>로딩 중...</div>
            ) : filteredItems.length === 0 ? (
              <div className={styles.list}>
                <div className={styles.empty}>등록된 게시글이 없습니다.</div>
              </div>
            ) : (
              <div className={styles.list}>
                {filteredItems.map(item => (
                  <div
                    key={item.id}
                    className={styles.listItem}
                    onClick={() => navigate(`/news/${item.id}`)}
                  >
                    <span
                      className={`${styles.categoryBadge} ${item.category === 'notice' ? styles.categoryNotice : styles.categoryUpdate}`}
                    >
                      {item.category === 'notice' ? '공지' : '업데이트'}
                    </span>
                    <span className={styles.itemTitle}>{item.title}</span>
                    <span className={styles.itemDate}>{formatDate(item.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* 상세 */}
        {mode === 'detail' && (
          loading ? (
            <div className={styles.loadingWrap}>로딩 중...</div>
          ) : !currentItem ? (
            <div className={styles.empty}>게시글을 찾을 수 없습니다.</div>
          ) : (
            <div className={styles.detailCard}>
              <h2 className={styles.detailTitle}>{currentItem.title}</h2>
              <div className={styles.detailMeta}>
                <span
                  className={`${styles.categoryBadge} ${currentItem.category === 'notice' ? styles.categoryNotice : styles.categoryUpdate}`}
                >
                  {currentItem.category === 'notice' ? '공지' : '업데이트'}
                </span>
                <span>{currentItem.authorName}</span>
                <span>·</span>
                <span>{formatDate(currentItem.createdAt)}</span>
              </div>
              <div className={styles.detailBody}>{currentItem.body}</div>
              {currentItem.images && currentItem.images.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                  {currentItem.images.map((url, i) => (
                    <a key={url + i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                      <img
                        src={url}
                        alt=""
                        style={{ maxWidth: 240, maxHeight: 240, borderRadius: 6, border: '1px solid var(--theme-border, #e0e0e0)', display: 'block' }}
                      />
                    </a>
                  ))}
                </div>
              )}
              <div className={styles.detailActions}>
                <button className={styles.secondaryBtn} onClick={() => navigate('/news')}>
                  목록으로
                </button>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className={styles.secondaryBtn} onClick={() => navigate(`/news/${currentItem.id}/edit`)}>
                      수정
                    </button>
                    <button className={styles.dangerBtn} onClick={handleDelete}>
                      삭제
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {/* 작성/수정 */}
        {(mode === 'new' || mode === 'edit') && (
          <div className={styles.formCard}>
            <div className={styles.formRow}>
              <label className={styles.label}>카테고리</label>
              <select
                className={styles.select}
                value={category}
                onChange={e => setCategory(e.target.value as NewsCategory)}
              >
                <option value="notice">공지</option>
                <option value="update">업데이트</option>
              </select>
            </div>
            <div className={styles.formRow}>
              <label className={styles.label}>제목</label>
              <input
                className={styles.input}
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="제목을 입력하세요"
                autoFocus
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.label}>본문</label>
              <textarea
                className={styles.textarea}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="내용을 입력하세요"
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.label}>이미지 첨부</label>
              <BoardImageUploader
                value={images}
                onChange={setImages}
                prefix="news"
              />
            </div>
            <div className={styles.formActions}>
              <button
                className={styles.secondaryBtn}
                onClick={() => navigate(mode === 'edit' && id ? `/news/${id}` : '/news')}
              >
                취소
              </button>
              <button
                className={styles.primaryBtn}
                onClick={handleSubmit}
                disabled={saving}
              >
                {saving ? '저장 중...' : mode === 'new' ? '작성' : '수정'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsPage;

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { useAdmin } from '@/hooks/useAdmin';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import BoardImageUploader from '@/components/common/BoardImageUploader';
import styles from './NewsPage.module.css';
import {
  listAllQnA,
  getQnA,
  createQnA,
  updateQnA,
  deleteQnA,
  answerQnA,
  requestQnAAiAnswer,
  QnAItem,
} from '@/firebase/qna';

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

const QnAPage: React.FC<Props> = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin(user, authLoading);

  const [items, setItems] = useState<QnAItem[]>([]);
  const [currentItem, setCurrentItem] = useState<QnAItem | null>(null);
  const [tab, setTab] = useState<'all' | 'pending' | 'answered'>('all');
  const [loading, setLoading] = useState(true);

  // 폼 상태 (질문 작성/수정)
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // 답변 입력 (관리자용)
  const [answerText, setAnswerText] = useState('');
  const [answerImages, setAnswerImages] = useState<string[]>([]);
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [generatingAiAnswer, setGeneratingAiAnswer] = useState(false);
  const [answerFormOpen, setAnswerFormOpen] = useState(false); // 답변 수정 폼 열림 여부

  // 로그인 체크
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login', { replace: true });
    }
  }, [authLoading, user, navigate]);

  // 목록 로드 (모든 로그인 회원이 전체 질문/답변 조회 가능)
  useEffect(() => {
    if (mode !== 'list' || !user || adminLoading) return;
    setLoading(true);
    listAllQnA().then(({ items }) => {
      setItems(items);
      setLoading(false);
    });
  }, [mode, user, adminLoading]);

  // 상세 / 수정 로드
  useEffect(() => {
    if ((mode !== 'detail' && mode !== 'edit') || !id) return;
    setLoading(true);
    getQnA(id).then(({ item }) => {
      if (item) {
        setCurrentItem(item);
        setTitle(item.title);
        setBody(item.body);
        setImages(item.images || []);
        setAnswerText(item.answer || '');
        setAnswerImages(item.answerImages || []);
        setAnswerFormOpen(false);
      }
      setLoading(false);
    });
  }, [mode, id]);

  const filteredItems = useMemo(() => {
    if (tab === 'all') return items;
    return items.filter(i => i.status === tab);
  }, [items, tab]);

  const canEditItem = useMemo(() => {
    if (!currentItem || !user) return false;
    return currentItem.authorId === user.uid || isAdmin;
  }, [currentItem, user, isAdmin]);

  // 상세 접근 권한: 로그인 회원 누구나 조회 가능 (수정/삭제는 작성자/관리자만)

  const handleSubmit = async () => {
    if (!title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }
    setSaving(true);
    if (mode === 'new') {
      const { id: newId, error } = await createQnA({ title: title.trim(), body, images });
      setSaving(false);
      if (error || !newId) {
        alert('작성 실패: ' + (error || ''));
        return;
      }
      navigate(`/qna/${newId}`);
    } else if (mode === 'edit' && id) {
      const { error } = await updateQnA(id, { title: title.trim(), body, images });
      setSaving(false);
      if (error) {
        alert('수정 실패: ' + error);
        return;
      }
      navigate(`/qna/${id}`);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm('이 질문을 삭제하시겠습니까?')) return;
    const { error } = await deleteQnA(id);
    if (error) {
      alert('삭제 실패: ' + error);
      return;
    }
    navigate('/qna', { replace: true });
  };

  const handleAnswerSubmit = async () => {
    if (!id) return;
    if (!answerText.trim()) {
      alert('답변을 입력해주세요.');
      return;
    }
    setSavingAnswer(true);
    const { error } = await answerQnA(id, answerText.trim(), answerImages);
    setSavingAnswer(false);
    if (error) {
      alert('답변 등록 실패: ' + error);
      return;
    }
    // 재조회
    const { item } = await getQnA(id);
    if (item) setCurrentItem(item);
    // 등록/수정 완료 후 폼 닫기
    setAnswerFormOpen(false);
  };

  const handleAiAnswerSubmit = async () => {
    if (!id) return;
    setGeneratingAiAnswer(true);
    const { error } = await requestQnAAiAnswer(id);
    setGeneratingAiAnswer(false);
    if (error) {
      alert('AI 답변 작성 실패: ' + error);
      return;
    }
    const { item } = await getQnA(id);
    if (item) {
      setCurrentItem(item);
      setAnswerText(item.answer || '');
      setAnswerImages(item.answerImages || []);
    }
    setAnswerFormOpen(false);
  };

  const openDirectAnswerForm = () => {
    setAnswerText(currentItem?.answer || '');
    setAnswerImages(currentItem?.answerImages || []);
    setAnswerFormOpen(true);
  };

  if (authLoading || adminLoading || !user) {
    return (
      <div className={styles.root}>
        <div className={styles.loadingWrap}>로딩 중...</div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <DashboardHeader
        onLogoClick={() => navigate('/dashboard')}
        onProfileClick={() => navigate('/dashboard')}
      />
      <div className={styles.body}>
        <div className={styles.titleBar}>
          <h1 className={styles.pageTitle}>Q&A</h1>
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
                className={`${styles.tab} ${tab === 'pending' ? styles.active : ''}`}
                onClick={() => setTab('pending')}
              >답변 대기</button>
              <button
                className={`${styles.tab} ${tab === 'answered' ? styles.active : ''}`}
                onClick={() => setTab('answered')}
              >답변 완료</button>
            </div>

            <div className={styles.toolbar}>
              <button className={styles.primaryBtn} onClick={() => navigate('/qna/new')}>
                + 질문하기
              </button>
            </div>

            {loading ? (
              <div className={styles.loadingWrap}>로딩 중...</div>
            ) : filteredItems.length === 0 ? (
              <div className={styles.list}>
                <div className={styles.empty}>등록된 질문이 없습니다.</div>
              </div>
            ) : (
              <div className={styles.list}>
                {filteredItems.map(item => (
                  <React.Fragment key={item.id}>
                    <div
                      className={styles.listItem}
                      onClick={() => navigate(`/qna/${item.id}`)}
                    >
                      <span
                        className={`${styles.categoryBadge} ${styles.categoryNotice}`}
                      >
                        질문
                      </span>
                      <span className={styles.itemTitle}>{item.title}</span>
                      <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #999)', flexShrink: 0, minWidth: 90, textAlign: 'right', marginRight: 20 }}>
                        {item.authorName}
                      </span>
                      <span className={styles.itemDate}>{formatDate(item.createdAt)}</span>
                    </div>
                    {item.status === 'answered' && item.answer && (
                      <div
                        className={styles.listItem}
                        onClick={() => navigate(`/qna/${item.id}`)}
                        style={{ paddingLeft: 40 }}
                      >
                        <span style={{ color: 'var(--theme-text-muted, #999)', marginRight: 4 }}>↳</span>
                        <span
                          className={`${styles.categoryBadge} ${styles.categoryUpdate}`}
                        >
                          답변완료
                        </span>
                        <span className={styles.itemTitle}>{`[답변] ${item.title}`}</span>
                        <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #999)', flexShrink: 0, minWidth: 90, textAlign: 'right', marginRight: 20 }}>
                          {item.answeredByName || 'A.I Q&A 관리자'}
                        </span>
                        <span className={styles.itemDate}>{formatDate(item.answeredAt)}</span>
                      </div>
                    )}
                  </React.Fragment>
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
            <div className={styles.empty}>질문을 찾을 수 없습니다.</div>
          ) : (
            <>
              <div className={styles.detailCard}>
                <h2 className={styles.detailTitle}>{currentItem.title}</h2>
                <div className={styles.detailMeta}>
                  <span
                    className={`${styles.categoryBadge} ${currentItem.status === 'answered' ? styles.categoryUpdate : styles.categoryNotice}`}
                  >
                    {currentItem.status === 'answered' ? '답변완료' : '답변대기'}
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
                  <button className={styles.secondaryBtn} onClick={() => navigate('/qna')}>
                    목록으로
                  </button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {currentItem.authorId === user.uid && (
                      <button className={styles.secondaryBtn} onClick={() => navigate(`/qna/${currentItem.id}/edit`)}>
                        수정
                      </button>
                    )}
                    {canEditItem && (
                      <button className={styles.dangerBtn} onClick={handleDelete}>
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 답변 영역 */}
              <div style={{ marginTop: 16 }}>
                {currentItem.status === 'answered' && currentItem.answer ? (
                  <div className={styles.detailCard}>
                    <div className={styles.detailMeta} style={{ marginBottom: 12, paddingBottom: 12 }}>
                      <span className={`${styles.categoryBadge} ${styles.categoryUpdate}`}>
                        답변
                      </span>
                      <span>{currentItem.answeredByName || '관리자'}</span>
                      <span>·</span>
                      <span>{formatDate(currentItem.answeredAt)}</span>
                    </div>
                    <div className={styles.detailBody}>{currentItem.answer}</div>
                    {currentItem.answerImages && currentItem.answerImages.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                        {currentItem.answerImages.map((url, i) => (
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
                    {isAdmin && (
                      <div className={styles.detailActions}>
                        <div />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className={styles.primaryBtn}
                            onClick={handleAiAnswerSubmit}
                            disabled={generatingAiAnswer}
                          >
                            {generatingAiAnswer ? 'AI 작성 중...' : 'AI 답변'}
                          </button>
                          <button
                            className={styles.secondaryBtn}
                            onClick={openDirectAnswerForm}
                          >
                            직접입력
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                {currentItem.status !== 'answered' && currentItem.aiStatus && (
                  <div className={styles.detailCard}>
                    <div className={styles.detailMeta} style={{ marginBottom: 12, paddingBottom: 12 }}>
                      <span className={`${styles.categoryBadge} ${styles.categoryNotice}`}>
                        A.I 확인
                      </span>
                      <span>A.I Q&A 관리자</span>
                    </div>
                    <div className={styles.detailBody} style={{ minHeight: 0 }}>
                      {currentItem.aiStatus === 'processing' || currentItem.aiStatus === 'queued'
                        ? '프로그램 도움말과 기존 Q&A를 기준으로 자동 답변을 찾는 중입니다.'
                        : currentItem.aiAnswer || '프로그램 도움말 기준으로 확실한 자동 답변을 찾지 못했습니다. 관리자가 확인 후 답변드리겠습니다.'}
                    </div>
                  </div>
                )}

                {isAdmin && currentItem.status !== 'answered' && !answerFormOpen && (
                  <div className={styles.formCard} style={{ marginTop: 16 }}>
                    <div className={styles.formActions} style={{ marginTop: 0 }}>
                      <button
                        className={styles.primaryBtn}
                        onClick={handleAiAnswerSubmit}
                        disabled={generatingAiAnswer}
                      >
                        {generatingAiAnswer ? 'AI 작성 중...' : 'AI 답변'}
                      </button>
                      <button
                        className={styles.secondaryBtn}
                        onClick={openDirectAnswerForm}
                      >
                        직접입력
                      </button>
                    </div>
                  </div>
                )}

                {/* 관리자: 답변 작성/수정 */}
                {isAdmin && answerFormOpen && (
                  <div className={styles.formCard} style={{ marginTop: 16 }}>
                    <div className={styles.formRow}>
                      <label className={styles.label}>
                        {currentItem.status === 'answered' ? '답변 수정' : '답변 작성'}
                      </label>
                      <textarea
                        className={styles.textarea}
                        value={answerText}
                        onChange={e => setAnswerText(e.target.value)}
                        placeholder="답변을 입력하세요"
                      />
                    </div>
                    <div className={styles.formRow}>
                      <label className={styles.label}>이미지 첨부</label>
                      <BoardImageUploader
                        value={answerImages}
                        onChange={setAnswerImages}
                        prefix="qna"
                      />
                    </div>
                    <div className={styles.formActions}>
                      <button
                        className={styles.primaryBtn}
                        onClick={handleAnswerSubmit}
                        disabled={savingAnswer}
                      >
                        {savingAnswer ? '저장 중...' : currentItem.status === 'answered' ? '답변 수정' : '답변 등록'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )
        )}

        {/* 작성/수정 */}
        {(mode === 'new' || mode === 'edit') && (
          <div className={styles.formCard}>
            <div className={styles.formRow}>
              <label className={styles.label}>제목</label>
              <input
                className={styles.input}
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="질문 제목을 입력하세요"
                autoFocus
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.label}>내용</label>
              <textarea
                className={styles.textarea}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="자세한 상황을 적어주시면 더 정확한 답변이 가능합니다."
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.label}>이미지 첨부</label>
              <BoardImageUploader
                value={images}
                onChange={setImages}
                prefix="qna"
              />
            </div>
            <div className={styles.formActions}>
              <button
                className={styles.secondaryBtn}
                onClick={() => navigate(mode === 'edit' && id ? `/qna/${id}` : '/qna')}
              >
                취소
              </button>
              <button
                className={styles.primaryBtn}
                onClick={handleSubmit}
                disabled={saving}
              >
                {saving ? '저장 중...' : mode === 'new' ? '질문 등록' : '수정'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QnAPage;

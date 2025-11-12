import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';
import { HiOutlineChatAlt2, HiOutlineTrash, HiOutlinePencil, HiOutlinePlus, HiOutlineCheck, HiOutlineX } from 'react-icons/hi';
import styles from './Chatbot.module.css';

interface ChatbotQA {
  id: string;
  question: string;
  answer: string;
  category: string;
  isActive: boolean;
  priority: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const Chatbot = () => {
  const { user } = useAuth();
  const [qas, setQAs] = useState<ChatbotQA[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // 폼 상태
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [category, setCategory] = useState('일반');
  const [priority, setPriority] = useState(1);
  const [isActive, setIsActive] = useState(true);

  // 필터 상태
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const categories = ['일반', '기능', '결제', '기술지원', '기타'];

  useEffect(() => {
    loadQAs();
  }, []);

  const loadQAs = async () => {
    try {
      setLoading(true);
      const snapshot = await getDocs(collection(db, 'chatbotQAs'));
      const qasList: ChatbotQA[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        qasList.push({
          id: doc.id,
          question: data.question || '',
          answer: data.answer || '',
          category: data.category || '일반',
          isActive: data.isActive !== undefined ? data.isActive : true,
          priority: data.priority || 1,
          createdBy: data.createdBy || '',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      });

      // 클라이언트 사이드에서 정렬
      qasList.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        if (a.createdAt && b.createdAt) {
          return b.createdAt.toMillis() - a.createdAt.toMillis();
        }
        return 0;
      });

      setQAs(qasList);
      console.log('✅ Q&A 로드 성공:', qasList.length, '개');
    } catch (error: any) {
      console.error('❌ Q&A 로드 실패:', error);
      console.error('에러 상세:', error.message, error.code);
      // 컬렉션이 없거나 데이터가 없는 경우는 에러로 처리하지 않음
      setQAs([]);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setQuestion('');
    setAnswer('');
    setCategory('일반');
    setPriority(1);
    setIsActive(true);
    setEditingId(null);
    setIsAdding(false);
  };

  const handleAdd = async () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (!question.trim() || !answer.trim()) {
      alert('질문과 답변을 입력해주세요.');
      return;
    }

    try {
      console.log('🔄 Q&A 추가 시도...', { question, answer, category, priority, isActive });

      const docRef = await addDoc(collection(db, 'chatbotQAs'), {
        question: question.trim(),
        answer: answer.trim(),
        category,
        isActive,
        priority,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      console.log('✅ Q&A 추가 성공:', docRef.id);
      alert('Q&A가 추가되었습니다.');
      resetForm();
      await loadQAs();
    } catch (error: any) {
      console.error('❌ Q&A 추가 실패:', error);
      console.error('에러 상세:', error.message, error.code);
      alert(`Q&A 추가에 실패했습니다.\n${error.message}`);
    }
  };

  const handleEdit = (qa: ChatbotQA) => {
    setEditingId(qa.id);
    setQuestion(qa.question);
    setAnswer(qa.answer);
    setCategory(qa.category);
    setPriority(qa.priority);
    setIsActive(qa.isActive);
    setIsAdding(false);
  };

  const handleUpdate = async () => {
    if (!editingId) return;

    if (!question.trim() || !answer.trim()) {
      alert('질문과 답변을 입력해주세요.');
      return;
    }

    try {
      await updateDoc(doc(db, 'chatbotQAs', editingId), {
        question: question.trim(),
        answer: answer.trim(),
        category,
        isActive,
        priority,
        updatedAt: serverTimestamp()
      });

      alert('Q&A가 수정되었습니다.');
      resetForm();
      loadQAs();
    } catch (error) {
      console.error('Q&A 수정 실패:', error);
      alert('Q&A 수정에 실패했습니다.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 이 Q&A를 삭제하시겠습니까?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'chatbotQAs', id));
      alert('Q&A가 삭제되었습니다.');
      loadQAs();
    } catch (error) {
      console.error('Q&A 삭제 실패:', error);
      alert('Q&A 삭제에 실패했습니다.');
    }
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    try {
      await updateDoc(doc(db, 'chatbotQAs', id), {
        isActive: !currentActive,
        updatedAt: serverTimestamp()
      });
      loadQAs();
    } catch (error) {
      console.error('상태 변경 실패:', error);
      alert('상태 변경에 실패했습니다.');
    }
  };

  // 필터링된 Q&A
  const filteredQAs = qas.filter(qa => {
    const matchesCategory = filterCategory === 'all' || qa.category === filterCategory;
    const matchesSearch = !searchQuery ||
      qa.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      qa.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>챗봇 관리</h1>
          <p className={styles.subtitle}>챗봇 Q&A를 관리합니다.</p>
        </div>
        <button
          className={styles.addButton}
          onClick={() => {
            setIsAdding(true);
            setEditingId(null);
            resetForm();
          }}
        >
          <HiOutlinePlus size={20} />
          Q&A 추가
        </button>
      </div>

      {/* 필터 */}
      <div className={styles.filters}>
        <div className={styles.searchBox}>
          <input
            type="text"
            placeholder="질문 또는 답변 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <div className={styles.categoryFilters}>
          <button
            className={filterCategory === 'all' ? `${styles.categoryButton} ${styles.active}` : styles.categoryButton}
            onClick={() => setFilterCategory('all')}
          >
            전체
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              className={filterCategory === cat ? `${styles.categoryButton} ${styles.active}` : styles.categoryButton}
              onClick={() => setFilterCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.content}>
        {/* 폼 */}
        {(isAdding || editingId) && (
          <div className={styles.formSection}>
            <div className={styles.formHeader}>
              <h2 className={styles.sectionTitle}>
                <HiOutlineChatAlt2 size={20} />
                {editingId ? 'Q&A 수정' : 'Q&A 추가'}
              </h2>
              <button className={styles.cancelButton} onClick={resetForm}>
                <HiOutlineX size={20} />
                취소
              </button>
            </div>

            <div className={styles.form}>
              <div className={styles.formGroup}>
                <label className={styles.label}>질문</label>
                <input
                  type="text"
                  placeholder="사용자가 물어볼 질문을 입력하세요"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>답변</label>
                <textarea
                  placeholder="챗봇이 답변할 내용을 입력하세요"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className={styles.textarea}
                  rows={6}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>카테고리</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={styles.input}
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>우선순위</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className={styles.input}
                  >
                    <option value={1}>낮음</option>
                    <option value={2}>보통</option>
                    <option value={3}>높음</option>
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  <span>활성화</span>
                </label>
              </div>

              <button
                type="button"
                onClick={() => {
                  console.log('버튼 클릭됨');
                  if (editingId) {
                    handleUpdate();
                  } else {
                    handleAdd();
                  }
                }}
                className={styles.submitButton}
              >
                <HiOutlineCheck size={18} />
                {editingId ? '수정 완료' : '추가하기'}
              </button>
            </div>
          </div>
        )}

        {/* Q&A 목록 */}
        <div className={styles.listSection}>
          <h2 className={styles.sectionTitle}>
            Q&A 목록 ({filteredQAs.length})
          </h2>

          {loading ? (
            <div className={styles.loading}>
              <div className={styles.spinner}></div>
              <p>로딩 중...</p>
            </div>
          ) : filteredQAs.length === 0 ? (
            <div className={styles.emptyState}>
              <HiOutlineChatAlt2 size={48} />
              <p>등록된 Q&A가 없습니다.</p>
            </div>
          ) : (
            <div className={styles.qaList}>
              {filteredQAs.map(qa => (
                <div key={qa.id} className={styles.qaCard}>
                  <div className={styles.qaHeader}>
                    <div className={styles.qaBadges}>
                      <span className={styles.categoryBadge}>{qa.category}</span>
                      <span className={qa.isActive ? styles.badgeActive : styles.badgeInactive}>
                        {qa.isActive ? '활성' : '비활성'}
                      </span>
                      <span className={styles.priorityBadge}>
                        우선순위 {qa.priority}
                      </span>
                    </div>
                    <div className={styles.qaActions}>
                      <button
                        onClick={() => toggleActive(qa.id, qa.isActive)}
                        className={styles.toggleButton}
                        title={qa.isActive ? '비활성화' : '활성화'}
                      >
                        {qa.isActive ? <HiOutlineX size={16} /> : <HiOutlineCheck size={16} />}
                      </button>
                      <button
                        onClick={() => handleEdit(qa)}
                        className={styles.editButton}
                        title="수정"
                      >
                        <HiOutlinePencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(qa.id)}
                        className={styles.deleteButton}
                        title="삭제"
                      >
                        <HiOutlineTrash size={16} />
                      </button>
                    </div>
                  </div>

                  <div className={styles.qaContent}>
                    <div className={styles.qaQuestion}>
                      <strong>Q.</strong> {qa.question}
                    </div>
                    <div className={styles.qaAnswer}>
                      <strong>A.</strong> {qa.answer}
                    </div>
                  </div>

                  <div className={styles.qaMeta}>
                    <span>
                      작성일: {qa.createdAt
                        ? new Date(qa.createdAt.toMillis()).toLocaleString('ko-KR')
                        : '-'}
                    </span>
                    {qa.updatedAt && (
                      <span>
                        수정일: {new Date(qa.updatedAt.toMillis()).toLocaleString('ko-KR')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Chatbot;

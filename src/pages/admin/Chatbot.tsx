import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';
import { HiOutlineChatAlt2, HiOutlineTrash, HiOutlinePencil, HiOutlinePlus, HiOutlineCheck, HiOutlineX, HiOutlineChatAlt, HiOutlineDownload } from 'react-icons/hi';
import styles from './Chatbot.module.css';
import { faqData } from '@/data/faqData';

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

interface ChatbotSettings {
  greeting: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

const Chatbot = () => {
  const { user } = useAuth();
  const [qas, setQAs] = useState<ChatbotQA[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  console.log('🔴 렌더링:', { isAdding, editingId });

  // 인사말 상태
  const [greeting, setGreeting] = useState('');
  const [greetingLoading, setGreetingLoading] = useState(true);
  const [isEditingGreeting, setIsEditingGreeting] = useState(false);

  // 기본 메시지 상태
  const [defaultMessage, setDefaultMessage] = useState('');
  const [isEditingDefaultMessage, setIsEditingDefaultMessage] = useState(false);

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
    console.log('🟢 Chatbot 컴포넌트 마운트됨');
    loadQAs();
    loadGreeting();
    return () => {
      console.log('🔴 Chatbot 컴포넌트 언마운트됨');
    };
  }, []);

  const loadGreeting = async () => {
    try {
      setGreetingLoading(true);
      const docRef = doc(db, 'chatbotSettings', 'general');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setGreeting(data.greeting || '안녕하세요! 무엇을 도와드릴까요?');
        setDefaultMessage(data.defaultMessage || '');
      } else {
        setGreeting('안녕하세요! 무엇을 도와드릴까요?');
        setDefaultMessage('');
      }
    } catch (error) {
      console.error('챗봇 설정 로드 실패:', error);
      setGreeting('안녕하세요! 무엇을 도와드릴까요?');
      setDefaultMessage('');
    } finally {
      setGreetingLoading(false);
    }
  };

  const saveGreeting = async () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (!greeting.trim()) {
      alert('인사말을 입력해주세요.');
      return;
    }

    try {
      console.log('💾 인사말 저장 시작:', greeting);
      const docRef = doc(db, 'chatbotSettings', 'general');
      await setDoc(docRef, {
        greeting: greeting.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }, { merge: true });
      console.log('✅ 인사말 저장 성공');
      alert('인사말이 저장되었습니다.');
      setIsEditingGreeting(false);
      loadGreeting();
    } catch (error: any) {
      console.error('❌ 인사말 저장 실패:', error);
      console.error('에러 상세:', error.message, error.code);
      alert(`인사말 저장에 실패했습니다.\n${error.message || '알 수 없는 오류'}`);
    }
  };

  const saveDefaultMessage = async () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (!defaultMessage.trim()) {
      alert('기본 메시지를 입력해주세요.');
      return;
    }

    try {
      console.log('💾 기본 메시지 저장 시작:', defaultMessage);
      const docRef = doc(db, 'chatbotSettings', 'general');
      await setDoc(docRef, {
        defaultMessage: defaultMessage.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }, { merge: true });
      console.log('✅ 기본 메시지 저장 성공');
      alert('기본 메시지가 저장되었습니다.');
      setIsEditingDefaultMessage(false);
      loadGreeting();
    } catch (error: any) {
      console.error('❌ 기본 메시지 저장 실패:', error);
      console.error('에러 상세:', error.message, error.code);
      alert(`기본 메시지 저장에 실패했습니다.\n${error.message || '알 수 없는 오류'}`);
    }
  };

  useEffect(() => {
    console.log('🔍 상태 변경:', { isAdding, editingId, question, answer });
  }, [isAdding, editingId, question, answer]);

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

  // 초기 FAQ 데이터 추가
  const importInitialFAQs = async () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    const confirmed = window.confirm(
      `faqData.ts에서 ${faqData.length}개의 FAQ를 Firebase에 추가합니다.\n\n기존 데이터는 유지되며 새로운 데이터가 추가됩니다.\n\n진행하시겠습니까?`
    );

    if (!confirmed) return;

    try {
      setLoading(true);

      // 카테고리 매핑
      const categoryMap: Record<string, string> = {
        '프로젝트': '기능',
        '저장': '기능',
        '생성': '기능',
        '공유': '기능',
        '공간': '기능',
        '치수': '기능',
        '기둥': '기능',
        '설치': '기능',
        '마감재': '기능',
        '모듈': '기능',
        '가구': '기능',
        '슬롯': '기능',
        '문': '기능',
        '상판': '기능',
        '베이스': '기능',
        '간격': '기능',
        '뷰': '기능',
        '2D': '기능',
        '3D': '기능',
        '확대': '기능',
        '치수선': '기능',
        'DXF': '기능',
        'PDF': '기능',
        '이미지': '기능',
        '내보내기': '기능',
        '문의': '기술지원',
        '지원': '기술지원',
        '버그': '기술지원',
        '플랜': '결제',
        '요금': '결제',
        '업그레이드': '결제',
        '구독': '결제',
        'CNC': '기능',
        '옵티마이저': '기능',
        '튜토리얼': '일반',
        '모바일': '일반',
        '회전': '기능',
        '크기': '기능',
        '시작': '일반',
        '추천': '일반',
        '가로': '기능',
        '깊이': '기능',
        '벽막힘': '기능',
        '세미스탠딩': '기능',
        '스탠딩': '기능',
        '단내림': '기능',
        '노서라운드': '기능',
        '서라운드': '기능',
        '엔드패널': '기능',
        '밀도': '기능',
        '병합': '기능',
        '파일명': '기능',
        '겹침': '기술지원',
        '충돌': '기술지원',
        '반영안됨': '기술지원',
      };

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < faqData.length; i++) {
        const faq = faqData[i];

        try {
          // 질문 텍스트는 첫 번째 한글 키워드 사용
          const koreanKeyword = faq.keywords.find(k => /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(k));
          const question = koreanKeyword || faq.keywords[0];

          // 카테고리 추론
          let category = '일반';
          for (const [key, value] of Object.entries(categoryMap)) {
            if (faq.keywords.some(k => k.includes(key))) {
              category = value;
              break;
            }
          }

          const qaData = {
            question: `${question}는 어떻게 하나요?`,
            answer: faq.answer,
            category,
            isActive: true,
            priority: i + 1,
            createdBy: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          await addDoc(collection(db, 'chatbotQAs'), qaData);
          successCount++;
        } catch (error) {
          console.error(`FAQ ${i + 1} 추가 실패:`, error);
          errorCount++;
        }
      }

      alert(`✅ 초기 FAQ 데이터 추가 완료!\n\n추가 성공: ${successCount}개\n추가 실패: ${errorCount}개`);
      loadQAs();
    } catch (error: any) {
      console.error('초기 FAQ 추가 실패:', error);
      alert(`초기 FAQ 추가에 실패했습니다.\n${error.message || '알 수 없는 오류'}`);
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
      setEditingId(null);
      setIsAdding(false);
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
      setEditingId(null);
      setIsAdding(false);
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
          <p className={styles.subtitle}>챗봇 Q&A 및 인사말을 관리합니다.</p>
        </div>
        <button
          className={styles.addButton}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Q&A 추가 버튼 클릭됨');
            console.log('클릭 전 isAdding:', isAdding);
            setIsAdding(true);
            setEditingId(null);
            resetForm();
            console.log('setIsAdding(true) 호출 완료');
            setTimeout(() => {
              console.log('1초 후 isAdding 확인 필요 - 다음 렌더링에서');
            }, 1000);
          }}
        >
          <HiOutlinePlus size={20} />
          Q&A 추가
        </button>
      </div>

      {/* 인사말 설정 */}
      <div className={styles.greetingSection}>
        <div className={styles.greetingHeader}>
          <h2 className={styles.sectionTitle}>
            <HiOutlineChatAlt size={20} />
            챗봇 인사말
          </h2>
          {!isEditingGreeting && (
            <button
              className={styles.editButton}
              onClick={() => setIsEditingGreeting(true)}
              type="button"
            >
              <HiOutlinePencil size={20} />
              <span>수정</span>
            </button>
          )}
        </div>
        {isEditingGreeting ? (
          <div className={styles.greetingForm}>
            <textarea
              className={styles.textarea}
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="챗봇 인사말을 입력하세요..."
              rows={3}
            />
            <div className={styles.greetingActions}>
              <button
                className={styles.saveButton}
                onClick={saveGreeting}
                type="button"
              >
                <HiOutlineCheck size={20} />
                <span>저장</span>
              </button>
              <button
                className={styles.cancelButton}
                onClick={() => {
                  setIsEditingGreeting(false);
                  loadGreeting();
                }}
                type="button"
              >
                <HiOutlineX size={20} />
                <span>취소</span>
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.greetingDisplay}>
            {greetingLoading ? '로딩 중...' : greeting}
          </div>
        )}
      </div>

      {/* 기본 메시지 설정 */}
      <div className={styles.greetingSection}>
        <div className={styles.greetingHeader}>
          <h2 className={styles.sectionTitle}>
            <HiOutlineChatAlt size={20} />
            질문 매칭 실패 시 기본 메시지
          </h2>
          {!isEditingDefaultMessage && (
            <button
              className={styles.editButton}
              onClick={() => setIsEditingDefaultMessage(true)}
              type="button"
            >
              <HiOutlinePencil size={20} />
              <span>수정</span>
            </button>
          )}
        </div>
        {isEditingDefaultMessage ? (
          <div className={styles.greetingForm}>
            <textarea
              className={styles.textarea}
              value={defaultMessage}
              onChange={(e) => setDefaultMessage(e.target.value)}
              placeholder="FAQ에 없는 질문을 받았을 때 보여줄 메시지를 입력하세요..."
              rows={6}
            />
            <div className={styles.greetingActions}>
              <button
                className={styles.saveButton}
                onClick={saveDefaultMessage}
                type="button"
              >
                <HiOutlineCheck size={20} />
                <span>저장</span>
              </button>
              <button
                className={styles.cancelButton}
                onClick={() => {
                  setIsEditingDefaultMessage(false);
                  loadGreeting();
                }}
                type="button"
              >
                <HiOutlineX size={20} />
                <span>취소</span>
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.greetingDisplay}>
            {greetingLoading ? '로딩 중...' : (defaultMessage || '(기본 메시지 미설정 - 하드코딩된 메시지 사용)')}
          </div>
        )}
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
        <button
          className={styles.importButton}
          onClick={importInitialFAQs}
          disabled={loading}
          type="button"
        >
          <HiOutlineDownload size={20} />
          <span>초기 FAQ 데이터 추가 ({faqData.length}개)</span>
        </button>
      </div>

      <div className={styles.content}>
        {/* 폼 */}
        {console.log('조건 체크:', { isAdding, editingId, show: isAdding || editingId })}
        {(isAdding || editingId) ? (
          <div className={styles.formSection}>
            <div className={styles.formHeader}>
              <h2 className={styles.sectionTitle}>
                <HiOutlineChatAlt2 size={20} />
                {editingId ? 'Q&A 수정' : 'Q&A 추가'}
              </h2>
              <button className={styles.cancelButton} onClick={() => {
                setEditingId(null);
                setIsAdding(false);
                resetForm();
              }}>
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
                  onChange={(e) => {
                    console.log('질문 입력:', e.target.value);
                    setQuestion(e.target.value);
                  }}
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>답변</label>
                <textarea
                  placeholder="챗봇이 답변할 내용을 입력하세요"
                  value={answer}
                  onChange={(e) => {
                    console.log('답변 입력:', e.target.value);
                    setAnswer(e.target.value);
                  }}
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
        ) : (
          console.log('❌ 폼 숨김')
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

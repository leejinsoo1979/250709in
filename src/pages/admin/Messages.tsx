import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp, Timestamp, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, storage } from '@/firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/auth/AuthProvider';
import { HiOutlineMail, HiOutlineUserGroup, HiOutlineUser, HiOutlinePaperAirplane, HiOutlineBell, HiOutlineCalendar, HiOutlineEye, HiOutlineTrash, HiOutlinePhotograph } from 'react-icons/hi';
import { SearchIcon } from '@/components/common/Icons';
import styles from './Messages.module.css';

interface User {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
}

interface Message {
  id: string;
  title: string;
  content: string;
  recipients: string[];
  senderId: string;
  senderName: string;
  sentAt: Timestamp;
  type: 'all' | 'individual';
  recipientCount: number;
}

interface Popup {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  startDate: Timestamp;
  endDate: Timestamp;
  isActive: boolean;
  priority: number;
  showOnce: boolean;
  createdBy: string;
  createdAt: Timestamp;
}

const Messages = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'messages' | 'history' | 'popups'>('messages');
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // 메시지 작성
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [messageType, setMessageType] = useState<'all' | 'individual'>('all');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // 팝업 작성
  const [popupTitle, setPopupTitle] = useState('');
  const [popupContent, setPopupContent] = useState('');
  const [popupImageUrl, setPopupImageUrl] = useState('');
  const [popupStartDate, setPopupStartDate] = useState('');
  const [popupEndDate, setPopupEndDate] = useState('');
  const [popupPriority, setPopupPriority] = useState(1);
  const [popupShowOnce, setPopupShowOnce] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 사용자 목록 로드
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersQuery = query(collection(db, 'users'), orderBy('email', 'asc'));
        const usersSnapshot = await getDocs(usersQuery);
        const usersList: User[] = [];
        usersSnapshot.forEach((doc) => {
          const data = doc.data();
          usersList.push({
            uid: doc.id,
            email: data.email || '',
            displayName: data.displayName,
            photoURL: data.photoURL
          });
        });
        setUsers(usersList);
      } catch (error) {
        console.error('사용자 목록 로드 실패:', error);
      }
    };

    loadUsers();
  }, []);

  // 메시지 기록 로드
  useEffect(() => {
    const loadMessages = async () => {
      try {
        setLoading(true);
        const messagesQuery = query(collection(db, 'messages'), orderBy('sentAt', 'desc'));
        const messagesSnapshot = await getDocs(messagesQuery);
        const messagesList: Message[] = [];
        messagesSnapshot.forEach((doc) => {
          const data = doc.data();
          messagesList.push({
            id: doc.id,
            title: data.title,
            content: data.content,
            recipients: data.recipients || [],
            senderId: data.senderId,
            senderName: data.senderName,
            sentAt: data.sentAt,
            type: data.type,
            recipientCount: data.recipientCount || 0
          });
        });
        setMessages(messagesList);
      } catch (error) {
        console.error('메시지 기록 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, []);

  // 팝업 목록 로드
  useEffect(() => {
    const loadPopups = async () => {
      try {
        const popupsQuery = query(collection(db, 'popups'), orderBy('createdAt', 'desc'));
        const popupsSnapshot = await getDocs(popupsQuery);
        const popupsList: Popup[] = [];
        popupsSnapshot.forEach((doc) => {
          const data = doc.data();
          popupsList.push({
            id: doc.id,
            title: data.title,
            content: data.content,
            imageUrl: data.imageUrl,
            startDate: data.startDate,
            endDate: data.endDate,
            isActive: data.isActive,
            priority: data.priority || 1,
            showOnce: data.showOnce || false,
            createdBy: data.createdBy,
            createdAt: data.createdAt
          });
        });
        setPopups(popupsList);
      } catch (error) {
        console.error('팝업 목록 로드 실패:', error);
      }
    };

    loadPopups();
  }, []);

  // 필터링된 사용자 목록
  const filteredUsers = users.filter(u => {
    const query = searchQuery.toLowerCase();
    return (
      u.email.toLowerCase().includes(query) ||
      u.displayName?.toLowerCase().includes(query) ||
      u.uid.toLowerCase().includes(query)
    );
  });

  // 사용자 선택 토글
  const toggleUserSelection = (uid: string) => {
    setSelectedUsers(prev =>
      prev.includes(uid)
        ? prev.filter(id => id !== uid)
        : [...prev, uid]
    );
  };

  // 전체 선택/해제
  const toggleSelectAll = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map(u => u.uid));
    }
  };

  // 메시지 발송
  const sendMessage = async () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (!title.trim() || !content.trim()) {
      alert('제목과 내용을 입력해주세요.');
      return;
    }

    if (messageType === 'individual' && selectedUsers.length === 0) {
      alert('수신자를 선택해주세요.');
      return;
    }

    try {
      setSending(true);

      const recipients = messageType === 'all'
        ? users.map(u => u.uid)
        : selectedUsers;

      // 메시지 저장
      const messageDoc = await addDoc(collection(db, 'messages'), {
        title: title.trim(),
        content: content.trim(),
        recipients,
        senderId: user.uid,
        senderName: user.displayName || user.email || '관리자',
        sentAt: serverTimestamp(),
        type: messageType,
        recipientCount: recipients.length
      });

      console.log('✅ 메시지 저장 완료:', messageDoc.id);

      // 각 수신자에게 알림 생성
      console.log('📧 알림 생성 시작:', recipients.length, '명');
      const notificationPromises = recipients.map(recipientId => {
        console.log('  - 알림 생성 대상:', recipientId);
        return addDoc(collection(db, 'notifications'), {
          userId: recipientId,
          type: 'message',
          title: title.trim(),
          message: content.trim(),
          messageId: messageDoc.id,
          senderId: user.uid,
          senderName: user.displayName || user.email || '관리자',
          isRead: false,
          createdAt: serverTimestamp()
        });
      });

      try {
        await Promise.all(notificationPromises);
        console.log('✅ 모든 알림 생성 완료');
      } catch (notificationError) {
        console.error('❌ 알림 생성 실패:', notificationError);
        alert(`메시지는 발송되었으나 알림 생성에 실패했습니다: ${notificationError.message}`);
      }

      alert(`메시지가 ${recipients.length}명에게 발송되었습니다.`);

      // 폼 초기화
      setTitle('');
      setContent('');
      setSelectedUsers([]);
      setMessageType('all');

      // 메시지 목록 새로고침
      const messagesQuery = query(collection(db, 'messages'), orderBy('sentAt', 'desc'));
      const messagesSnapshot = await getDocs(messagesQuery);
      const messagesList: Message[] = [];
      messagesSnapshot.forEach((doc) => {
        const data = doc.data();
        messagesList.push({
          id: doc.id,
          title: data.title,
          content: data.content,
          recipients: data.recipients || [],
          senderId: data.senderId,
          senderName: data.senderName,
          sentAt: data.sentAt,
          type: data.type,
          recipientCount: data.recipientCount || 0
        });
      });
      setMessages(messagesList);
    } catch (error) {
      console.error('메시지 발송 실패:', error);
      alert('메시지 발송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  // 팝업 생성
  const createPopup = async () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (!popupTitle.trim() || !popupContent.trim()) {
      alert('제목과 내용을 입력해주세요.');
      return;
    }

    if (!popupStartDate || !popupEndDate) {
      alert('시작일과 종료일을 설정해주세요.');
      return;
    }

    try {
      setSending(true);

      const startTimestamp = Timestamp.fromDate(new Date(popupStartDate));
      const endTimestamp = Timestamp.fromDate(new Date(popupEndDate));

      await addDoc(collection(db, 'popups'), {
        title: popupTitle.trim(),
        content: popupContent.trim(),
        imageUrl: popupImageUrl.trim() || null,
        startDate: startTimestamp,
        endDate: endTimestamp,
        isActive: true,
        priority: popupPriority,
        showOnce: popupShowOnce,
        createdBy: user.uid,
        createdAt: serverTimestamp()
      });

      alert('팝업이 생성되었습니다.');

      // 폼 초기화
      setPopupTitle('');
      setPopupContent('');
      setPopupImageUrl('');
      setPopupStartDate('');
      setPopupEndDate('');
      setPopupPriority(1);
      setPopupShowOnce(false);

      // 팝업 목록 새로고침
      const popupsQuery = query(collection(db, 'popups'), orderBy('createdAt', 'desc'));
      const popupsSnapshot = await getDocs(popupsQuery);
      const popupsList: Popup[] = [];
      popupsSnapshot.forEach((doc) => {
        const data = doc.data();
        popupsList.push({
          id: doc.id,
          title: data.title,
          content: data.content,
          imageUrl: data.imageUrl,
          startDate: data.startDate,
          endDate: data.endDate,
          isActive: data.isActive,
          priority: data.priority || 1,
          showOnce: data.showOnce || false,
          createdBy: data.createdBy,
          createdAt: data.createdAt
        });
      });
      setPopups(popupsList);
    } catch (error) {
      console.error('팝업 생성 실패:', error);
      alert('팝업 생성에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  // 이미지 업로드
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 이미지 파일만 허용
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    // 파일 크기 제한 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('파일 크기는 5MB 이하여야 합니다.');
      return;
    }

    try {
      setUploading(true);

      // Firebase Storage에 업로드
      const timestamp = Date.now();
      const storageRef = ref(storage, `popups/${timestamp}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      setPopupImageUrl(downloadURL);
      alert('이미지가 업로드되었습니다.');
    } catch (error) {
      console.error('이미지 업로드 실패:', error);
      alert('이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
      // input 초기화
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 팝업 활성화/비활성화 토글
  const togglePopupActive = async (popupId: string, currentActive: boolean) => {
    try {
      await updateDoc(doc(db, 'popups', popupId), {
        isActive: !currentActive
      });

      setPopups(prev => prev.map(p =>
        p.id === popupId ? { ...p, isActive: !currentActive } : p
      ));

      alert(`팝업이 ${!currentActive ? '활성화' : '비활성화'}되었습니다.`);
    } catch (error) {
      console.error('팝업 상태 변경 실패:', error);
      alert('팝업 상태 변경에 실패했습니다.');
    }
  };

  // 팝업 삭제
  const deletePopup = async (popupId: string) => {
    if (!confirm('정말 이 팝업을 삭제하시겠습니까?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'popups', popupId));
      setPopups(prev => prev.filter(p => p.id !== popupId));
      alert('팝업이 삭제되었습니다.');
    } catch (error) {
      console.error('팝업 삭제 실패:', error);
      alert('팝업 삭제에 실패했습니다.');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>메시지 관리</h1>
        <p className={styles.subtitle}>사용자에게 메시지를 발송하고 팝업을 관리합니다.</p>

        {/* 탭 */}
        <div className={styles.tabs}>
          <button
            className={activeTab === 'messages' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setActiveTab('messages')}
          >
            <HiOutlineMail size={20} />
            메시지 발송
          </button>
          <button
            className={activeTab === 'history' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setActiveTab('history')}
          >
            <HiOutlineCalendar size={20} />
            발송 기록
          </button>
          <button
            className={activeTab === 'popups' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setActiveTab('popups')}
          >
            <HiOutlineBell size={20} />
            팝업 관리
          </button>
        </div>
      </div>

      {activeTab === 'messages' ? (
        /* 메시지 발송 탭 */
        <div className={messageType === 'individual' ? styles.contentSplit : styles.content}>
        {/* 개별 선택 시 사용자 목록 (좌측) */}
        {messageType === 'individual' && (
          <div className={styles.userSelectionSection}>
            <h2 className={styles.sectionTitle}>
              수신자 선택 ({selectedUsers.length}명 선택됨)
            </h2>

            {/* 검색 */}
            <div className={styles.searchBox}>
              <SearchIcon size={18} />
              <input
                type="text"
                placeholder="이메일, 이름, ID로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            {/* 전체 선택 */}
            <div className={styles.selectAllRow}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                  onChange={toggleSelectAll}
                />
                <span>전체 선택 ({filteredUsers.length}명)</span>
              </label>
            </div>

            {/* 사용자 목록 */}
            <div className={styles.userList}>
              {filteredUsers.map(u => (
                <label key={u.uid} className={styles.userItem}>
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(u.uid)}
                    onChange={() => toggleUserSelection(u.uid)}
                  />
                  <div className={styles.userAvatar}>
                    {u.photoURL ? (
                      <img src={u.photoURL} alt={u.displayName || u.email} />
                    ) : (
                      <div className={styles.avatarPlaceholder}>
                        {(u.displayName || u.email).charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className={styles.userInfo}>
                    <span className={styles.userName}>{u.displayName || '이름 없음'}</span>
                    <span className={styles.userEmail}>{u.email}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* 메시지 작성 (우측) */}
        <div className={styles.composeSection}>
          <h2 className={styles.sectionTitle}>
            <HiOutlineMail size={20} />
            메시지 작성
          </h2>

          <div className={styles.form}>
            {/* 수신 대상 선택 */}
            <div className={styles.formGroup}>
              <label className={styles.label}>수신 대상</label>
              <div className={styles.radioGroup}>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="messageType"
                    checked={messageType === 'all'}
                    onChange={() => setMessageType('all')}
                  />
                  <HiOutlineUserGroup size={18} />
                  <span>전체 사용자</span>
                </label>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="messageType"
                    checked={messageType === 'individual'}
                    onChange={() => setMessageType('individual')}
                  />
                  <HiOutlineUser size={18} />
                  <span>개별 선택</span>
                </label>
              </div>
            </div>

            {/* 제목 */}
            <div className={styles.formGroup}>
              <label className={styles.label}>제목</label>
              <input
                type="text"
                placeholder="메시지 제목을 입력하세요"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={styles.input}
              />
            </div>

            {/* 내용 */}
            <div className={styles.formGroup}>
              <label className={styles.label}>내용</label>
              <textarea
                placeholder="메시지 내용을 입력하세요"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className={styles.textarea}
                rows={8}
              />
            </div>

            {/* 발송 버튼 */}
            <button
              onClick={sendMessage}
              disabled={sending}
              className={styles.sendButton}
            >
              <HiOutlinePaperAirplane size={18} />
              {sending ? '발송 중...' : '메시지 발송'}
            </button>
          </div>
        </div>
      </div>
      ) : activeTab === 'history' ? (
        /* 발송 기록 탭 */
        <div className={styles.content}>
          <div className={styles.historySection}>
            <h2 className={styles.sectionTitle}>발송 기록 ({messages.length})</h2>

            {loading ? (
              <div className={styles.loading}>
                <div className={styles.spinner}></div>
                <p>로딩 중...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className={styles.emptyState}>
                <HiOutlineMail size={48} />
                <p>발송된 메시지가 없습니다.</p>
              </div>
            ) : (
              <div className={styles.messageList}>
                {messages.map(msg => (
                  <div key={msg.id} className={styles.messageCard}>
                    <div className={styles.messageHeader}>
                      <h3 className={styles.messageTitle}>{msg.title}</h3>
                      <span className={styles.messageBadge}>
                        {msg.type === 'all' ? '전체 발송' : '개별 발송'}
                      </span>
                    </div>
                    <p className={styles.messageContent}>{msg.content}</p>
                    <div className={styles.messageMeta}>
                      <span>발신: {msg.senderName}</span>
                      <span>수신: {msg.recipientCount}명</span>
                      <span>
                        {msg.sentAt
                          ? new Date(msg.sentAt.toMillis()).toLocaleString('ko-KR')
                          : '-'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 팝업 관리 탭 */
        <div className={styles.content}>
          {/* 팝업 작성 */}
          <div className={styles.composeSection}>
            <h2 className={styles.sectionTitle}>
              <HiOutlineBell size={20} />
              팝업 작성
            </h2>

            <div className={styles.form}>
              {/* 제목 */}
              <div className={styles.formGroup}>
                <label className={styles.label}>제목</label>
                <input
                  type="text"
                  placeholder="팝업 제목을 입력하세요"
                  value={popupTitle}
                  onChange={(e) => setPopupTitle(e.target.value)}
                  className={styles.input}
                />
              </div>

              {/* 내용 */}
              <div className={styles.formGroup}>
                <label className={styles.label}>내용</label>
                <textarea
                  placeholder="팝업 내용을 입력하세요"
                  value={popupContent}
                  onChange={(e) => setPopupContent(e.target.value)}
                  className={styles.textarea}
                  rows={6}
                />
              </div>

              {/* 이미지 URL */}
              <div className={styles.formGroup}>
                <label className={styles.label}>이미지 URL (선택사항)</label>
                <div className={styles.imageUploadContainer}>
                  <input
                    type="text"
                    placeholder="https://example.com/image.jpg"
                    value={popupImageUrl}
                    onChange={(e) => setPopupImageUrl(e.target.value)}
                    className={styles.input}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className={styles.uploadButton}
                  >
                    <HiOutlinePhotograph size={18} />
                    {uploading ? '업로드 중...' : '이미지 첨부'}
                  </button>
                </div>
                {popupImageUrl && (
                  <div className={styles.imagePreview}>
                    <img src={popupImageUrl} alt="Preview" />
                  </div>
                )}
              </div>

              {/* 날짜 설정 */}
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    <HiOutlineCalendar size={16} />
                    시작일
                    {popupStartDate && (
                      <span className={styles.dateDisplay}>
                        {new Date(popupStartDate).toLocaleString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    )}
                  </label>
                  <input
                    type="datetime-local"
                    value={popupStartDate}
                    onChange={(e) => setPopupStartDate(e.target.value)}
                    className={styles.dateInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    <HiOutlineCalendar size={16} />
                    종료일
                    {popupEndDate && (
                      <span className={styles.dateDisplay}>
                        {new Date(popupEndDate).toLocaleString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    )}
                  </label>
                  <input
                    type="datetime-local"
                    value={popupEndDate}
                    onChange={(e) => setPopupEndDate(e.target.value)}
                    className={styles.dateInput}
                  />
                </div>
              </div>

              {/* 우선순위 */}
              <div className={styles.formGroup}>
                <label className={styles.label}>우선순위</label>
                <select
                  value={popupPriority}
                  onChange={(e) => setPopupPriority(Number(e.target.value))}
                  className={styles.input}
                >
                  <option value={1}>낮음</option>
                  <option value={2}>보통</option>
                  <option value={3}>높음</option>
                </select>
              </div>

              {/* 한 번만 보기 */}
              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={popupShowOnce}
                    onChange={(e) => setPopupShowOnce(e.target.checked)}
                  />
                  <span>한 번만 보기 (사용자당 1회 표시)</span>
                </label>
              </div>

              {/* 생성 버튼 */}
              <button
                onClick={createPopup}
                disabled={sending}
                className={styles.sendButton}
              >
                <HiOutlinePaperAirplane size={18} />
                {sending ? '생성 중...' : '팝업 생성'}
              </button>
            </div>
          </div>

          {/* 팝업 목록 */}
          <div className={styles.historySection}>
            <h2 className={styles.sectionTitle}>팝업 목록 ({popups.length})</h2>

            {popups.length === 0 ? (
              <div className={styles.emptyState}>
                <HiOutlineBell size={48} />
                <p>등록된 팝업이 없습니다.</p>
              </div>
            ) : (
              <div className={styles.messageList}>
                {popups.map(popup => (
                  <div key={popup.id} className={styles.popupCard}>
                    <div className={styles.messageHeader}>
                      <h3 className={styles.messageTitle}>{popup.title}</h3>
                      <div className={styles.popupBadges}>
                        <span className={popup.isActive ? styles.badgeActive : styles.badgeInactive}>
                          {popup.isActive ? '활성' : '비활성'}
                        </span>
                        <span className={styles.badgePriority}>
                          우선순위 {popup.priority}
                        </span>
                        {popup.showOnce && (
                          <span className={styles.badgeOnce}>
                            <HiOutlineEye size={14} />
                            1회
                          </span>
                        )}
                      </div>
                    </div>
                    <p className={styles.messageContent}>{popup.content}</p>
                    {popup.imageUrl && (
                      <div className={styles.popupImage}>
                        <img src={popup.imageUrl} alt={popup.title} />
                      </div>
                    )}
                    <div className={styles.messageMeta}>
                      <span>
                        시작: {popup.startDate
                          ? new Date(popup.startDate.toMillis()).toLocaleString('ko-KR')
                          : '-'}
                      </span>
                      <span>
                        종료: {popup.endDate
                          ? new Date(popup.endDate.toMillis()).toLocaleString('ko-KR')
                          : '-'}
                      </span>
                    </div>
                    <div className={styles.popupActions}>
                      <button
                        onClick={() => togglePopupActive(popup.id, popup.isActive)}
                        className={styles.actionButton}
                      >
                        {popup.isActive ? '비활성화' : '활성화'}
                      </button>
                      <button
                        onClick={() => deletePopup(popup.id)}
                        className={styles.deleteButton}
                      >
                        <HiOutlineTrash size={16} />
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Messages;

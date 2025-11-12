import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';
import { HiOutlineMail, HiOutlineUserGroup, HiOutlineUser, HiOutlinePaperAirplane } from 'react-icons/hi';
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

const Messages = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // 메시지 작성
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [messageType, setMessageType] = useState<'all' | 'individual'>('all');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

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

      await addDoc(collection(db, 'messages'), {
        title: title.trim(),
        content: content.trim(),
        recipients,
        senderId: user.uid,
        senderName: user.displayName || user.email || '관리자',
        sentAt: serverTimestamp(),
        type: messageType,
        recipientCount: recipients.length
      });

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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>메시지 관리</h1>
        <p className={styles.subtitle}>사용자에게 메시지를 발송하고 발송 기록을 관리합니다.</p>
      </div>

      <div className={styles.content}>
        {/* 메시지 작성 */}
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

            {/* 개별 선택 시 사용자 목록 */}
            {messageType === 'individual' && (
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  수신자 선택 ({selectedUsers.length}명 선택됨)
                </label>

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

        {/* 발송 기록 */}
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
    </div>
  );
};

export default Messages;

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, X, Send } from 'lucide-react';
import { faqData, matchQuestion } from '@/data/faqData';
import { useScrollLock } from '@/hooks/useScrollLock';
import styles from './Chatbot.module.css';

interface Message {
  id: string;
  text: string;
  isBot: boolean;
  timestamp: Date;
}

export const Chatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useScrollLock(isOpen);

  // 초기 환영 메시지
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: '1',
          text: 'Hi there!\n\nI\'m Befun chatbot, your friendly customer support assistant.\n\n(support@coohom.com)',
          isBot: true,
          timestamp: new Date(),
        },
        {
          id: '2',
          text: 'Is there anything I can help with?',
          isBot: true,
          timestamp: new Date(),
        },
      ]);
    }
  }, [isOpen]);

  // 메시지 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    // 사용자 메시지 추가
    const userMessage: Message = {
      id: Date.now().toString(),
      text: input.trim(),
      isBot: false,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    // FAQ 매칭
    setTimeout(() => {
      const answer = matchQuestion(input.trim());
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: answer,
        isBot: true,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMessage]);
    }, 500);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* 배경 오버레이 */}
      {isOpen &&
        createPortal(
          <div
            className={styles.overlay}
            onClick={() => setIsOpen(false)}
          />,
          document.body
        )}

      {/* 플로팅 버튼 */}
      <button
        className={`${styles.floatingButton} ${isOpen ? styles.open : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="챗봇 열기"
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>

      {/* 챗봇 창 */}
      {isOpen && (
        <div className={styles.chatContainer}>
          {/* 헤더 */}
          <div className={styles.header}>
            <div className={styles.headerContent}>
              <div className={styles.avatar}>
                <MessageCircle size={24} />
                <span className={styles.onlineDot} />
              </div>
              <span className={styles.title}>Befun chatbot</span>
            </div>
          </div>

          {/* 메시지 목록 */}
          <div className={styles.messagesContainer}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`${styles.messageWrapper} ${
                  message.isBot ? styles.botMessage : styles.userMessage
                }`}
              >
                {message.isBot && (
                  <div className={styles.botAvatar}>
                    <MessageCircle size={20} />
                  </div>
                )}
                <div className={styles.messageBubble}>
                  <p className={styles.messageText}>{message.text}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* 입력창 */}
          <div className={styles.inputContainer}>
            <input
              type="text"
              className={styles.input}
              placeholder="Ask me anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            <button
              className={styles.sendButton}
              onClick={handleSend}
              disabled={!input.trim()}
              aria-label="전송"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

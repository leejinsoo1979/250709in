import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';
import { X } from 'lucide-react';
import styles from './PopupManager.module.css';

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

export const PopupManager: React.FC = () => {
  const { user } = useAuth();
  const [currentPopup, setCurrentPopup] = useState<Popup | null>(null);
  const [viewedPopups, setViewedPopups] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;

    // 로컬스토리지에서 이미 본 팝업 목록 가져오기
    const viewed = localStorage.getItem(`viewed-popups-${user.uid}`);
    if (viewed) {
      setViewedPopups(JSON.parse(viewed));
    }

    loadPopups();
  }, [user]);

  const loadPopups = async () => {
    try {
      const now = Timestamp.now();

      // 활성화된 팝업 중 현재 시간에 표시되어야 하는 팝업 조회
      const popupsQuery = query(
        collection(db, 'popups'),
        where('isActive', '==', true)
      );

      const snapshot = await getDocs(popupsQuery);
      const popups: Popup[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        const popup: Popup = {
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
        };

        // 시간 범위 체크
        const startMs = popup.startDate.toMillis();
        const endMs = popup.endDate.toMillis();
        const nowMs = now.toMillis();

        if (nowMs >= startMs && nowMs <= endMs) {
          // showOnce가 true면 이미 본 팝업인지 확인
          if (popup.showOnce && viewedPopups.includes(popup.id)) {
            return;
          }
          popups.push(popup);
        }
      });

      // 우선순위가 높은 팝업부터 표시 (priority가 높을수록 우선)
      if (popups.length > 0) {
        popups.sort((a, b) => b.priority - a.priority);
        setCurrentPopup(popups[0]);
      }
    } catch (error) {
      console.error('팝업 로드 실패:', error);
    }
  };

  const handleClose = () => {
    if (!currentPopup || !user) return;

    // showOnce가 true면 로컬스토리지에 저장
    if (currentPopup.showOnce) {
      const newViewedPopups = [...viewedPopups, currentPopup.id];
      setViewedPopups(newViewedPopups);
      localStorage.setItem(`viewed-popups-${user.uid}`, JSON.stringify(newViewedPopups));
    }

    setCurrentPopup(null);
  };

  if (!currentPopup) return null;

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.closeButton}
          onClick={handleClose}
          aria-label="닫기"
        >
          <X size={24} />
        </button>

        {currentPopup.imageUrl && (
          <div className={styles.imageContainer}>
            <img src={currentPopup.imageUrl} alt={currentPopup.title} />
          </div>
        )}

        <div className={styles.content}>
          <h2 className={styles.title}>{currentPopup.title}</h2>
          <p className={styles.message}>{currentPopup.content}</p>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import styles from './DesignGrid.module.css';

// 날짜 포맷팅 함수
const formatDate = (date): any => {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(new Date(date));
};

// 개별 디자인 카드
const DesignCard = ({ design, onEdit, onCopy, onDelete }): any => {
  const handleCardClick = (e): any => {
    e.stopPropagation();
    // 디자인 상세 보기
  };

  const handleAction = (action, e): any => {
    e.stopPropagation();
    switch (action) {
      case 'copy':
        onCopy?.(design);
        break;
      case 'edit':
        onEdit?.(design);
        break;
      case 'delete':
        onDelete?.(design);
        break;
    }
  };

  return (
    <div className={styles.designCard} onClick={handleCardClick}>
      <div className={styles.cardThumbnail}>
        {design.thumbnail ? (
          <img src={design.thumbnail} alt={design.name} />
        ) : (
          <div className={styles.placeholderThumbnail}>
            <span className={styles.placeholderIcon}>📦</span>
          </div>
        )}
        
        <div className={styles.cardActions}>
          <button 
            className={styles.actionButton}
            onClick={(e) => handleAction('copy', e)}
            title="복사"
          >
            📋
          </button>
          <button 
            className={styles.actionButton}
            onClick={(e) => handleAction('edit', e)}
            title="편집"
          >
            ✏️
          </button>
          <button 
            className={styles.actionButton}
            onClick={(e) => handleAction('delete', e)}
            title="삭제"
          >
            🗑️
          </button>
        </div>
      </div>
      
      <div className={styles.cardInfo}>
        <h3 className={styles.cardTitle}>{design.name}</h3>
        <p className={styles.cardAuthor}>작성자: {design.author}</p>
        <p className={styles.cardDate}>{formatDate(design.updatedAt)}</p>
      </div>
    </div>
  );
};

// 새 디자인 생성 카드
const CreateDesignCard = ({ onCreateDesign }): any => {
  return (
    <div className={styles.createDesignCard} onClick={onCreateDesign}>
      <div className={styles.createIcon}>
        <span className={styles.plusIcon}>+</span>
      </div>
      <p className={styles.createText}>새로운 디자인</p>
    </div>
  );
};

// 빈 상태 컴포넌트
const EmptyState = ({ onCreateDesign }): any => {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>+</div>
      <h3 className={styles.emptyTitle}>디자인이 없습니다</h3>
      <p className={styles.emptyDescription}>
        새로운 디자인을 만들거나 프로젝트를 선택하세요
      </p>
      <button className={styles.emptyButton} onClick={onCreateDesign}>
        디자인 만들기
      </button>
    </div>
  );
};

// 메인 디자인 그리드 컴포넌트
const DesignGrid = ({ 
  designs = [], 
  viewMode = 'grid',
  onCreateDesign,
  onEditDesign,
  onCopyDesign,
  onDeleteDesign
}): any => {
  if (designs.length === 0) {
    return <EmptyState onCreateDesign={onCreateDesign} />;
  }

  return (
    <div className={styles.designGrid}>
      <CreateDesignCard onCreateDesign={onCreateDesign} />
      {designs.map((design) => (
        <DesignCard
          key={design.id}
          design={design}
          onEdit={onEditDesign}
          onCopy={onCopyDesign}
          onDelete={onDeleteDesign}
        />
      ))}
    </div>
  );
};

export default DesignGrid;
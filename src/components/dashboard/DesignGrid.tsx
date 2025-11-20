import React from 'react';
import styles from './DesignGrid.module.css';

// 타입 정의 추가
interface DesignCardProps {
  design: any;
  onEdit: (design: any) => void;
  onCopy: (design: any) => void;
  onDelete: (design: any) => void;
  onView?: (design: any) => void;
}
interface CreateDesignCardProps {
  onCreateDesign: () => void;
}
interface EmptyStateProps {
  onCreateDesign: () => void;
}

// 날짜 포맷팅 함수
const formatDate = (date: Date | string | { seconds?: number } | null | undefined): string => {
  if (!date) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date as any));
};

// 개별 디자인 카드
const DesignCard: React.FC<DesignCardProps> = ({ design, onEdit, onCopy, onDelete, onView }) => {
  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    // 디자인 상세 보기 - 3D 미리보기 열기
    if (onView) {
      onView(design);
    }
  };

  const handleAction = (action: string, e: React.MouseEvent<HTMLButtonElement>): void => {
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

  // 임시로 카드 개수 계산 (실제로는 design 객체에서 가져와야 함)
  const viewCount = design.viewCount || 4;

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

        {/* View more 배지 */}
        <div className={styles.viewBadge}>
          <span className={styles.viewBadgeIcon}>📷</span>
          <span>View more ({viewCount})</span>
        </div>

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
const CreateDesignCard: React.FC<CreateDesignCardProps> = ({ onCreateDesign }) => {
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
const EmptyState: React.FC<EmptyStateProps> = ({ onCreateDesign }) => {
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
const DesignGrid: React.FC<{
  designs?: any[];
  onCreateDesign: any;
  onEditDesign: any;
  onCopyDesign: any;
  onDeleteDesign: any;
  onViewDesign?: any;
}> = ({
  designs = [],
  onCreateDesign,
  onEditDesign,
  onCopyDesign,
  onDeleteDesign,
  onViewDesign
}) => {
  if (designs.length === 0) {
    return <EmptyState onCreateDesign={onCreateDesign} />;
  }

  return (
    <div className={styles.designGrid}>
      <CreateDesignCard onCreateDesign={onCreateDesign} />
      {designs.map((design: any) => (
        <DesignCard
          key={design.id}
          design={design}
          onEdit={onEditDesign}
          onCopy={onCopyDesign}
          onDelete={onDeleteDesign}
          onView={onViewDesign}
        />
      ))}
    </div>
  );
};

export default DesignGrid;
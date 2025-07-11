import React from 'react';
import Input from '@/components/common/Input';
import Select from '@/components/common/Select';
import { BasicInfo } from '@/store/core/projectStore';
import styles from '../styles/common.module.css';

interface BasicInfoControlsProps {
  basicInfo: BasicInfo;
  onUpdate: (updates: Partial<BasicInfo>) => void;
}

const LOCATION_OPTIONS = [
  { value: 'master_bedroom', label: '안방' },
  { value: 'small_bedroom', label: '작은방' },
  { value: 'dressing_room', label: '드레스룸' },
  { value: 'living_room', label: '거실' },
  { value: 'kitchen', label: '주방' },
  { value: 'entrance', label: '현관' },
  { value: 'other', label: '기타' },
];

const BasicInfoControls: React.FC<BasicInfoControlsProps> = ({ basicInfo, onUpdate }) => {
  return (
    <div className={styles.container}>
      <div className={styles.inlineLayout}>
        <div className={styles.titleField}>
          <span className={styles.label}>디자인 제목</span>
          <Input
            placeholder="디자인 제목을 입력하세요"
            value={basicInfo.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
          />
        </div>

        <div className={styles.locationField}>
          <span className={styles.label}>가구 위치</span>
          <Select
            options={LOCATION_OPTIONS}
            value={basicInfo.location}
            placeholder="가구 위치를 선택하세요"
            onChange={(e) => onUpdate({ location: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
};

export default BasicInfoControls; 
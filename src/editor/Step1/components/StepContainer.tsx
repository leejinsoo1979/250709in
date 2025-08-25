import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProjectStore } from '@/store/core/projectStore';
import Step1BasicInfo from './Step1BasicInfo';
import Step2SpaceAndCustomization from './Step2SpaceAndCustomization';
import styles from './StepContainer.module.css';

interface StepContainerProps {
  onClose?: () => void;
  projectId?: string;
  projectTitle?: string;
}

export type StepType = 1 | 2;

const StepContainer: React.FC<StepContainerProps> = ({ onClose, projectId: propsProjectId, projectTitle }) => {
  const [currentStep, setCurrentStep] = useState<StepType>(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const { projectId } = useProjectStore();

  // projectId가 설정되면 URL 업데이트
  useEffect(() => {
    if (projectId && currentStep === 2) {
      // Step2로 이동할 때 projectId를 URL에 추가
      searchParams.set('projectId', projectId);
      setSearchParams(searchParams);
    }
  }, [projectId, currentStep]);

  const handleNext = () => {
    if (currentStep < 2) {
      setCurrentStep((prev) => (prev + 1) as StepType);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as StepType);
    }
  };

  const handleClose = () => {
    if (onClose) onClose();
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1BasicInfo
            onNext={handleNext}
            onClose={handleClose}
            projectId={propsProjectId}
            projectTitle={projectTitle}
          />
        );
      case 2:
        return (
          <Step2SpaceAndCustomization
            onPrevious={handlePrevious}
            onClose={handleClose}
            projectId={projectId || propsProjectId}  // store의 projectId를 우선 사용
            projectTitle={projectTitle}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className={styles.stepContainer}>
      {renderStep()}
    </div>
  );
};

export default StepContainer;
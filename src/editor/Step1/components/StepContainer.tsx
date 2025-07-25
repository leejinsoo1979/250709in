import React, { useState } from 'react';
import Step1BasicInfo from './Step1BasicInfo';
import Step2SpaceConfig from './Step2SpaceConfig';
import Step3Confirmation from './Step3Confirmation';
import styles from './StepContainer.module.css';

interface StepContainerProps {
  onClose?: () => void;
}

export type StepType = 1 | 2 | 3;

const StepContainer: React.FC<StepContainerProps> = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState<StepType>(1);

  const handleNext = () => {
    if (currentStep < 3) {
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
          />
        );
      case 2:
        return (
          <Step2SpaceConfig
            onNext={handleNext}
            onPrevious={handlePrevious}
            onClose={handleClose}
          />
        );
      case 3:
        return (
          <Step3Confirmation
            onPrevious={handlePrevious}
            onClose={handleClose}
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
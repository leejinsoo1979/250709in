interface FAQ {
  keywords: string[];
  answer: string;
}

export const faqData: FAQ[] = [
  // 프로젝트 관련
  {
    keywords: ['프로젝트', '저장', '세이브', 'save', 'project'],
    answer: '프로젝트는 자동으로 저장됩니다. 상단의 "저장" 버튼을 클릭하거나 Ctrl+S (Mac: Cmd+S)를 눌러 수동 저장할 수도 있습니다.',
  },
  {
    keywords: ['불러오기', '로드', 'load', '열기', 'open'],
    answer: '대시보드에서 "내 프로젝트" 목록을 확인하고 원하는 프로젝트를 클릭하면 불러올 수 있습니다.',
  },
  {
    keywords: ['공유', 'share', '다른사람'],
    answer: '프로젝트를 공유하려면 상단의 "공유" 버튼을 클릭하고 공유할 사용자의 이메일을 입력하세요. 조회 권한 또는 편집 권한을 선택할 수 있습니다.',
  },

  // 가구 관련
  {
    keywords: ['가구', '배치', '추가', 'furniture', '모듈'],
    answer: '좌측 사이드바에서 원하는 가구를 선택하고 3D 뷰에서 원하는 위치를 클릭하여 배치할 수 있습니다. 배치된 가구는 드래그로 이동할 수 있습니다.',
  },
  {
    keywords: ['삭제', 'delete', '제거', 'remove'],
    answer: '삭제하려는 가구를 선택하고 Delete 키를 누르거나, 가구를 선택한 후 우측 패널의 "삭제" 버튼을 클릭하세요.',
  },
  {
    keywords: ['회전', 'rotate', '돌리기'],
    answer: '가구를 선택하고 회전 핸들을 드래그하거나, 우측 패널에서 회전 각도를 직접 입력할 수 있습니다.',
  },
  {
    keywords: ['크기', 'size', '치수', '사이즈'],
    answer: '가구를 선택하면 우측 패널에서 가로, 세로, 높이를 조절할 수 있습니다. 일부 모듈식 가구는 미리 정의된 크기만 사용 가능합니다.',
  },

  // 공간 설정
  {
    keywords: ['공간', '방', 'space', 'room', '치수'],
    answer: '좌측 패널의 "공간 설정"에서 방의 가로, 세로, 높이를 설정할 수 있습니다. 벽 재질과 바닥 재질도 선택 가능합니다.',
  },
  {
    keywords: ['재질', 'material', '텍스처', 'texture'],
    answer: '"스타일링" 탭에서 벽, 바닥, 천장의 재질을 변경할 수 있습니다. 다양한 목재, 타일, 페인트 옵션이 있습니다.',
  },

  // 뷰 및 카메라
  {
    keywords: ['2D', '3D', '뷰', 'view', '시점'],
    answer: '상단의 뷰 전환 버튼으로 2D 평면도와 3D 입체도를 전환할 수 있습니다. 3D 뷰에서는 마우스 드래그로 시점을 회전할 수 있습니다.',
  },
  {
    keywords: ['줌', 'zoom', '확대', '축소'],
    answer: '마우스 휠을 사용하거나 트랙패드의 핀치 제스처로 확대/축소할 수 있습니다.',
  },

  // DXF 및 내보내기
  {
    keywords: ['DXF', 'dxf', '내보내기', 'export', '도면'],
    answer: 'DXF 파일로 내보내려면 상단 메뉴에서 "내보내기" > "DXF"를 선택하세요. 기술 도면으로 사용할 수 있는 2D 평면도가 생성됩니다.',
  },
  {
    keywords: ['다운로드', 'download', '저장'],
    answer: '프로젝트를 로컬에 저장하려면 "내보내기" 메뉴에서 원하는 형식을 선택하세요. DXF, PNG, PDF 등을 지원합니다.',
  },

  // 계정 및 플랜
  {
    keywords: ['플랜', 'plan', '요금', '결제', '구독'],
    answer: '현재 무료 플랜을 사용 중입니다. Pro 플랜으로 업그레이드하면 무제한 프로젝트, 고급 재질, 우선 지원을 받을 수 있습니다. 대시보드의 "플랜" 메뉴에서 확인하세요.',
  },
  {
    keywords: ['계정', 'account', '로그인', 'login'],
    answer: '우측 상단의 프로필 아이콘을 클릭하면 계정 설정, 로그아웃 등의 옵션을 확인할 수 있습니다.',
  },

  // 기술 지원
  {
    keywords: ['도움', 'help', '문의', '지원', 'support'],
    answer: '추가 도움이 필요하시면 support@coohom.com으로 문의해 주세요. 평일 09:00-18:00에 답변드립니다.',
  },
  {
    keywords: ['버그', 'bug', '오류', 'error', '문제'],
    answer: '버그를 발견하셨다면 support@coohom.com으로 상세한 내용을 보내주세요. 스크린샷과 함께 보내주시면 더 빠르게 해결할 수 있습니다.',
  },

  // 튜토리얼
  {
    keywords: ['튜토리얼', 'tutorial', '사용법', '시작', 'start'],
    answer: '대시보드의 "튜토리얼" 버튼을 클릭하면 단계별 가이드를 확인할 수 있습니다. 기본 조작법부터 고급 기능까지 안내합니다.',
  },
];

/**
 * 사용자 질문과 FAQ 매칭
 * @param userInput 사용자 입력
 * @param defaultMessage 매칭 실패 시 기본 메시지 (Firebase에서 불러온 값 사용)
 */
export function matchQuestion(userInput: string, defaultMessage?: string): string {
  const input = userInput.toLowerCase().trim();

  // 키워드 매칭
  for (const faq of faqData) {
    for (const keyword of faq.keywords) {
      if (input.includes(keyword.toLowerCase())) {
        return faq.answer;
      }
    }
  }

  // 매칭 실패 시 기본 답변 (Firebase 설정값 우선)
  if (defaultMessage) {
    return defaultMessage;
  }

  return `죄송합니다. 정확히 이해하지 못했습니다. 😅\n\n다음과 같은 주제로 질문해 주세요:\n\n• 프로젝트 저장 및 불러오기\n• 가구 배치 및 편집\n• 공간 설정 및 재질\n• 2D/3D 뷰 전환\n• DXF 내보내기\n• 플랜 및 계정\n\n또는 support@coohom.com으로 문의해 주세요!`;
}

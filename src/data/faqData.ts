interface FAQ {
  keywords: string[];
  answer: string;
}

export const faqData: FAQ[] = [
  // 프로젝트 관리
  {
    keywords: ['프로젝트', '생성', '시작', '새로만들기', 'create'],
    answer: '대시보드에서 "새 프로젝트" 버튼을 클릭하여 프로젝트를 생성할 수 있습니다. 프로젝트 이름을 입력하면 자동으로 디자인 파일이 생성됩니다.',
  },
  {
    keywords: ['저장', '세이브', 'save', '자동저장'],
    answer: '프로젝트는 자동으로 저장됩니다. 상단의 "저장" 버튼을 클릭하거나 Ctrl+S (Mac: Cmd+S)를 눌러 수동 저장할 수도 있습니다. 모든 프로젝트는 클라우드에 안전하게 보관됩니다.',
  },
  {
    keywords: ['불러오기', '열기', 'open', 'load'],
    answer: '대시보드에서 "내 프로젝트" 목록을 확인하고 원하는 프로젝트를 클릭하면 불러올 수 있습니다. 프로젝트 이름으로 검색도 가능합니다.',
  },
  {
    keywords: ['공유', 'share', '협업', '권한'],
    answer: '네, 가능합니다. 프로젝트를 공유하려면 상단의 "공유" 버튼을 클릭하고 공유할 사용자의 이메일을 입력하세요. 조회 권한 또는 편집 권한을 선택할 수 있습니다.',
  },

  // 공간 설정
  {
    keywords: ['공간', '치수', '크기', '너비', '폭', 'width'],
    answer: '좌측 사이드바의 "공간" 탭에서 공간의 너비(W), 깊이(D), 높이(H)를 설정할 수 있습니다. 수치를 직접 입력하거나 슬라이더로 조절 가능합니다.',
  },
  {
    keywords: ['기둥', '열', 'column', '칸'],
    answer: '좌측 "공간" 탭에서 기둥 개수를 설정할 수 있습니다. 기둥 개수에 따라 수납공간이 여러 칸으로 나뉘며, 각 칸마다 다른 모듈을 배치할 수 있습니다.',
  },
  {
    keywords: ['설치', '타입', '벽붙이', '아일랜드', 'install'],
    answer: '설치 타입은 "벽붙이형"과 "아일랜드형" 중 선택할 수 있습니다. 벽붙이형은 벽에 붙여 설치하고, 아일랜드형은 중앙에 독립적으로 배치됩니다.',
  },
  {
    keywords: ['마감재', '바닥', '벽', '천장', 'material'],
    answer: '좌측 "공간" 탭 하단의 "바닥 마감재" 섹션에서 바닥, 벽, 천장의 재질과 색상을 선택할 수 있습니다.',
  },

  // 모듈(가구) 배치
  {
    keywords: ['모듈', '가구', '추가', '배치', 'furniture', 'module'],
    answer: '좌측 사이드바의 "모듈" 탭에서 원하는 가구 모듈을 선택한 후 3D 뷰의 원하는 슬롯(칸)을 클릭하여 배치할 수 있습니다.',
  },
  {
    keywords: ['슬롯', '칸', '위치', 'slot'],
    answer: '슬롯은 기둥으로 구분된 각각의 수납 칸을 말합니다. 각 슬롯에 서로 다른 모듈을 배치할 수 있으며, 우측 패널에서 슬롯을 선택하여 관리할 수 있습니다.',
  },
  {
    keywords: ['모듈변경', '교체', '바꾸기', 'change'],
    answer: '배치된 모듈을 변경하려면 우측 패널에서 해당 슬롯을 선택한 후 모듈 라이브러리에서 다른 모듈을 선택하세요. 기존 모듈이 새 모듈로 교체됩니다.',
  },
  {
    keywords: ['삭제', '제거', 'delete', 'remove'],
    answer: '배치된 모듈을 삭제하려면 우측 패널에서 해당 슬롯을 선택한 후 "모듈 제거" 버튼을 클릭하세요.',
  },
  {
    keywords: ['문', '도어', 'door', '여닫이'],
    answer: '일부 모듈에는 문이 있습니다. 3D 뷰에서 문을 클릭하면 열고 닫을 수 있으며, 상단 컨트롤에서 "모든 문 열기/닫기" 버튼으로 전체 문을 제어할 수 있습니다.',
  },

  // 커스터마이징
  {
    keywords: ['상판', 'surround', '둘레', '테두리'],
    answer: '상판/둘레 설정은 우측 패널의 "커스터마이징" 섹션에서 할 수 있습니다. 상판 타입(기본/일체형/없음)과 측면 둘레 설정을 선택할 수 있습니다.',
  },
  {
    keywords: ['베이스', 'base', '하부', '받침'],
    answer: '베이스 캐비닛 타입은 우측 패널의 "커스터마이징" 섹션에서 선택할 수 있습니다. 일반형, 고급형, 높이 조절형 등 다양한 옵션이 있습니다.',
  },
  {
    keywords: ['간격', 'gap', '틈'],
    answer: '모듈 간의 간격(Gap)은 우측 패널의 "커스터마이징" 섹션에서 조절할 수 있습니다. 좌우 간격을 각각 설정할 수 있습니다.',
  },

  // 뷰 및 카메라
  {
    keywords: ['2D', '3D', '뷰', 'view', '시점'],
    answer: '상단 컨트롤 바에서 2D/3D 뷰를 전환할 수 있습니다. 2D 뷰에서는 정면/좌측/우측 방향을 선택할 수 있고, 3D 뷰에서는 마우스로 자유롭게 회전할 수 있습니다.',
  },
  {
    keywords: ['확대', '축소', 'zoom', '줌'],
    answer: '마우스 휠을 사용하거나 트랙패드의 핀치 제스처로 확대/축소할 수 있습니다.',
  },
  {
    keywords: ['치수', '치수선', 'dimension', '표시'],
    answer: '상단 컨트롤 바의 "치수선" 버튼을 클릭하면 공간과 모듈의 치수를 표시하거나 숨길 수 있습니다.',
  },

  // 내보내기
  {
    keywords: ['DXF', 'dxf', '도면', '캐드', 'export'],
    answer: '상단 메뉴의 "내보내기" > "DXF"를 선택하면 CAD 프로그램에서 사용할 수 있는 2D 도면 파일을 다운로드할 수 있습니다.',
  },
  {
    keywords: ['PDF', 'pdf', '출력', 'print'],
    answer: '상단 메뉴의 "내보내기" > "PDF"를 선택하면 프로젝트 정보와 3D 이미지가 포함된 PDF 파일을 생성할 수 있습니다.',
  },
  {
    keywords: ['이미지', '스크린샷', 'image', 'png'],
    answer: '상단 메뉴의 "내보내기" > "이미지"를 선택하면 현재 3D 뷰를 PNG 이미지로 저장할 수 있습니다.',
  },

  // 기술 지원
  {
    keywords: ['문의', '지원', '도움', 'support', 'help'],
    answer: '기술 지원이 필요하시면 우측 하단의 챗봇으로 먼저 문의해 주세요. 추가 도움이 필요하시면 support@befun.com으로 메일을 보내주세요. 평일 09:00-18:00에 답변드립니다.',
  },
  {
    keywords: ['버그', '오류', 'bug', 'error', '문제', '신고'],
    answer: '버그를 발견하셨다면 support@befun.com으로 다음 정보를 보내주세요: 1) 버그 발생 상황 설명, 2) 재현 방법, 3) 스크린샷. 빠르게 확인하고 수정하겠습니다.',
  },

  // 계정 및 플랜
  {
    keywords: ['플랜', '요금', '무료', '유료', 'plan', 'subscription', '구독'],
    answer: '무료 플랜은 기본 기능과 제한된 프로젝트 수를 제공합니다. Pro 플랜으로 업그레이드하면 무제한 프로젝트, 고급 재질, 우선 지원, 팀 협업 기능을 사용할 수 있습니다.',
  },
  {
    keywords: ['업그레이드', '결제', 'upgrade', '구독신청'],
    answer: '대시보드의 "구독 관리" 메뉴에서 플랜을 선택하고 결제를 진행하면 됩니다. 신용카드, 계좌이체 등 다양한 결제 수단을 지원합니다.',
  },

  // CNC 옵티마이저
  {
    keywords: ['CNC', 'cnc', '옵티마이저', '절단', '최적화', 'optimizer'],
    answer: 'CNC 옵티마이저는 가구 부품의 절단 최적화를 도와주는 도구입니다. 자재 낭비를 최소화하고 생산 비용을 절감할 수 있습니다. 프로젝트 완성 후 상단 메뉴에서 "CNC 옵티마이저"를 선택하세요.',
  },

  // 일반
  {
    keywords: ['튜토리얼', '가이드', '시작', '처음', 'tutorial'],
    answer: '네, 있습니다. 대시보드의 "튜토리얼" 버튼을 클릭하면 단계별 가이드를 확인할 수 있습니다. 기본 조작법부터 고급 기능까지 안내합니다.',
  },
  {
    keywords: ['모바일', '핸드폰', '태블릿', 'mobile', 'tablet'],
    answer: '현재는 데스크톱 브라우저에 최적화되어 있습니다. 모바일에서는 프로젝트 조회와 간단한 편집만 가능합니다. 본격적인 작업은 PC 사용을 권장합니다.',
  },

  // 모듈 상세
  {
    keywords: ['회전', 'rotate', '각도', '방향'],
    answer: '가구를 선택하고 회전 핸들을 드래그하거나, 우측 패널에서 회전 각도를 직접 입력할 수 있습니다.',
  },
  {
    keywords: ['크기조절', 'resize', '사이즈', '크기변경'],
    answer: '가구를 선택하면 우측 패널에서 가로, 세로, 높이를 조절할 수 있습니다. 일부 모듈식 가구는 미리 정의된 크기만 사용 가능합니다.',
  },
];

/**
 * 두 문자열 간의 유사도 계산 (0~1 사이 값)
 * Jaccard 유사도 기반
 */
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * 사용자 질문과 FAQ 매칭 (유사도 기반)
 * @param userInput 사용자 입력
 * @param defaultMessage 매칭 실패 시 기본 메시지 (Firebase에서 불러온 값 사용)
 */
export function matchQuestion(userInput: string, defaultMessage?: string): string {
  const input = userInput.toLowerCase().trim();

  // 유사도 기반 매칭
  let bestMatch: { faq: FAQ; score: number } | null = null;

  for (const faq of faqData) {
    // 모든 키워드와 유사도 계산
    for (const keyword of faq.keywords) {
      const keywordLower = keyword.toLowerCase();

      // 정확한 매칭은 최고 점수
      if (input.includes(keywordLower) || keywordLower.includes(input)) {
        return faq.answer;
      }

      // 유사도 계산
      const similarity = calculateSimilarity(input, keywordLower);

      if (!bestMatch || similarity > bestMatch.score) {
        bestMatch = { faq, score: similarity };
      }
    }
  }

  // 유사도 임계값: 0.3 이상이면 답변 반환
  if (bestMatch && bestMatch.score >= 0.3) {
    return bestMatch.faq.answer;
  }

  // 매칭 실패 시 기본 답변 (Firebase 설정값 우선)
  if (defaultMessage) {
    return defaultMessage;
  }

  return `죄송합니다. 정확히 이해하지 못했습니다. 😅\n\n다음과 같은 주제로 질문해 주세요:\n\n• 프로젝트 생성 및 관리\n• 공간 설정 (치수, 기둥, 설치타입)\n• 모듈(가구) 배치 및 변경\n• 커스터마이징 (상판, 베이스, 간격)\n• 2D/3D 뷰 전환 및 치수선\n• DXF, PDF, 이미지 내보내기\n\n또는 support@uable.co.kr로 문의해 주세요!`;
}

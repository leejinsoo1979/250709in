export interface LowerCabinetMaidaRange {
  maidaHeightMm: number;
  maidaBottomMm: number;
  maidaTopMm: number;
}

interface LowerCabinetMaidaGeometryOptions {
  moduleId: string;
  moduleHeightMm: number;
  sourceModuleHeightMm?: number;
  stoneTopThicknessMm?: number;
  doorTopGap?: number;
  doorBottomGap?: number;
  hasTopEndPanel?: boolean;
  basicThicknessMm?: number;
  customMaidaHeights?: number[];
}

const roundMm = (value: number): number => Math.round(value * 10) / 10;

export const isLowerCabinetExternalMaidaModuleId = (moduleId?: string): boolean => {
  if (!moduleId) return false;
  return moduleId.includes('lower-drawer-')
    || moduleId.includes('lower-door-lift-')
    || moduleId.includes('lower-top-down-')
    || moduleId.includes('lower-induction-cabinet')
    || moduleId.includes('dual-lower-induction-cabinet');
};

export const computeLowerCabinetExternalMaidaRanges = ({
  moduleId,
  moduleHeightMm,
  sourceModuleHeightMm = moduleHeightMm,
  stoneTopThicknessMm = 20,
  doorTopGap,
  doorBottomGap,
  hasTopEndPanel = false,
  basicThicknessMm = 18,
  customMaidaHeights,
}: LowerCabinetMaidaGeometryOptions): LowerCabinetMaidaRange[] => {
  const currentCabinetHmm = Math.round(moduleHeightMm);

  if (moduleId.includes('lower-induction-cabinet') || moduleId.includes('dual-lower-induction-cabinet')) {
    const defaultTopGap = -20;
    const defaultBottomGap = 5;
    const effectiveTopGap = doorTopGap ?? defaultTopGap;
    const effectiveBottomGap = doorBottomGap ?? defaultBottomGap;
    const gapTopExt = effectiveTopGap - defaultTopGap;
    const gapBottomExt = effectiveBottomGap - defaultBottomGap;
    const gapMm = 3;
    const fixedUpperMaidaH = 427;
    // 사용자 입력(customMaidaHeights, [아래, 위])이 유효하면 위 마이다 높이를 입력값으로 쓴다.
    const cmh = Array.isArray(customMaidaHeights) && customMaidaHeights.length === 2
      && customMaidaHeights.every(v => typeof v === 'number' && v > 0) ? customMaidaHeights : undefined;
    const upperH = cmh ? cmh[1] : Math.max(0, fixedUpperMaidaH + gapTopExt);
    const upperTop = currentCabinetHmm - 20 + gapTopExt;
    const upperBottom = upperTop - upperH;
    const lowerTop = upperBottom - gapMm;
    const lowerBottom = -5 - gapBottomExt;
    const lowerH = Math.max(0, lowerTop - lowerBottom);
    return [
      { maidaHeightMm: roundMm(lowerH), maidaBottomMm: roundMm(lowerBottom), maidaTopMm: roundMm(lowerTop) },
      { maidaHeightMm: roundMm(upperH), maidaBottomMm: roundMm(upperBottom), maidaTopMm: roundMm(upperTop) },
    ];
  }

  const is1Tier = moduleId.includes('lower-drawer-1tier');
  const is2Tier = moduleId.includes('lower-drawer-2tier');
  const is3Tier = moduleId.includes('lower-drawer-3tier');
  const isDoorLift1Tier = moduleId.includes('lower-door-lift-1tier');
  const isDoorLift2Tier = moduleId.includes('lower-door-lift-2tier');
  const isDoorLift3Tier = moduleId.includes('lower-door-lift-3tier');
  const isTopDown1Tier = moduleId.includes('lower-top-down-1tier');
  const isTopDown2Tier = moduleId.includes('lower-top-down-2tier');
  const isTopDown3Tier = moduleId.includes('lower-top-down-3tier');
  const isDoorLiftTouch = moduleId.includes('lower-door-lift-touch-');
  const isTopDownTouch = moduleId.includes('lower-top-down-touch-');

  if (isDoorLiftTouch || isTopDownTouch) {
    const isTouch2A = moduleId.includes('lower-door-lift-touch-2tier-a');
    const isTouch2B = moduleId.includes('lower-door-lift-touch-2tier-b');
    const isTouch3 = moduleId.includes('lower-door-lift-touch-3tier');
    const isTDTouch2 = moduleId.includes('lower-top-down-touch-2tier');
    const isTDTouch3 = moduleId.includes('lower-top-down-touch-3tier');
    const drawerHeights = isTouch2A ? [228, 228]
      : isTouch2B ? [228, 228]
      : isTouch3 ? [228, 117, 117]
      : isTDTouch2 ? [228, 228]
      : isTDTouch3 ? [164, 164, 164]
      : [228, 228];
    const tdTouchStretcherH = stoneTopThicknessMm === 10 ? 65 : stoneTopThicknessMm === 30 ? 45 : 55;
    const defaultTopExtMm = isTopDownTouch ? -(tdTouchStretcherH + 25) : 30;
    const defaultBottomExtMm = 5;
    const topExtMm = isTopDownTouch
      ? (doorTopGap ?? defaultTopExtMm)
      : (doorTopGap ?? defaultTopExtMm);
    const bottomExtMm = doorBottomGap ?? defaultBottomExtMm;
    const totalFrontMm = currentCabinetHmm + topExtMm + bottomExtMm;
    const gapMm = 3;
    const drawerCount = drawerHeights.length;
    const totalDrawerH = drawerHeights.reduce((a, b) => a + b, 0);
    const isDoorLift2Fixed = drawerCount === 2 && (isTouch2A || isTouch2B);
    const isDoorLift3Fixed = drawerCount === 3 && isTouch3;
    const isTopDown2Fixed = drawerCount === 2 && isTDTouch2;
    const isTopDown3Fixed = drawerCount === 3 && isTDTouch3;
    const customMaidaValid = customMaidaHeights
      && customMaidaHeights.length === drawerCount
      && customMaidaHeights.every(v => typeof v === 'number' && v > 0);
    const baseMaidaHeightsMm = customMaidaValid
      ? [...customMaidaHeights!]
      : (isDoorLift2Fixed
        ? [408, 409]
        : isDoorLift3Fixed
          ? [360, 227, 227]
          : isTopDown2Fixed
            ? [353, 354]
            : isTopDown3Fixed
              ? [185, 240, 240]
              : drawerHeights.map(h => (h / totalDrawerH) * (totalFrontMm - (drawerCount - 1) * gapMm)));
    const maidaTotalFrontMm = isTopDownTouch
      ? totalFrontMm
      : currentCabinetHmm + defaultTopExtMm + defaultBottomExtMm;
    const maidaHeightsMm = [...baseMaidaHeightsMm];

    if (!customMaidaValid && (isDoorLift2Fixed || isTopDown2Fixed) && maidaHeightsMm.length === 2) {
      const evenH = Math.floor(Math.max(0, maidaTotalFrontMm - gapMm) / 2);
      maidaHeightsMm[0] = evenH;
      maidaHeightsMm[1] = evenH;
    }
    if (!customMaidaValid && isDoorLift3Fixed && maidaHeightsMm.length === 3) {
      const bottomFixed = 360;
      maidaHeightsMm[0] = bottomFixed;
      const remaining = Math.max(0, maidaTotalFrontMm - bottomFixed - gapMm * 2);
      const evenH = Math.floor(remaining / 2);
      maidaHeightsMm[1] = evenH;
      maidaHeightsMm[2] = evenH;
    }
    // ※ customMaidaValid(사용자 직접 입력)면 입력값 최우선 → topExt 보정 스킵
    //    (3D 렌더와 동일하게 처리, 치수가 위아래로 튀는 문제 방지)
    if (!customMaidaValid && isDoorLift3Fixed && maidaHeightsMm.length === 3) {
      const topExtDeltaMm = topExtMm - defaultTopExtMm;
      if (topExtDeltaMm !== 0) {
        maidaHeightsMm[2] = Math.max(0, maidaHeightsMm[2] + topExtDeltaMm);
      }
    }
    if (!customMaidaValid && (isTopDown2Fixed || isTopDown3Fixed) && maidaHeightsMm.length >= 2) {
      const upperMaidasSum = maidaHeightsMm.slice(1).reduce((a, b) => a + b, 0);
      const upperBundle = upperMaidasSum + (maidaHeightsMm.length - 1) * gapMm;
      maidaHeightsMm[0] = Math.max(0, maidaTotalFrontMm - upperBundle);
    }

    if ((isTopDownTouch || isDoorLift2Fixed || isDoorLift3Fixed) && maidaHeightsMm.length >= 2) {
      const lastIdx = maidaHeightsMm.length - 1;
      const topShiftMm = isDoorLift3Fixed ? (topExtMm - defaultTopExtMm) : 0;
      const topPositionMm = isTopDownTouch
        ? -bottomExtMm + maidaTotalFrontMm
        : -defaultBottomExtMm + maidaTotalFrontMm + topShiftMm;
      const result: LowerCabinetMaidaRange[] = new Array(maidaHeightsMm.length);
      if (customMaidaValid) {
        // 3D 렌더와 동일: 맨 아래 하단을 가구 바닥에 고정하고 아래→위로 입력값 누적.
        let cursorBottom = -bottomExtMm;
        for (let i = 0; i <= lastIdx; i++) {
          const height = maidaHeightsMm[i];
          result[i] = {
            maidaHeightMm: roundMm(height),
            maidaBottomMm: roundMm(cursorBottom),
            maidaTopMm: roundMm(cursorBottom + height),
          };
          cursorBottom += height + gapMm;
        }
        return result;
      }
      // 자동(미입력): 천장 고정 위→아래, 맨 아래가 남는 공간 흡수.
      let cursorTop = topPositionMm;
      for (let i = lastIdx; i >= 1; i--) {
        const height = maidaHeightsMm[i];
        const bottom = cursorTop - height;
        result[i] = {
          maidaHeightMm: roundMm(height),
          maidaBottomMm: roundMm(bottom),
          maidaTopMm: roundMm(cursorTop),
        };
        cursorTop = bottom - gapMm;
      }
      const bottomStart = -bottomExtMm;
      const bottomHeight = Math.max(0, cursorTop - bottomStart);
      result[0] = {
        maidaHeightMm: roundMm(bottomHeight),
        maidaBottomMm: roundMm(bottomStart),
        maidaTopMm: roundMm(bottomStart + bottomHeight),
      };
      return result;
    }

    let currentBottomMm = -defaultBottomExtMm;
    return maidaHeightsMm.map(height => {
      const bottom = currentBottomMm;
      currentBottomMm += height + gapMm;
      return {
        maidaHeightMm: roundMm(height),
        maidaBottomMm: roundMm(bottom),
        maidaTopMm: roundMm(bottom + height),
      };
    });
  }
  if (!(is1Tier || is2Tier || is3Tier || isDoorLift1Tier || isDoorLift2Tier || isDoorLift3Tier || isTopDown1Tier || isTopDown2Tier || isTopDown3Tier)) {
    return [];
  }

  const topDownDefaultTopGap = hasTopEndPanel ? -82 : stoneTopThicknessMm === 10 ? -90 : stoneTopThicknessMm === 30 ? -70 : -80;
  const defaultDrawerTopGap = (isTopDown1Tier || isTopDown2Tier || isTopDown3Tier)
    ? topDownDefaultTopGap
    : (isDoorLift1Tier || isDoorLift2Tier || isDoorLift3Tier)
      ? 30
      : -20;
  const defaultDrawerBottomGap = 5;
  const effectiveDrawerTopGap = (isTopDown1Tier || isTopDown2Tier || isTopDown3Tier) && (doorTopGap === undefined || doorTopGap === 0)
    ? defaultDrawerTopGap
    : (doorTopGap ?? defaultDrawerTopGap);
  const effectiveDrawerBottomGap = doorBottomGap ?? defaultDrawerBottomGap;

  const drawer2TierFromBottom = (currentCabinetHmm - 125) / 2;
  const doorLift2TierNotch = Math.max(0, Math.round((currentCabinetHmm - 75) / 2));
  const doorLift2TierMaidaH = Math.max(0, doorLift2TierNotch + 45);
  const doorLift3TierUpperMaidaH = Math.max(0, Math.round((currentCabinetHmm - 365) / 2));
  const doorLift3TierNotch2 = Math.max(380, doorLift3TierUpperMaidaH + 335);
  const drawer3TierDelta = currentCabinetHmm - 785;
  const topDownStretcherH = stoneTopThicknessMm === 10 ? 65 : stoneTopThicknessMm === 30 ? 45 : 55;
  const topDownStretcherDelta = topDownStretcherH - 55;
  const oneTierMaidaH = Math.max(0, currentCabinetHmm + defaultDrawerTopGap + defaultDrawerBottomGap);
  const topDownOneTierChannelBottom = currentCabinetHmm - (topDownStretcherH + 65);
  const topDownOneTierMaidaH = Math.max(0, topDownOneTierChannelBottom + 5);

  const notchFromBottoms = is3Tier
    ? [295 + drawer3TierDelta, 510 + drawer3TierDelta]
    : isDoorLift3Tier ? [315, doorLift3TierNotch2]
    : isDoorLift2Tier ? [doorLift2TierNotch]
    : isDoorLift1Tier ? []
    : isTopDown3Tier ? [225 + drawer3TierDelta - topDownStretcherDelta, 445 + drawer3TierDelta - topDownStretcherDelta, 665 + drawer3TierDelta - topDownStretcherDelta]
    : isTopDown2Tier ? [Math.round((currentCabinetHmm + stoneTopThicknessMm - 20 - 185) / 2), currentCabinetHmm - (topDownStretcherH + 65)]
    : isTopDown1Tier ? [currentCabinetHmm - (topDownStretcherH + 65)]
    : is1Tier ? []
    : [drawer2TierFromBottom];
  const notchHeights = is3Tier ? [65, 65]
    : isDoorLift3Tier ? [65, 65]
    : isDoorLift2Tier ? [65]
    : isTopDown3Tier ? [65, 65, 65]
    : isTopDown2Tier ? [65, 65]
    : isTopDown1Tier ? [65]
    : [];
  const drawerCount = (is3Tier || isDoorLift3Tier || isTopDown3Tier) ? 3 : (is1Tier || isDoorLift1Tier || isTopDown1Tier) ? 1 : 2;
  const hideTopNotch = isDoorLift1Tier || isDoorLift2Tier || isDoorLift3Tier || isTopDown1Tier || isTopDown2Tier || isTopDown3Tier;
  const fixedMaidaHeights = isDoorLift1Tier || is1Tier
    ? [oneTierMaidaH]
    : isTopDown1Tier ? [topDownOneTierMaidaH]
    : isDoorLift2Tier ? [doorLift2TierMaidaH, doorLift2TierMaidaH]
    : isDoorLift3Tier ? [360, doorLift3TierUpperMaidaH, doorLift3TierUpperMaidaH]
    : undefined;

  const upperNotchH = 60;
  const upperNotchFromBottom = currentCabinetHmm - upperNotchH;
  const sortedNotches = notchFromBottoms
    .map((fromBottom, idx) => ({ fromBottom, height: notchHeights[idx] || 65 }))
    .sort((a, b) => a.fromBottom - b.fromBottom);
  const allNotches = hideTopNotch
    ? [...sortedNotches]
    : [...sortedNotches, { fromBottom: upperNotchFromBottom, height: upperNotchH }];
  const zones: { notchAboveBottom: number; notchBelowTop: number | null }[] = [];
  let cursor = 0;

  allNotches.forEach((notch, idx) => {
    if (notch.fromBottom > cursor) {
      zones.push({
        notchAboveBottom: notch.fromBottom,
        notchBelowTop: idx > 0 ? (allNotches[idx - 1].fromBottom + allNotches[idx - 1].height) : null,
      });
    }
    cursor = notch.fromBottom + notch.height;
  });

  if (hideTopNotch && cursor < currentCabinetHmm && zones.length < drawerCount) {
    const lastNotch = allNotches[allNotches.length - 1];
    zones.push({
      notchAboveBottom: currentCabinetHmm - basicThicknessMm,
      notchBelowTop: lastNotch ? (lastNotch.fromBottom + lastNotch.height) : null,
    });
  }

  return zones.slice(0, drawerCount).map((zone, idx) => {
    const isTopDrawer = idx === drawerCount - 1;
    const isBottomDrawer = idx === 0;
    const maidaTopMm = zone.notchAboveBottom + 40;
    const maidaBottomMm = zone.notchBelowTop != null ? (zone.notchBelowTop - 5) : -5;
    const gapTopExt = isTopDrawer ? (effectiveDrawerTopGap - defaultDrawerTopGap) : 0;
    const gapBottomExt = isBottomDrawer ? (effectiveDrawerBottomGap - defaultDrawerBottomGap) : 0;
    const defaultHeight = maidaTopMm - maidaBottomMm + gapTopExt + gapBottomExt;
    const fixedHeight = fixedMaidaHeights?.[idx];
    const height = Math.max(0, fixedHeight != null ? fixedHeight + gapTopExt + gapBottomExt : defaultHeight);
    const bottom = maidaBottomMm - gapBottomExt;
    return {
      maidaHeightMm: roundMm(height),
      maidaBottomMm: roundMm(bottom),
      maidaTopMm: roundMm(bottom + height),
    };
  });
};

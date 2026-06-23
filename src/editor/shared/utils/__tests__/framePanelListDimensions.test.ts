import { describe, expect, it } from 'vitest';
import { resolveCabinetBodyWidthDimension } from '../framePanelListDimensions';

describe('resolveCabinetBodyWidthDimension', () => {
  it('excludes hidden left EP from cabinet body width', () => {
    const result = resolveCabinetBodyWidthDimension({
      hasLeftEndPanel: true,
      hasRightEndPanel: false,
      endPanelThickness: 18,
      endPanelMode: 'inside',
    }, 490);

    expect(result.widthMm).toBe(472);
    expect(result.centerShiftMm).toBe(9);
  });

  it('excludes hidden EP on both sides from cabinet body width', () => {
    const result = resolveCabinetBodyWidthDimension({
      hasLeftEndPanel: true,
      hasRightEndPanel: true,
      endPanelThickness: 18,
      endPanelMode: 'inside',
    }, 490);

    expect(result.widthMm).toBe(454);
    expect(result.centerShiftMm).toBe(0);
  });

  it('keeps outside EP as an outside dimension concern', () => {
    const result = resolveCabinetBodyWidthDimension({
      hasLeftEndPanel: true,
      endPanelThickness: 18,
      endPanelMode: 'outside',
    }, 490);

    expect(result.widthMm).toBe(490);
    expect(result.centerShiftMm).toBe(0);
  });
});

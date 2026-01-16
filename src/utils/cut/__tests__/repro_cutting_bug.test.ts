
import { describe, it, expect } from 'vitest';
import { generateGuillotineCuts } from '../simulate';

describe('Guillotine Cut Generation Bug Repro', () => {
    it('should NOT merge disjoint secondary cuts that cross other strips', () => {
        const sheetW = 1000;
        const sheetH = 1000;

        // Panel 1: Left strip (0-100)
        // Panel 2: Right strip (200-300)
        // Panel 3: Middle strip (100-200) - taller
        const panels = [
            { id: 'p1', x: 0, y: 0, width: 100, height: 100 },      // Needs cut at y=100
            { id: 'p2', x: 200, y: 0, width: 100, height: 100 },    // Needs cut at y=100
            { id: 'p3', x: 100, y: 0, width: 100, height: 200 }     // Spans y=0 to 200. Should NOT be cut at y=100.
        ];

        // Optimization: BY_WIDTH (Vertical/X cuts first)
        // Expected Primary Cuts: x=100, x=200
        // Expected Strips:
        // 1. 0-100 (Contains p1) -> Secondary cut y=100.
        // 2. 100-200 (Contains p3) -> No cut at y=100 needed (p3 height is 200).
        // 3. 200-300 (Contains p2) -> Secondary cut y=100.

        // Expected Result:
        // - Two SEPARATE cuts at y=100.
        // - One spanning 0-100.
        // - One spanning 200-300.
        // - NO cut spanning 100-200.

        const cuts = generateGuillotineCuts(sheetW, sheetH, panels, 0, 'BY_WIDTH');

        // Check for y=100 cuts
        const y100Cuts = cuts.filter(c => c.axis === 'y' && Math.abs(c.pos - 100) < 1);

        console.log('Cuts at y=100:', y100Cuts.map(c => ({
            pos: c.pos,
            start: c.spanStart,
            end: c.spanEnd
        })));

        // If merged incorrectly, we might see one cut from 0 to 300
        const mergedCut = y100Cuts.find(c => c.spanStart === 0 && c.spanEnd >= 300);
        expect(mergedCut).toBeUndefined('Found invalid merged cut spanning across uncut middle strip');

        // We expect 2 cuts at y=100
        expect(y100Cuts.length).toBeGreaterThanOrEqual(2);
    });
});

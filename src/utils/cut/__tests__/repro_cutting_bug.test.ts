
import { describe, it, expect } from 'vitest';
import { generateGuillotineCuts } from '../simulate';

describe('Guillotine Cut Generation Bug Repro', () => {
    it('should NOT merge disjoint secondary cuts that cross other strips', () => {
        const sheetW = 1000;
        const sheetH = 1000;

        // Panel 1 & 2: Left strip (0-100) -> Split at y=50
        // Panel 3 & 4: Right strip (200-300) -> Split at y=50
        // Panel 5: Middle strip (100-200) -> Tall panel (0-100), no split at 50.
        const panels = [
            { id: 'p1a', x: 0, y: 0, width: 100, height: 50 },
            { id: 'p1b', x: 0, y: 50, width: 100, height: 50 },

            { id: 'p2a', x: 200, y: 0, width: 100, height: 50 },
            { id: 'p2b', x: 200, y: 50, width: 100, height: 50 },

            { id: 'p3', x: 100, y: 0, width: 100, height: 100 } // Spans y=0 to 100. Should NOT be cut at y=50.
        ];

        // Optimization: BY_WIDTH (Vertical/X cuts first)
        // Expected Primary Cuts: x=100, x=200
        // 3. 200-300 (Contains p2) -> Secondary cut y=100.

        // Expected Result:
        // - Two SEPARATE cuts at y=100.
        // - One spanning 0-100.
        // - One spanning 200-300.
        // - NO cut spanning 100-200.

        const cuts = generateGuillotineCuts(sheetW, sheetH, panels, 0, 'BY_WIDTH');

        // Check for y=50 cuts
        const y50Cuts = cuts.filter(c => c.axis === 'y' && Math.abs(c.pos - 50) < 1);

        console.log('Cuts at y=50:', y50Cuts.map(c => ({
            pos: c.pos,
            start: c.spanStart,
            end: c.spanEnd
        })));

        // If merged incorrectly, we might see one cut from 0 to 300
        // Strip 1 is 0-100. Strip 2 is 200-300. Middle uncut is 100-200.
        // An incorrect merge would span 0-300.
        const mergedCut = y50Cuts.find(c => c.spanStart === 0 && c.spanEnd >= 300);
        expect(mergedCut).toBeUndefined();

        // We expect 2 cuts at y=50 (one for strip 0-100, one for strip 200-300)
        expect(y50Cuts.length).toBeGreaterThanOrEqual(2);
    });
});

import { test, expect, Page } from '@playwright/test';

// Helper to set theme
async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('theme', t);
  }, theme);
  await page.waitForTimeout(300); // Wait for CSS transitions
}

// Helper to get element contrast ratio
async function getContrastRatio(page: Page, selector: string) {
  return await page.evaluate((sel) => {
    const element = document.querySelector(sel) as HTMLElement;
    if (!element) return 0;
    
    const style = window.getComputedStyle(element);
    const parent = element.parentElement;
    const parentStyle = parent ? window.getComputedStyle(parent) : null;
    
    // Calculate luminance
    const getLuminance = (r: number, g: number, b: number) => {
      const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };
    
    // Parse RGB values
    const parseColor = (str: string) => {
      const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return { r: 0, g: 0, b: 0 };
      return {
        r: parseInt(match[1]),
        g: parseInt(match[2]), 
        b: parseInt(match[3])
      };
    };
    
    const textColor = parseColor(style.color);
    const bgColor = parentStyle ? parseColor(parentStyle.backgroundColor) : { r: 255, g: 255, b: 255 };
    
    const textLum = getLuminance(textColor.r, textColor.g, textColor.b);
    const bgLum = getLuminance(bgColor.r, bgColor.g, bgColor.b);
    
    return (Math.max(textLum, bgLum) + 0.05) / (Math.min(textLum, bgLum) + 0.05);
  }, selector);
}

test.describe('Theme Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/configurator');
    await page.waitForSelector('.configurator', { state: 'visible' });
  });

  test('라벨이 라이트 테마에서 다크 테마로 전환 시 가시성 향상', async ({ page }) => {
    // Light theme visibility check
    await setTheme(page, 'light');
    
    // Check if RightPanel exists
    const rightPanel = page.locator('.right-panel').first();
    await expect(rightPanel).toBeVisible();
    
    // Take screenshot for light theme
    const lightScreenshot = await rightPanel.screenshot();
    
    // Check contrast in light theme
    const lightContrast = await page.evaluate(() => {
      const panel = document.querySelector('.right-panel') as HTMLElement;
      if (!panel) return { hasIssues: false, contrasts: [] };
      
      const labels = panel.querySelectorAll('label, .label, .dimension-label, .control-label, span');
      const contrasts: number[] = [];
      
      labels.forEach((label: Element) => {
        const style = window.getComputedStyle(label as HTMLElement);
        const parent = label.parentElement;
        const parentStyle = parent ? window.getComputedStyle(parent) : null;
        
        // Simple contrast check
        const isLightText = style.color.includes('255') || style.color.includes('fff');
        const isLightBg = parentStyle?.backgroundColor?.includes('255') || 
                         parentStyle?.backgroundColor?.includes('fff');
        
        if (isLightText && isLightBg) {
          contrasts.push(1); // Very low contrast
        } else {
          contrasts.push(10); // Acceptable contrast
        }
      });
      
      return {
        hasIssues: contrasts.some(c => c < 3),
        contrasts,
        averageContrast: contrasts.length > 0 ? 
          contrasts.reduce((a, b) => a + b, 0) / contrasts.length : 0
      };
    });
    
    // Switch to dark theme
    await setTheme(page, 'dark');
    
    // Take screenshot for dark theme
    const darkScreenshot = await rightPanel.screenshot();
    
    // Check contrast in dark theme
    const darkContrast = await page.evaluate(() => {
      const panel = document.querySelector('.right-panel') as HTMLElement;
      if (!panel) return { hasIssues: false, contrasts: [] };
      
      const labels = panel.querySelectorAll('label, .label, .dimension-label, .control-label, span');
      const contrasts: number[] = [];
      
      labels.forEach((label: Element) => {
        const style = window.getComputedStyle(label as HTMLElement);
        const parent = label.parentElement;
        const parentStyle = parent ? window.getComputedStyle(parent) : null;
        
        // Check for proper contrast in dark theme
        const textColor = style.color;
        const bgColor = parentStyle?.backgroundColor || '';
        
        // Dark theme should have light text on dark background
        const hasGoodContrast = !textColor.includes('0, 0, 0') && 
                               !bgColor.includes('255, 255, 255');
        
        contrasts.push(hasGoodContrast ? 10 : 1);
      });
      
      return {
        hasIssues: contrasts.some(c => c < 3),
        contrasts,
        averageContrast: contrasts.length > 0 ?
          contrasts.reduce((a, b) => a + b, 0) / contrasts.length : 0
      };
    });
    
    // Verify improvement
    expect(darkContrast.averageContrast).toBeGreaterThanOrEqual(lightContrast.averageContrast);
    expect(darkContrast.hasIssues).toBe(false);
    
    // Visual comparison - screenshots should be different
    expect(Buffer.compare(lightScreenshot, darkScreenshot)).not.toBe(0);
  });

  test('버튼이 모든 테마에서 보임', async ({ page }) => {
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      
      // Check primary buttons
      const buttons = page.locator('button').filter({ hasText: /저장|취소|확인/ });
      const count = await buttons.count();
      
      for (let i = 0; i < count; i++) {
        const button = buttons.nth(i);
        const isVisible = await button.isVisible();
        
        if (isVisible) {
          const contrast = await page.evaluate((el) => {
            if (!el) return 0;
            const style = window.getComputedStyle(el);
            const parent = el.parentElement;
            const parentStyle = parent ? window.getComputedStyle(parent) : null;
            
            // Simple visibility check
            return style.opacity !== '0' && style.visibility !== 'hidden' ? 10 : 1;
          }, await button.elementHandle());
          
          expect(contrast).toBeGreaterThan(3);
        }
      }
    }
  });

  test('사이드바 텍스트가 다크 테마에서 올바르게 표시', async ({ page }) => {
    await setTheme(page, 'dark');
    
    // Check sidebar exists
    const sidebar = page.locator('.sidebar, aside, [class*="sidebar"]').first();
    
    if (await sidebar.isVisible()) {
      const sidebarContrast = await page.evaluate(() => {
        const sidebar = document.querySelector('.sidebar, aside, [class*="sidebar"]') as HTMLElement;
        if (!sidebar) return { valid: false };
        
        const style = window.getComputedStyle(sidebar);
        const bgColor = style.backgroundColor;
        
        // Find text elements
        const textElements = sidebar.querySelectorAll('a, span, div, li');
        let hasGoodContrast = true;
        
        textElements.forEach((el: Element) => {
          const textStyle = window.getComputedStyle(el as HTMLElement);
          const textColor = textStyle.color;
          
          // Dark background should have light text
          if (bgColor.includes('0, 0, 0') || bgColor.includes('26, 26, 26')) {
            if (textColor.includes('0, 0, 0')) {
              hasGoodContrast = false;
            }
          }
        });
        
        return { valid: hasGoodContrast };
      });
      
      expect(sidebarContrast.valid).toBe(true);
    }
  });

  test('하드코딩된 테마 색상이 없음', async ({ page }) => {
    const hardcodedStyles = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      const issues: string[] = [];
      
      elements.forEach((el: Element) => {
        const inline = (el as HTMLElement).style;
        
        // Check for hardcoded colors
        const problematic = [
          'rgb(255, 255, 255)',
          'rgb(0, 0, 0)',
          '#ffffff',
          '#000000',
          'white',
          'black'
        ];
        
        if (inline.color || inline.backgroundColor) {
          problematic.forEach(color => {
            if (inline.cssText.toLowerCase().includes(color)) {
              issues.push(`${el.className}: ${inline.cssText}`);
            }
          });
        }
      });
      
      return issues;
    });
    
    expect(hardcodedStyles).toHaveLength(0);
  });

  test('픽셀 수준 비교 - 테마 변경 전후', async ({ page }) => {
    // Define area to compare (RightPanel labels area)
    const targetArea = { x: 100, y: 200, width: 300, height: 100 };
    
    // Light theme capture
    await setTheme(page, 'light');
    await page.waitForTimeout(500);
    const lightCapture = await page.screenshot({
      clip: targetArea,
      fullPage: false
    });
    
    // Dark theme capture
    await setTheme(page, 'dark');
    await page.waitForTimeout(500);
    const darkCapture = await page.screenshot({
      clip: targetArea,
      fullPage: false
    });
    
    // Compare buffers - they should be different
    const isDifferent = Buffer.compare(lightCapture, darkCapture) !== 0;
    expect(isDifferent).toBe(true);
    
    // Calculate rough difference percentage
    let diffPixels = 0;
    const totalPixels = lightCapture.length / 4; // RGBA
    
    for (let i = 0; i < lightCapture.length; i += 4) {
      const lightPixel = [
        lightCapture[i], 
        lightCapture[i + 1],
        lightCapture[i + 2], 
        lightCapture[i + 3]
      ];
      const darkPixel = [
        darkCapture[i],
        darkCapture[i + 1], 
        darkCapture[i + 2],
        darkCapture[i + 3]
      ];
      
      // Check if pixels are different (allowing small tolerance)
      const diff = Math.abs(lightPixel[0] - darkPixel[0]) +
                  Math.abs(lightPixel[1] - darkPixel[1]) +
                  Math.abs(lightPixel[2] - darkPixel[2]);
      
      if (diff > 30) { // Threshold for meaningful difference
        diffPixels++;
      }
    }
    
    const diffPercentage = (diffPixels / totalPixels) * 100;
    
    // Expect significant change (at least 10% of pixels)
    expect(diffPercentage).toBeGreaterThan(10);
    
    console.log(`Pixel difference between themes: ${diffPercentage.toFixed(2)}%`);
  });
});
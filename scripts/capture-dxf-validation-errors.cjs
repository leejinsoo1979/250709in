const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Create screenshots directory
const screenshotsDir = path.join(__dirname, '../screenshots/dxf-validation');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function captureScenario(page, scenarioName, setupFunction) {
  console.log(`\n📷 Capturing scenario: ${scenarioName}`);
  
  // Navigate to the app
  await page.goto('http://localhost:5175/');
  
  // Skip step0 by going directly to configurator
  await page.goto('http://localhost:5175/configurator');
  await page.waitForTimeout(2000); // Wait for initial load
  
  // Apply the scenario-specific setup
  await setupFunction(page);
  
  // Wait for UI to update
  await page.waitForTimeout(2000);
  
  // Open export panel (click the export tab)
  const exportTab = await page.locator('button:has-text("내보내기")').first();
  if (await exportTab.isVisible()) {
    await exportTab.click();
    await page.waitForTimeout(1000);
  }
  
  // Make sure DXF tab is selected
  const dxfTab = await page.locator('button:has-text("CAD 도면")').first();
  if (await dxfTab.isVisible()) {
    await dxfTab.click();
    await page.waitForTimeout(500);
  }
  
  // Select at least one drawing type (front view)
  const frontViewCheckbox = await page.locator('input[type="checkbox"]').first();
  if (await frontViewCheckbox.isVisible() && !(await frontViewCheckbox.isChecked())) {
    await frontViewCheckbox.click();
    await page.waitForTimeout(500);
  }
  
  // Find the DXF export button (ZIP download button)
  const exportButton = await page.locator('button:has-text("ZIP 파일로 다운로드")').first();
  
  // Hover over the disabled button to show tooltip
  if (await exportButton.isVisible()) {
    await exportButton.hover();
    await page.waitForTimeout(1000); // Wait for tooltip to appear
  }
  
  // Take a screenshot of the export panel
  const exportPanel = await page.locator('div').filter({ hasText: '내보내기현재 가구 배치를 도면' }).first();
  
  const screenshotPath = path.join(screenshotsDir, `${scenarioName.toLowerCase().replace(/\s+/g, '-')}.png`);
  
  if (await exportPanel.isVisible()) {
    await exportPanel.screenshot({ path: screenshotPath });
    console.log(`✅ Screenshot saved: ${screenshotPath}`);
  } else {
    // Fallback to full page screenshot
    await page.screenshot({ path: screenshotPath });
    console.log(`✅ Full page screenshot saved: ${screenshotPath}`);
  }
  
  // Also capture the validation error message
  const statusMessage = await page.locator('.statusMessage').first();
  if (await statusMessage.isVisible()) {
    const errorText = await statusMessage.textContent();
    console.log(`   Error message: ${errorText}`);
  }
}

async function main() {
  console.log('🚀 Starting DXF validation error capture...\n');
  
  const browser = await chromium.launch({
    headless: false, // Set to true for headless mode
    slowMo: 100 // Slow down actions for visibility
  });
  
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  
  const page = await context.newPage();
  
  try {
    // Scenario 1: Invalid Space Dimensions (0 or negative values)
    await captureScenario(page, 'scenario-1-invalid-dimensions', async (page) => {
      console.log('   Setting invalid space dimensions...');
      
      // Open space configuration
      const spaceTab = await page.locator('button:has-text("공간")').first();
      if (await spaceTab.isVisible()) {
        await spaceTab.click();
        await page.waitForTimeout(500);
      }
      
      // Try to set width to 0
      const widthInput = await page.locator('input[type="number"]').first();
      if (await widthInput.isVisible()) {
        await widthInput.fill('0');
        await page.waitForTimeout(500);
      }
    });
    
    // Scenario 2: Furniture Out of Bounds
    await captureScenario(page, 'scenario-2-furniture-out-of-bounds', async (page) => {
      console.log('   Setting up furniture out of bounds...');
      
      // First set valid space dimensions
      const spaceTab = await page.locator('button:has-text("공간")').first();
      if (await spaceTab.isVisible()) {
        await spaceTab.click();
        await page.waitForTimeout(500);
      }
      
      // Set small space dimensions
      const inputs = await page.locator('input[type="number"]').all();
      if (inputs.length >= 3) {
        await inputs[0].fill('1000'); // width
        await inputs[1].fill('2000'); // height
        await inputs[2].fill('500');  // depth
        await page.waitForTimeout(500);
      }
      
      // Go to furniture tab
      const furnitureTab = await page.locator('button:has-text("가구")').first();
      if (await furnitureTab.isVisible()) {
        await furnitureTab.click();
        await page.waitForTimeout(500);
      }
      
      // Add a furniture item
      const addButton = await page.locator('button').filter({ hasText: /추가|배치/ }).first();
      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(1000);
      }
      
      // We would need to manipulate the furniture position programmatically to place it out of bounds
      // For this demo, we'll use the console to directly modify the store
      await page.evaluate(() => {
        // Access the furniture store and place furniture out of bounds
        const furnitureStore = window.__furnitureStore || window.useFurnitureStore?.getState();
        if (furnitureStore && furnitureStore.placedModules && furnitureStore.placedModules.length > 0) {
          // Move the first furniture out of bounds
          furnitureStore.placedModules[0].position = { x: 5000, y: 0, z: 1000 };
        }
      });
    });
    
    // Scenario 3: No Space Information
    await captureScenario(page, 'scenario-3-no-space-info', async (page) => {
      console.log('   Clearing space information...');
      
      // Reset the space configuration to null/undefined
      await page.evaluate(() => {
        // Access the space config store and clear it
        const spaceStore = window.__spaceConfigStore || window.useSpaceConfigStore?.getState();
        if (spaceStore && spaceStore.setSpaceInfo) {
          spaceStore.setSpaceInfo(null);
        }
      });
      
      await page.waitForTimeout(1000);
    });
    
    console.log('\n✨ All scenarios captured successfully!\n');
    console.log(`📁 Screenshots saved in: ${screenshotsDir}`);
    
  } catch (error) {
    console.error('❌ Error during capture:', error);
  } finally {
    await browser.close();
  }
}

// Run the script
main().catch(console.error);
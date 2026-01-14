"""
기둥 앞 공간 고스트 시각적 확인 테스트
"""
from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)  # 브라우저 창 보이게
    page = browser.new_page(viewport={'width': 1400, 'height': 900})

    print("1. Configurator로 이동...")
    page.goto('http://localhost:5173/configurator', timeout=60000)
    time.sleep(3)

    print("2. 기둥 탭 클릭...")
    column_tab = page.locator('text=기둥').first
    column_tab.click()
    time.sleep(1)

    print("3. 기둥 C 배치 (더블클릭)...")
    thumbnails = page.locator('[draggable="true"]').all()
    for thumb in thumbnails:
        title = thumb.get_attribute('title') or ''
        if '기둥 C' in title or '300×300' in title:
            thumb.dblclick()
            time.sleep(2)
            break

    print("4. 모듈 탭 → 싱글장 선택...")
    module_tab = page.locator('text=모듈').first
    module_tab.click()
    time.sleep(1)

    single_tab = page.locator('text=싱글').first
    single_tab.click()
    time.sleep(1)

    thumbnails = page.locator('[draggable="true"]').all()
    if thumbnails:
        thumbnails[0].click()
        time.sleep(2)

    print("5. 스크린샷 캡처...")
    page.screenshot(path='/tmp/front_space_visual.png', full_page=False)
    print("   저장됨: /tmp/front_space_visual.png")

    print("\n6. 3D 뷰로 전환...")
    # 3D 버튼 클릭
    try:
        view_3d = page.locator('text=3D').first
        view_3d.click()
        time.sleep(2)
        page.screenshot(path='/tmp/front_space_3d.png', full_page=False)
        print("   3D 스크린샷: /tmp/front_space_3d.png")
    except:
        print("   3D 전환 실패")

    print("\n완료! 5초 후 브라우저 종료...")
    time.sleep(5)
    browser.close()

"""
기둥 배치 및 가시성 확인 테스트
"""
from playwright.sync_api import sync_playwright
import time

console_logs = []

def handle_console(msg):
    text = msg.text
    console_logs.append({'type': msg.type, 'text': text})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page(viewport={'width': 1400, 'height': 900})
    page.on('console', handle_console)

    print("1. Configurator로 이동...")
    page.goto('http://localhost:5173/configurator', timeout=60000)
    time.sleep(3)

    print("\n2. 기둥 탭 클릭...")
    column_tab = page.locator('text=기둥').first
    column_tab.click()
    time.sleep(1)
    page.screenshot(path='/tmp/step1_column_tab.png')

    print("\n3. 기둥 C 찾기 및 더블클릭...")
    thumbnails = page.locator('[draggable="true"]').all()
    print(f"   발견된 썸네일: {len(thumbnails)}개")

    for i, thumb in enumerate(thumbnails):
        title = thumb.get_attribute('title') or ''
        print(f"   {i}: {title[:60]}")

        if '기둥C' in title or '기둥 C' in title or '300×300' in title:
            print(f"\n   >>> 기둥 C 발견! 더블클릭합니다...")
            thumb.dblclick()
            time.sleep(3)
            page.screenshot(path='/tmp/step2_after_column_dblclick.png')
            break

    print("\n4. 기둥 배치 확인...")
    column_logs = [log for log in console_logs if 'columnsCount' in log['text'] or '기둥' in log['text']]
    for log in column_logs[-5:]:
        print(f"   {log['text'][:150]}")

    print("\n5. 모듈 탭 → 싱글장 선택...")
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
        page.screenshot(path='/tmp/step3_single_selected.png')
        print("   싱글장 선택됨")

    print("\n6. Front Space Ghost 로그 확인...")
    ghost_logs = [log for log in console_logs if 'Front Space Ghost' in log['text'] or 'Front Space Render' in log['text']]
    for log in ghost_logs[-5:]:
        print(f"   {log['text'][:200]}")

    print("\n7. 3초간 대기 후 최종 스크린샷...")
    time.sleep(3)
    page.screenshot(path='/tmp/step4_final.png')

    print("\n완료! 스크린샷 확인:")
    print("   /tmp/step1_column_tab.png")
    print("   /tmp/step2_after_column_dblclick.png")
    print("   /tmp/step3_single_selected.png")
    print("   /tmp/step4_final.png")

    print("\n10초 후 브라우저 종료...")
    time.sleep(10)
    browser.close()

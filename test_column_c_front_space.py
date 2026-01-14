"""
Column C 앞 공간 가구 배치 기능 테스트
"""
from playwright.sync_api import sync_playwright
import time

console_logs = []

def handle_console(msg):
    text = msg.text
    console_logs.append({'type': msg.type, 'text': text})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.on('console', handle_console)

    print("1. Configurator로 이동...")
    page.goto('http://localhost:5173/configurator', timeout=60000)
    time.sleep(3)
    print(f"   URL: {page.url}")

    print("\n2. 기둥 탭 클릭...")
    # 사이드바의 기둥 아이콘/탭 클릭
    try:
        column_tab = page.locator('text=기둥').first
        column_tab.click()
        time.sleep(1)
        print("   기둥 탭 클릭됨")
        page.screenshot(path='/tmp/step2_column_tab.png')
    except Exception as e:
        print(f"   기둥 탭 클릭 실패: {e}")

    print("\n3. 기둥 C 배치 (더블클릭)...")
    page.screenshot(path='/tmp/step3_before_column.png')

    # 기둥 C 찾기 - title에 "기둥 C" 또는 "300×300" 포함
    try:
        # 모든 썸네일 확인
        thumbnails = page.locator('[draggable="true"]').all()
        print(f"   드래그 가능한 썸네일 {len(thumbnails)}개 발견")

        for i, thumb in enumerate(thumbnails):
            title = thumb.get_attribute('title') or ''
            print(f"   썸네일 {i}: {title[:50]}")

            # 기둥 C 찾기 (300×300×2400mm 또는 기둥 C)
            if '기둥 C' in title or '300×300' in title:
                print(f"   >>> 기둥 C 발견! 더블클릭...")
                thumb.dblclick()
                time.sleep(2)
                break
    except Exception as e:
        print(f"   기둥 찾기 실패: {e}")

    page.screenshot(path='/tmp/step4_after_column.png')
    print("   스크린샷: /tmp/step4_after_column.png")

    # 기둥 배치 확인
    column_count_logs = [log for log in console_logs if 'columnsCount' in log['text'] or 'columnsData' in log['text']]
    print(f"\n   기둥 배치 로그:")
    for log in column_count_logs[-3:]:
        print(f"   {log['text'][:200]}")

    print("\n4. 모듈 탭으로 이동 및 싱글장 선택...")
    try:
        module_tab = page.locator('text=모듈').first
        module_tab.click()
        time.sleep(1)
        print("   모듈 탭 클릭됨")
    except:
        pass

    # 싱글(3) 탭 클릭
    try:
        single_tab = page.locator('text=싱글').first
        single_tab.click()
        time.sleep(1)
        print("   싱글 탭 클릭됨")
    except:
        pass

    # 첫 번째 싱글장 썸네일 클릭
    try:
        thumbnails = page.locator('[draggable="true"]').all()
        if thumbnails:
            thumbnails[0].click()
            time.sleep(2)
            print("   싱글장 클릭됨")
    except Exception as e:
        print(f"   싱글장 클릭 실패: {e}")

    page.screenshot(path='/tmp/step5_after_single.png')
    print("   스크린샷: /tmp/step5_after_single.png")

    print("\n5. Front Space 로그 분석...")

    # spaceInfo 기둥 정보
    print("\n=== spaceInfo 기둥 정보 ===")
    for log in console_logs:
        if 'spaceInfo 기둥 정보' in log['text']:
            print(log['text'][:600])

    # Front Space Debug
    print("\n=== Front Space Debug ===")
    for log in console_logs:
        if 'Front Space Debug' in log['text']:
            print(log['text'][:600])

    # Front Space Filter
    print("\n=== Front Space Filter ===")
    for log in console_logs:
        if 'Front Space Filter' in log['text']:
            print(log['text'][:600])

    # 기둥 슬롯 분석
    print("\n=== slotsWithColumn ===")
    for log in console_logs:
        if 'slotsWithColumn' in log['text']:
            print(log['text'][:600])

    browser.close()
    print("\n완료!")

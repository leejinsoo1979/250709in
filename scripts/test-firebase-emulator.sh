#!/bin/bash

# Firebase 에뮬레이터 테스트 스크립트
set -e

echo "🚀 Firebase 에뮬레이터 테스트 시작..."

# 에뮬레이터 상태 확인
check_emulator_status() {
    if lsof -i :8080 | grep LISTEN > /dev/null 2>&1; then
        echo "✅ Firestore 에뮬레이터가 이미 실행 중입니다 (포트 8080)"
        return 0
    else
        echo "❌ Firestore 에뮬레이터가 실행되지 않았습니다"
        return 1
    fi
}

# 에뮬레이터 시작 (백그라운드)
start_emulator() {
    echo "🔥 Firebase 에뮬레이터 시작 중..."
    npx firebase emulators:start --only auth,firestore,storage --project demo-test-project &
    EMULATOR_PID=$!
    echo "에뮬레이터 PID: $EMULATOR_PID"
    
    # 에뮬레이터가 시작될 때까지 대기
    echo "⏳ 에뮬레이터 시작 대기 중..."
    sleep 5
    
    # 최대 30초 대기
    for i in {1..6}; do
        if check_emulator_status; then
            echo "✅ 에뮬레이터가 성공적으로 시작되었습니다"
            return 0
        fi
        echo "대기 중... ($i/6)"
        sleep 5
    done
    
    echo "❌ 에뮬레이터 시작 실패"
    return 1
}

# 테스트 실행
run_tests() {
    echo "🧪 Firebase 통합 테스트 실행 중..."
    USE_FIREBASE_EMULATOR=1 npm run test -- src/firebase/__tests__/integration.test.ts --run
}

# 에뮬레이터 종료
stop_emulator() {
    if [ ! -z "$EMULATOR_PID" ]; then
        echo "🛑 에뮬레이터 종료 중 (PID: $EMULATOR_PID)..."
        kill $EMULATOR_PID 2>/dev/null || true
        wait $EMULATOR_PID 2>/dev/null || true
    fi
    
    # 포트 정리
    lsof -ti:8080 | xargs kill -9 2>/dev/null || true
    lsof -ti:9099 | xargs kill -9 2>/dev/null || true
    lsof -ti:9199 | xargs kill -9 2>/dev/null || true
    lsof -ti:4000 | xargs kill -9 2>/dev/null || true
    
    echo "✅ 에뮬레이터가 종료되었습니다"
}

# 트랩 설정 (스크립트 종료 시 에뮬레이터도 종료)
trap stop_emulator EXIT INT TERM

# 메인 실행 로직
main() {
    # 이미 실행 중인 에뮬레이터 확인
    if check_emulator_status; then
        echo "ℹ️  기존 에뮬레이터 사용"
        EXISTING_EMULATOR=true
    else
        # 에뮬레이터 시작
        if ! start_emulator; then
            echo "❌ 에뮬레이터를 시작할 수 없습니다"
            exit 1
        fi
        EXISTING_EMULATOR=false
    fi
    
    # 테스트 실행
    run_tests
    TEST_RESULT=$?
    
    # 결과 출력
    if [ $TEST_RESULT -eq 0 ]; then
        echo "✅ 모든 테스트가 성공했습니다!"
    else
        echo "❌ 테스트가 실패했습니다"
    fi
    
    # 기존 에뮬레이터가 아니었으면 종료
    if [ "$EXISTING_EMULATOR" = false ]; then
        stop_emulator
    else
        echo "ℹ️  기존 에뮬레이터는 계속 실행됩니다"
    fi
    
    exit $TEST_RESULT
}

# 스크립트 실행
main
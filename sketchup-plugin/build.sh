#!/usr/bin/env bash
# tttcraft for SketchUp - .rbz 빌드 스크립트
#
# Usage: ./build.sh [version]
#   ./build.sh            → tttcraft.rbz
#   ./build.sh 1.0.0      → tttcraft-1.0.0.rbz

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VERSION="${1:-}"
if [ -n "$VERSION" ]; then
  OUT="tttcraft-${VERSION}.rbz"
else
  OUT="tttcraft.rbz"
fi

# 기존 파일 제거
rm -f "$OUT"

# .rbz 는 사실상 zip. tttcraft.rb 진입점 + tttcraft/ 폴더를 묶는다.
zip -r "$OUT" tttcraft.rb tttcraft/ \
  -x "*.DS_Store" \
  -x "tttcraft/icons/README.md" \
  > /dev/null

echo "✅ Built: $OUT"
ls -lh "$OUT"

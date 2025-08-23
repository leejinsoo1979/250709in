#!/bin/bash

# Fix all vi.mocked() calls in test files
find src/firebase/__tests__ -name "*.test.ts" -type f | while read file; do
  echo "Fixing $file..."
  
  # Replace vi.mocked(functionName) with (functionName as any)
  sed -i '' 's/vi\.mocked(\([^)]*\))/(\1 as any)/g' "$file"
done

echo "Fixed all vi.mocked() calls"
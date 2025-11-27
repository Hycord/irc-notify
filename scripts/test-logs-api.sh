#!/bin/bash

# Test script for Logs API
# Usage: ./test-logs-api.sh

# Read auth token
if [ -f config/auth_token.txt ]; then
  TOKEN=$(cat config/auth_token.txt)
else
  echo "Error: config/auth_token.txt not found"
  exit 1
fi

API_BASE="http://localhost:3000/api"

echo "================================================"
echo "IRC Notify - Logs API Test Script"
echo "================================================"
echo ""

# Test 1: Discover all logs
echo "1. Discovering all available log files..."
echo ""
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/logs/discover" | jq '.'
echo ""
echo "================================================"
echo ""

# Test 2: Discover logs for specific client
echo "2. Discovering logs for 'textual' client..."
echo ""
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/logs/discover?clientId=textual" | jq '.'
echo ""
echo "================================================"
echo ""

# Test 2b: Filter by type
echo "2b. Discovering only channel logs..."
echo ""
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/logs/discover?type=channel" | jq '.clients[].files[] | {channel: .target.name, server: .server.identifier}'
echo ""
echo "================================================"
echo ""

# Test 3: Get first log file path from discovery
echo "3. Reading sample log file (first 10 lines)..."
echo ""
LOG_PATH=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/logs/discover" | jq -r '.clients[0].files[0].path // empty' 2>/dev/null | tr -d '\n')

if [ ! -z "$LOG_PATH" ]; then
  echo "Reading: $LOG_PATH"
  echo ""
  ENCODED_PATH=$(printf '%s' "$LOG_PATH" | jq -sRr @uri)
  curl -s -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/logs/read?path=$ENCODED_PATH&limit=10" | jq '.'
else
  echo "No log files found"
fi
echo ""
echo "================================================"
echo ""

# Test 4: Tail recent messages
if [ ! -z "$LOG_PATH" ]; then
  echo "4. Tailing last 5 lines..."
  echo ""
  ENCODED_PATH=$(printf '%s' "$LOG_PATH" | jq -sRr @uri)
  curl -s -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/logs/tail?path=$ENCODED_PATH&lines=5" | jq '.'
  echo ""
  echo "================================================"
  echo ""
fi

# Test 5: Test Bun's automatic compression
if [ ! -z "$LOG_PATH" ]; then
  echo "5. Testing Bun's automatic compression..."
  echo ""
  
  ENCODED_PATH=$(printf '%s' "$LOG_PATH" | jq -sRr @uri)
  
  # Without compression
  echo "Requesting without compression..."
  UNCOMPRESSED_SIZE=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/logs/read?path=$ENCODED_PATH&limit=100" | wc -c)
  
  # With compression (--compressed adds Accept-Encoding: gzip)
  echo "Requesting with compression (--compressed flag)..."
  COMPRESSED_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/logs/read?path=$ENCODED_PATH&limit=100" \
    --compressed)
  COMPRESSED_SIZE=$(echo "$COMPRESSED_RESPONSE" | wc -c)
  
  echo ""
  echo "Response without compression: $UNCOMPRESSED_SIZE bytes"
  echo "Response with compression: $COMPRESSED_SIZE bytes"
  
  if [ $UNCOMPRESSED_SIZE -gt 0 ]; then
    SAVINGS=$(echo "scale=2; (1 - $COMPRESSED_SIZE / $UNCOMPRESSED_SIZE) * 100" | bc 2>/dev/null || echo "N/A")
    echo "Bandwidth savings: ~${SAVINGS}%"
  fi
  echo ""
  echo "Note: Bun automatically compresses when Accept-Encoding: gzip is present"
  echo ""
  echo "================================================"
fi

echo ""
echo "Tests complete!"

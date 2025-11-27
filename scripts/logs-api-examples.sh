#!/bin/bash

# Logs API Query Parameter Examples
# Demonstrates flexible filtering capabilities

if [ -f config/auth_token.txt ]; then
  TOKEN=$(cat config/auth_token.txt)
else
  echo "Error: config/auth_token.txt not found"
  exit 1
fi

API_BASE="http://localhost:3000/api"

echo "================================================"
echo "Logs API - Query Parameter Examples"
echo "================================================"
echo ""

echo "1. Filter by client ID:"
echo "   GET /api/logs/discover?clientId=textual"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/logs/discover?clientId=textual" | jq -c '.clients[].id'
echo ""

echo "2. Filter by server ID (from config):"
echo "   GET /api/logs/discover?serverId=libera"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/logs/discover?serverId=libera" | jq -c '.clients[].files[].server.identifier' | head -5
echo ""

echo "3. Filter by server name (from path):"
echo "   GET /api/logs/discover?server=Libera"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/logs/discover?server=Libera" | jq -c '.clients[].files[] | {server: .server.identifier, target: .target.name}' | head -5
echo ""

echo "4. Filter by channel name:"
echo "   GET /api/logs/discover?channel=linux"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/logs/discover?channel=linux" | jq -c '.clients[].files[] | {channel: .target.name, server: .server.identifier}'
echo ""

echo "5. Filter by target type (all channels):"
echo "   GET /api/logs/discover?type=channel"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/logs/discover?type=channel" | jq -c '.clients[].files[] | .target.name' | head -10
echo ""

echo "6. Filter by target type (all console logs):"
echo "   GET /api/logs/discover?type=console"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/logs/discover?type=console" | jq -c '.clients[].files[] | {type: .target.type, server: .server.identifier}'
echo ""

echo "7. Filter by query/PM:"
echo "   GET /api/logs/discover?query=username"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/logs/discover?query=username" | jq -c '.clients[].files[] | {user: .target.name, server: .server.identifier}'
echo ""

echo "8. Combine multiple filters:"
echo "   GET /api/logs/discover?server=Libera&type=channel&channel=linux"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/logs/discover?server=Libera&type=channel" | jq -c '.clients[].files[] | {channel: .target.name, server: .server.identifier}' | head -5
echo ""

echo "================================================"
echo "Compression Examples"
echo "================================================"
echo ""

echo "9. Automatic compression with curl --compressed:"
LOG_PATH=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/logs/discover?type=channel" | jq -r '.clients[0].files[0].path // empty' 2>/dev/null)

if [ ! -z "$LOG_PATH" ]; then
  echo "   GET /api/logs/tail?path=...&lines=50"
  echo "   (with Accept-Encoding: gzip header)"
  echo ""
  curl -s -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/logs/tail?path=$(echo "$LOG_PATH" | jq -sRr @uri)&lines=5" \
    --compressed | jq -c '{totalLines, returnedLines, lines: (.lines | length)}'
fi

echo ""
echo "================================================"
echo "Complete!"

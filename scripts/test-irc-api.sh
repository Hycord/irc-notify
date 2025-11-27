#!/bin/bash

# Test script for IRC-style Logs API
# Usage: ./test-irc-api.sh

# Read auth token
if [ -f config/auth_token.txt ]; then
  TOKEN=$(cat config/auth_token.txt)
else
  echo "Error: config/auth_token.txt not found"
  exit 1
fi

API_BASE="http://localhost:3000/api"

echo "================================================"
echo "IRC-Style Logs API Test Script"
echo "================================================"
echo ""

# Step 1: Get available clients
echo "1. Getting available clients from status..."
echo ""
CLIENTS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/status" | jq -r '.clients.list[] | select(.enabled) | .id')

if [ -z "$CLIENTS" ]; then
  echo "No enabled clients found"
  exit 1
fi

CLIENT_ID=$(echo "$CLIENTS" | head -1)
echo "Using client: $CLIENT_ID"
echo ""
echo "================================================"
echo ""

# Step 2: Get available servers
echo "2. Getting available servers..."
echo ""
SERVERS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/status" | jq -r '.servers.list[] | select(.enabled) | .id')

if [ -z "$SERVERS" ]; then
  echo "No enabled servers found"
  exit 1
fi

SERVER_ID=$(echo "$SERVERS" | head -1)
echo "Using server: $SERVER_ID"
echo ""
echo "================================================"
echo ""

# Step 3: List targets (channels/queries/console) for this client+server
echo "3. Listing targets for $CLIENT_ID @ $SERVER_ID..."
echo ""
TARGETS_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/logs/targets?clientId=$CLIENT_ID&serverId=$SERVER_ID")

echo "$TARGETS_RESPONSE" | jq '.'
echo ""
echo "================================================"
echo ""

# Step 4: Get console messages
echo "4. Reading Console messages (last 10 lines)..."
echo ""
HAS_CONSOLE=$(echo "$TARGETS_RESPONSE" | jq -r '.targets[] | select(.type == "console") | .name' | head -1)

if [ ! -z "$HAS_CONSOLE" ]; then
  CONSOLE_MESSAGES=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/logs/messages?clientId=$CLIENT_ID&serverId=$SERVER_ID&target=Console&type=console&limit=10")
  
  echo "$CONSOLE_MESSAGES" | jq '{totalLines, returnedLines, hasMore, lines: .lines[:3]}'
  echo ""
else
  echo "No console log found"
  echo ""
fi
echo "================================================"
echo ""

# Step 5: Get channel messages
echo "5. Reading first channel messages..."
echo ""
FIRST_CHANNEL=$(echo "$TARGETS_RESPONSE" | jq -r '.targets[] | select(.type == "channel") | .name' | head -1)

if [ ! -z "$FIRST_CHANNEL" ]; then
  echo "Channel: $FIRST_CHANNEL"
  echo ""
  # Properly URL encode the channel name (including # character)
  ENCODED_CHANNEL=$(printf '%s' "$FIRST_CHANNEL" | jq -sRr @uri)
  CHANNEL_MESSAGES=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/logs/messages?clientId=$CLIENT_ID&serverId=$SERVER_ID&target=$ENCODED_CHANNEL&type=channel&limit=5")
  
  echo "$CHANNEL_MESSAGES" | jq '{target, type, totalLines, lines: .lines[:3]}'
  echo ""
else
  echo "No channels found"
  echo ""
fi
echo "================================================"
echo ""

# Step 6: Pagination example
if [ ! -z "$FIRST_CHANNEL" ]; then
  echo "6. Testing pagination (second page)..."
  echo ""
  ENCODED_CHANNEL=$(printf '%s' "$FIRST_CHANNEL" | jq -sRr @uri)
  PAGE2=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/logs/messages?clientId=$CLIENT_ID&serverId=$SERVER_ID&target=$ENCODED_CHANNEL&type=channel&offset=5&limit=5")
  
  echo "$PAGE2" | jq '{offset, limit, returnedLines, hasMore}'
  echo ""
  echo "================================================"
fi

echo ""
echo "IRC-style API test complete!"
echo ""
echo "Summary:"
echo "  Client: $CLIENT_ID"
echo "  Server: $SERVER_ID"
echo "  Targets: $(echo "$TARGETS_RESPONSE" | jq -r '.targets | length')"
echo ""
echo "Usage pattern:"
echo "  1. GET /api/logs/targets?clientId=X&serverId=Y"
echo "  2. GET /api/logs/messages?clientId=X&serverId=Y&target=Z&type=T"
echo "  3. Paginate with &offset=N&limit=M"

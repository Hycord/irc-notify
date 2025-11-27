#!/usr/bin/env bash
#
# Simple script to send authenticated POST requests to the IRC Notify API
#
# Usage:
#   ./scripts/api-post.sh /api/config/reload
#   ./scripts/api-post.sh /api/config/upload?mode=merge -d @backup.json.gz
#

set -e

# Configuration
API_HOST="${API_HOST:-localhost}"
API_PORT="${API_PORT:-3001}"
AUTH_TOKEN_FILE="${AUTH_TOKEN_FILE:-config/auth_token.txt}"

# Check if route is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <api-route> [curl-options]"
  echo ""
  echo "Examples:"
  echo "  $0 /api/config/reload"
  echo "  $0 /api/config/upload?mode=merge -d @backup.json.gz"
  echo ""
  echo "Environment variables:"
  echo "  API_HOST=${API_HOST}"
  echo "  API_PORT=${API_PORT}"
  echo "  AUTH_TOKEN_FILE=${AUTH_TOKEN_FILE}"
  exit 1
fi

ROUTE="$1"
shift # Remove route from args, rest are passed to curl

# Read auth token
if [ ! -f "$AUTH_TOKEN_FILE" ]; then
  echo "Error: Auth token file not found: $AUTH_TOKEN_FILE"
  echo "Make sure the API server has been started at least once to generate the token."
  exit 1
fi

AUTH_TOKEN=$(cat "$AUTH_TOKEN_FILE" | tr -d '[:space:]')

if [ -z "$AUTH_TOKEN" ]; then
  echo "Error: Auth token is empty in $AUTH_TOKEN_FILE"
  exit 1
fi

# Ensure route starts with /
if [[ ! "$ROUTE" =~ ^/ ]]; then
  ROUTE="/$ROUTE"
fi

# Build URL
URL="http://${API_HOST}:${API_PORT}${ROUTE}"

# Send POST request
curl -s \
  -X POST \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Accept: application/json" \
  "$@" \
  "$URL"

# Add newline for better terminal output
echo ""

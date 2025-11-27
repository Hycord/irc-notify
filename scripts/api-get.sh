#!/usr/bin/env bash
#
# Simple script to send authenticated GET requests to the IRC Notify API
#
# Usage:
#   ./scripts/api-get.sh /api/health
#   ./scripts/api-get.sh /api/config/file/events/phrase-alert
#   ./scripts/api-get.sh /api/config/file/events/phrase-alert?format=ts
#

set -e

# Configuration
API_HOST="${API_HOST:-localhost}"
API_PORT="${API_PORT:-3000}"
AUTH_TOKEN_FILE="${AUTH_TOKEN_FILE:-config/auth_token.txt}"

# Check if route is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <api-route> [curl-options]"
  echo ""
  echo "Examples:"
  echo "  $0 /api/health"
  echo "  $0 /api/status"
  echo "  $0 /api/config/files"
  echo "  $0 /api/config/file/events/phrase-alert"
  echo "  $0 /api/config/file/events/phrase-alert?format=ts"
  echo "  $0 /api/config/file/events/phrase-alert -o output.json"
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

# Send request
curl -s \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Accept: application/json" \
  "$@" \
  "$URL"

# Add newline for better terminal output
echo ""

export default defineEvent({
  "id": "user-quit",
  "name": "User Disconnected",
  "enabled": true,
  "baseEvent": "quit",
  "serverIds": [
    "*"
  ],
  "priority": 10,
  "filters": {
    "operator": "AND",
    "filters": [
      {
        "field": "sender.nickname",
        "operator": "exists"
      }
    ]
  },
  "sinkIds": [
    "console"
  ],
  "metadata": {
    "description": "Triggers when any user disconnects from a server"
  }
});

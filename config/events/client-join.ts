export default defineEvent({
  "id": "client-join",
  "name": "Client Connected",
  "enabled": true,
  "baseEvent": "join",
  "serverIds": [
    "*"
  ],
  "priority": 50,
  "filters": {
    "operator": "AND",
    "filters": [
      {
        "field": "sender.nickname",
        "operator": "equals",
        "value": "{{server.metadata.clientNickname}}"
      }
    ]
  },
  "sinkIds": [
    "ntfy",
    "console"
  ],
  "metadata": {
    "description": "Triggers when the IRC client itself connects to a server or joins a channel",
    "sink": {
      "ntfy": {
        "priority": "default",
        "tags": [
          "green_circle",
          "white_check_mark",
          "rocket"
        ]
      }
    }
  }
});

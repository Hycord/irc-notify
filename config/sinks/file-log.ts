export default defineSink({
  "id": "file-log",
  "type": "file",
  "name": "File Logger",
  "enabled": true,
  "config": {
    "filePath": "./logs/notifications.log",
    "append": true
  },
  "template": {
    "format": "json"
  },
  "allowedMetadata": [
    "title",
    "body",
    "format",
    "filePath"
  ],
  "metadata": {
    "description": "Logs all notifications to a file. Supports custom title, body, format (text/json), and filePath override via event metadata."
  }
});

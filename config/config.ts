import { defineConfig } from '../src/config/types';

export default defineConfig({
  "global": {
    "defaultLogDirectory": "../logs",
    "pollInterval": 1000,
    "debug": false,
    "rescanLogsOnStartup": false,
    "configDirectory": "."
  },
  "api": {
    "enabled": true,
    "port": 3001,
    "host": "127.0.0.1",
    "enableFileOps": true
  },
  "clients": [
    "thelounge",
    "textual"
  ],
  "servers": [
    "libera",
    "orpheus",
    "mam"
  ],
  "events": [
    "phrase-alert",
    "client-quit",
    "client-join",
    "user-join",
    "direct-message",
    "user-quit",
    "bot-message",
    "server-notice",
    "client-ping"
  ],
  "sinks": [
    "file-log",
    "ntfy",
    "console"
  ]
});

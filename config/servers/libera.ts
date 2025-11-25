export default defineServer({
  "id": "libera",
  "hostname": "irc.libera.chat",
  "displayName": "Libera",
  "clientNickname": "Amallin",
  "enabled": true,
  "users": {
    "ChanServ": {
      "realname": "Channel Services",
      "modes": [
        "service"
      ]
    },
    "NickServ": {
      "realname": "Nickname Services",
      "modes": [
        "service"
      ]
    }
  },
  "metadata": {
    "description": "Libera Chat IRC Network",
    "website": "https://libera.chat"
  }
});

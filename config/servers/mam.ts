export default defineServer({
  id: "mam",
  hostname: "irc.myanonamouse.net",
  displayName: "MyAnonamouse",
  clientNickname: "Amallin",
  enabled: true,
  users: {
    ChanServ: {
      realname: "Channel Services",
      modes: ["service"],
    },
  },
  metadata: {
    description: "MyAnonamouse IRC Network",
    website: "https://www.myanonamouse.net",
  },
});

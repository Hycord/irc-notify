import { describe, expect, it } from "bun:test";
import { EventProcessor } from "../../src/events/processor";
import { EventConfig, MessageContext, ServerConfig } from "../../src/types";

const server: ServerConfig = {
  id: "libera",
  hostname: "irc.libera.chat",
  displayName: "Libera",
  clientNickname: "tester",
  enabled: true,
};
const event: EventConfig = {
  id: "match-hello",
  name: "Match Hello",
  enabled: true,
  baseEvent: "message",
  serverIds: ["*"],
  sinkIds: ["console"],
  filters: {
    operator: "AND",
    filters: [{ field: "message.content", operator: "contains", value: "hello" }],
  },
};

function ctx(content: string): MessageContext {
  return {
    raw: { line: content, timestamp: new Date().toISOString() },
    message: { content, type: "privmsg" },
    client: { id: "c", type: "test", name: "Test" },
    server: {},
    timestamp: new Date(),
    metadata: { serverIdentifier: "Libera" },
  };
}

describe("EventProcessor", () => {
  it("enriches server info and matches event", () => {
    const ep = new EventProcessor([event], [server], true);
    const matches = ep.processMessage(ctx("hello world"));
    expect(matches.length).toBe(1);
    expect(matches[0].id).toBe("match-hello");
  });
});

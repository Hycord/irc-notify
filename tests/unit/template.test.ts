import { describe, expect, it } from "bun:test";
import { MessageContext } from "../../src/types";
import { TemplateEngine } from "../../src/utils/template";

const context: MessageContext = {
  raw: { line: "x", timestamp: new Date().toISOString() },
  message: { content: "Hello", type: "privmsg" },
  client: { id: "c1", type: "test", name: "Test Client" },
  server: { id: "s1", displayName: "MyServer" },
  timestamp: new Date(),
  metadata: { extra: "value" },
  sender: { nickname: "alice" },
  target: { name: "#general", type: "channel" },
};

describe("TemplateEngine", () => {
  it("replaces variables", () => {
    const template = "[{{server.displayName}}] {{sender.nickname}}: {{message.content}}";
    expect(TemplateEngine.process(template, context)).toBe("[MyServer] alice: Hello");
  });

  it("leaves unknown variables intact", () => {
    const template = "Value: {{metadata.missing}}";
    expect(TemplateEngine.process(template, context)).toBe("Value: {{metadata.missing}}");
  });
});

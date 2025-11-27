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

  it("processes deep nested objects", () => {
    const input = {
      level1: {
        title: "Hello {{sender.nickname}}",
        level2: {
          description: "From {{server.displayName}}",
          tags: ["user:{{sender.nickname}}", "server:{{server.id}}"],
        },
        staticValue: 42,
      },
      array: ["{{sender.nickname}}", "static", "{{server.id}}"],
    };

    const result = TemplateEngine.processDeep(input, context);

    expect(result.level1.title).toBe("Hello alice");
    expect(result.level1.level2.description).toBe("From MyServer");
    expect(result.level1.level2.tags).toEqual(["user:alice", "server:s1"]);
    expect(result.level1.staticValue).toBe(42);
    expect(result.array).toEqual(["alice", "static", "s1"]);
  });

  it("handles strings without templates in processDeep", () => {
    const input = { plain: "no templates here", number: 123 };
    const result = TemplateEngine.processDeep(input, context);
    expect(result).toEqual(input);
  });

  it("handles null and undefined in processDeep", () => {
    const input = { nullValue: null, undefinedValue: undefined, nested: { a: null } };
    const result = TemplateEngine.processDeep(input, context);
    expect(result).toEqual(input);
  });

  it("processes arrays of objects", () => {
    const input = [{ name: "{{sender.nickname}}" }, { name: "{{server.id}}" }];
    const result = TemplateEngine.processDeep(input, context);
    expect(result).toEqual([{ name: "alice" }, { name: "s1" }]);
  });
});

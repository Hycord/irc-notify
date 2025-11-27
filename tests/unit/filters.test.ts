import { describe, expect, it } from "bun:test";
import { MessageContext } from "../../src/types";
import { FilterEngine } from "../../src/utils/filters";

function ctx(content: string): MessageContext {
  return {
    raw: { line: content, timestamp: new Date().toISOString() },
    message: { content, type: "privmsg" },
    client: { id: "c", type: "test", name: "Test" },
    server: {},
    timestamp: new Date(),
    metadata: {},
  };
}

describe("FilterEngine", () => {
  it("evaluates AND groups", () => {
    const context = ctx("hello world");
    const group = {
      operator: "AND",
      filters: [
        { field: "message.content", operator: "contains", value: "hello" },
        { field: "message.content", operator: "contains", value: "world" },
      ],
    };
    expect(FilterEngine.evaluate(group, context)).toBe(true);
  });

  it("evaluates OR groups", () => {
    const context = ctx("only one");
    const group = {
      operator: "OR",
      filters: [
        { field: "message.content", operator: "contains", value: "one" },
        { field: "message.content", operator: "contains", value: "two" },
      ],
    };
    expect(FilterEngine.evaluate(group, context)).toBe(true);
  });

  it("supports nested groups", () => {
    const context = ctx("alpha beta");
    const group = {
      operator: "AND",
      filters: [
        { field: "message.content", operator: "contains", value: "alpha" },
        {
          operator: "OR",
          filters: [
            { field: "message.content", operator: "contains", value: "gamma" },
            { field: "message.content", operator: "contains", value: "beta" },
          ],
        },
      ],
    };
    expect(FilterEngine.evaluate(group, context)).toBe(true);
  });

  it("handles regex matches", () => {
    const context = ctx("alert-123");
    const group = {
      operator: "AND",
      filters: [{ field: "message.content", operator: "matches", pattern: "alert-\\d+" }],
    };
    expect(FilterEngine.evaluate(group, context)).toBe(true);
  });

  it("resolves templates in filter values", () => {
    const context: MessageContext = {
      raw: { line: "test", timestamp: new Date().toISOString() },
      message: { content: "hello alice", type: "privmsg" },
      client: { id: "c", type: "test", name: "Test" },
      server: { clientNickname: "alice" },
      timestamp: new Date(),
      metadata: {},
      sender: { nickname: "bob" },
    };

    const group = {
      operator: "AND",
      filters: [
        { field: "message.content", operator: "contains", value: "{{server.clientNickname}}" },
      ],
    };
    expect(FilterEngine.evaluate(group, context)).toBe(true);
  });

  it("resolves templates in array filter values", () => {
    const context: MessageContext = {
      raw: { line: "test", timestamp: new Date().toISOString() },
      message: { content: "test", type: "privmsg" },
      client: { id: "c", type: "test", name: "Test" },
      server: { clientNickname: "alice" },
      timestamp: new Date(),
      metadata: {},
      sender: { nickname: "alice" },
    };

    const group = {
      operator: "AND",
      filters: [
        {
          field: "sender.nickname",
          operator: "in",
          value: ["{{server.clientNickname}}", "bob", "charlie"],
        },
      ],
    };
    expect(FilterEngine.evaluate(group, context)).toBe(true);
  });

  it("resolves templates in patterns", () => {
    const context: MessageContext = {
      raw: { line: "test", timestamp: new Date().toISOString() },
      message: { content: "hello alice", type: "privmsg" },
      client: { id: "c", type: "test", name: "Test" },
      server: { clientNickname: "alice" },
      timestamp: new Date(),
      metadata: {},
    };

    const group = {
      operator: "AND",
      filters: [
        {
          field: "message.content",
          operator: "matches",
          pattern: "{{server.clientNickname}}",
        },
      ],
    };
    expect(FilterEngine.evaluate(group, context)).toBe(true);
  });
});

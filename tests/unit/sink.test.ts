import { describe, expect, it } from "bun:test";
import { TestCaptureSink, buildTestSinkConfig } from "../../src/sinks/test-capture";
import { EventConfig, MessageContext } from "../../src/types";

describe("TestCaptureSink templating & metadata", () => {
  it("uses event sink-specific metadata templates", async () => {
    TestCaptureSink.clear();
    const sinkConfig = buildTestSinkConfig("test-sink");
    const sink = new TestCaptureSink(sinkConfig, true);
    await sink.initialize();
    const event: EventConfig = {
      id: "evt",
      name: "Evt",
      enabled: true,
      baseEvent: "message",
      serverIds: ["*"],
      sinkIds: ["test-sink"],
      metadata: {
        sink: {
          "test-sink": { title: "Custom {{sender.nickname}}", body: "Body {{message.content}}" },
        },
      },
    } as any;
    const context: MessageContext = {
      raw: { line: "x", timestamp: new Date().toISOString() },
      message: { content: "Hello Body", type: "privmsg" },
      client: { id: "c", type: "t", name: "Client" },
      server: {},
      timestamp: new Date(),
      metadata: {},
      sender: { nickname: "alice" },
    };
    await sink.send(context, event);
    const all = TestCaptureSink.all();
    expect(all.length).toBe(1);
    expect(all[0].title).toBe("Custom alice");
    expect(all[0].body).toBe("Body Hello Body");
  });
});

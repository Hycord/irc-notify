import { describe, expect, it, mock } from "bun:test";
import { WebhookSink } from "../../src/sinks/webhook";
import type { EventConfig, MessageContext, SinkConfig } from "../../src/types";

describe("WebhookSink", () => {
  const mockContext: MessageContext = {
    raw: {
      line: "[2025-11-26 10:00:00] <alice> hello world",
      timestamp: "2025-11-26 10:00:00",
    },
    message: {
      type: "privmsg",
      content: "hello world",
    },
    sender: {
      nickname: "alice",
    },
    target: {
      name: "#general",
      type: "channel",
    },
    client: {
      id: "test-client",
      type: "textual",
      name: "Test Client",
    },
    server: {
      id: "test-server",
      displayName: "Test Server",
      clientNickname: "bot",
    },
    timestamp: new Date("2025-11-26T10:00:00Z"),
    metadata: {},
  };

  const mockEvent: EventConfig = {
    id: "test-event",
    name: "Test Event",
    enabled: true,
    baseEvent: "message",
    serverIds: ["*"],
    sinkIds: ["webhook"],
  };

  it("sends webhook with JSON payload", async () => {
    const config: SinkConfig = {
      id: "webhook",
      type: "webhook",
      name: "Test Webhook",
      enabled: true,
      config: {
        url: "http://localhost:9999/webhook",
        method: "POST",
      },
      template: {
        title: "{{sender.nickname}}",
        body: "{{message.content}}",
      },
      payloadTransforms: [
        {
          name: "json",
          contentType: "application/json",
          bodyFormat: "json",
          jsonTemplate: {
            title: "{{title}}",
            body: "{{body}}",
          },
        },
      ],
    };

    const sink = new WebhookSink(config, true);
    await sink.initialize();

    // Mock fetch
    const originalFetch = global.fetch;
    let capturedRequest: any = null;
    global.fetch = mock(async (url: string, options: any) => {
      capturedRequest = { url, options };
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as any;

    await sink.sendNotification("Test", "Message", mockContext, mockEvent);

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest.url).toBe("http://localhost:9999/webhook");
    expect(capturedRequest.options.method).toBe("POST");

    const body = JSON.parse(capturedRequest.options.body);
    expect(body.title).toBe("Test");
    expect(body.body).toBe("Message");

    global.fetch = originalFetch;
  });

  it("uses text payload format", async () => {
    const config: SinkConfig = {
      id: "webhook",
      type: "webhook",
      name: "Test Webhook",
      enabled: true,
      config: {
        url: "http://localhost:9999/webhook",
        method: "POST",
      },
      template: {
        body: "{{message.content}}",
      },
      payloadTransforms: [
        {
          name: "text",
          contentType: "text/plain",
          bodyFormat: "text",
          textTemplate: "{{body}}",
        },
      ],
    };

    const sink = new WebhookSink(config, true);
    await sink.initialize();

    const originalFetch = global.fetch;
    let capturedRequest: any = null;
    global.fetch = mock(async (url: string, options: any) => {
      capturedRequest = { url, options };
      return new Response("OK", { status: 200 });
    });

    await sink.sendNotification("", "Test message", mockContext, mockEvent);

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest.options.body).toBe("Test message");

    global.fetch = originalFetch;
  });

  it("processes webhook successfully", async () => {
    const config: SinkConfig = {
      id: "webhook",
      type: "webhook",
      name: "Test Webhook",
      enabled: true,
      config: {
        url: "http://localhost:9999/webhook",
        method: "POST",
      },
      template: {
        body: "test",
      },
      payloadTransforms: [
        {
          name: "custom",
          contentType: "application/json",
          bodyFormat: "json",
          jsonTemplate: { message: "{{body}}" },
        },
      ],
    };

    const sink = new WebhookSink(config, false);
    await sink.initialize();

    const originalFetch = global.fetch;
    let capturedRequest: any = null;
    global.fetch = mock(async (url: string, options: any) => {
      capturedRequest = { url, options };
      return new Response("OK", { status: 200 });
    }) as any;

    await sink.sendNotification("", "test", mockContext, mockEvent);

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest.url).toBe("http://localhost:9999/webhook");
    expect(capturedRequest.options.method).toBe("POST");
    expect(capturedRequest.options.headers).toBeDefined();

    global.fetch = originalFetch;
  });
});

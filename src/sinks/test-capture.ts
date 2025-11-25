import { EventConfig, MessageContext, SinkConfig } from "../types";
import { BaseSink } from "./base";

interface CapturedNotification {
  title: string;
  body: string;
  context: MessageContext;
  event: EventConfig;
  timestamp: number;
}

export class TestCaptureSink extends BaseSink {
  private static notifications: CapturedNotification[] = [];

  async initialize(): Promise<void> {}

  async sendNotification(
    title: string,
    body: string,
    context: MessageContext,
    event: EventConfig,
  ): Promise<void> {
    TestCaptureSink.notifications.push({ title, body, context, event, timestamp: Date.now() });
  }

  static clear(): void {
    TestCaptureSink.notifications = [];
  }

  static all(): CapturedNotification[] {
    return [...TestCaptureSink.notifications];
  }
}

export function buildTestSinkConfig(id: string = "test-sink"): SinkConfig {
  return {
    id,
    type: "custom",
    name: "Test Capture Sink",
    enabled: true,
    config: {},
    template: { title: "{{event.name}}", body: "{{message.content}}" },
  };
}

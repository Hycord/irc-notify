import { EventConfig, MessageContext } from "../types";
import { BaseSink } from "./base";

/**
 * Webhook sink - sends HTTP POST requests
 */
export class WebhookSink extends BaseSink {
  private url!: string;
  private method!: string;
  private headers!: Record<string, string>;

  async initialize(): Promise<void> {
    this.url = this.config.config.url;
    this.method = this.config.config.method || "POST";
    this.headers = this.config.config.headers || {};

    if (!this.url) {
      throw new Error(`Webhook sink ${this.config.id} requires a URL`);
    }

    this.log(`Webhook sink initialized: ${this.method} ${this.url}`);
  }

  async sendNotification(
    title: string,
    body: string,
    context: MessageContext,
    event: EventConfig,
  ): Promise<void> {
    const format = this.config.template?.format || "json";

    let requestBody: string;
    let contentType: string;

    if (format === "json") {
      // Allow event to inject additional fields via metadata
      const extraFields = this.getEventMetadata(event, "webhook.fields") || {};

      requestBody = JSON.stringify({
        title,
        body,
        event: {
          id: event.id,
          name: event.name,
          baseEvent: event.baseEvent,
        },
        context: {
          client: context.client,
          server: context.server,
          sender: context.sender,
          target: context.target,
          message: context.message,
          timestamp: context.timestamp.toISOString(),
        },
        ...extraFields, // Allow event to add custom fields
      });
      contentType = "application/json";
    } else {
      requestBody = body;
      contentType = "text/plain";
    }

    const headers = {
      "Content-Type": contentType,
      ...this.headers,
    };

    // Allow event to override or add headers via metadata
    const eventHeaders = this.getEventMetadata(event, "webhook.headers");
    if (eventHeaders && typeof eventHeaders === "object") {
      Object.assign(headers, eventHeaders);
    }

    try {
      const response = await fetch(this.url, {
        method: this.method,
        headers,
        body: requestBody,
      });

      if (!response.ok) {
        throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
      }

      this.log(`Webhook notification sent successfully`);
    } catch (error) {
      console.error(`Failed to send webhook notification:`, error);
      throw error;
    }
  }
}

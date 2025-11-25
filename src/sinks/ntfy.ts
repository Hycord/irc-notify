import { EventConfig, MessageContext } from "../types";
import { BaseSink } from "./base";

/**
 * Ntfy sink - sends notifications to ntfy.sh
 */
export class NtfySink extends BaseSink {
  private endpoint!: string;
  private topic!: string;
  private token?: string;
  private priority!: string;
  private tags!: string[];

  async initialize(): Promise<void> {
    this.endpoint = this.config.config.endpoint || "https://ntfy.sh";
    this.topic = this.config.config.topic;
    this.token = this.config.config.token;
    this.priority = this.config.config.priority || "default";
    this.tags = this.config.config.tags || [];

    if (!this.topic) {
      throw new Error(`Ntfy sink ${this.config.id} requires a topic`);
    }

    this.log(`Ntfy sink initialized: ${this.endpoint}/${this.topic}`);
  }

  async sendNotification(
    title: string,
    body: string,
    context: MessageContext,
    event: EventConfig,
  ): Promise<void> {
    const url = `${this.endpoint}/${this.topic}`;

    // Get priority and tags from sink-specific metadata or fall back to sink config
    const priority = this.getSinkMetadata(event, "priority") || this.priority;

    const eventTags = this.getSinkMetadata(event, "tags");

    const tags = eventTags ? (Array.isArray(eventTags) ? eventTags : [eventTags]) : this.tags;

    const headers: Record<string, string> = {
      Title: title,
      Priority: priority,
      Tags: tags.join(","),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    // Add custom headers from config
    if (this.config.config.headers) {
      Object.assign(headers, this.config.config.headers);
    }

    // Allow event to override headers via sink-specific metadata
    const eventHeaders = this.getSinkMetadata(event, "headers");
    if (eventHeaders && typeof eventHeaders === "object") {
      Object.assign(headers, eventHeaders);
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
      });

      if (!response.ok) {
        throw new Error(`Ntfy request failed: ${response.status} ${response.statusText}`);
      }

      this.log(`Notification sent successfully`);
    } catch (error) {
      console.error(`Failed to send ntfy notification:`, error);
      throw error;
    }
  }
}

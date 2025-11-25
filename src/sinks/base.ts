import { EventConfig, MessageContext, Sink, SinkConfig } from "../types";
import { TemplateEngine } from "../utils/template";

/**
 * Base sink implementation with common functionality
 */
export abstract class BaseSink implements Sink {
  protected config: SinkConfig;
  protected debug: boolean;
  private rateLimitCounters: Map<string, number[]> = new Map();

  constructor(config: SinkConfig, debug: boolean = false) {
    this.config = config;
    this.debug = debug;
  }

  abstract initialize(): Promise<void>;
  abstract sendNotification(
    title: string,
    body: string,
    context: MessageContext,
    event: EventConfig,
  ): Promise<void>;

  async send(context: MessageContext, event: EventConfig): Promise<void> {
    // Check rate limits
    if (!this.checkRateLimit()) {
      this.log(`Rate limit exceeded for sink ${this.config.id}`);
      return;
    }

    // Determine title template - check event metadata.sink.{id} first, then sink config
    const titleTemplate =
      this.getSinkMetadata(event, "title") || this.config.template?.title || "{{event.name}}";

    // Determine body template - check event metadata.sink.{id} first, then sink config
    const bodyTemplate =
      this.getSinkMetadata(event, "body") || this.config.template?.body || "{{message.content}}";

    // Process templates
    const title = this.processTemplate(titleTemplate, context, event);
    const body = this.processTemplate(bodyTemplate, context, event);

    // Send notification
    await this.sendNotification(title, body, context, event);

    // Track rate limit
    this.trackRateLimit();
  }

  async destroy(): Promise<void> {
    // Default: no cleanup needed
  }

  /**
   * Process a template with context
   */
  protected processTemplate(template: string, context: MessageContext, event: EventConfig): string {
    // Create enhanced context with event info
    const enhancedContext = {
      ...context,
      event: {
        id: event.id,
        name: event.name,
        baseEvent: event.baseEvent,
      },
    };

    // Merge event.metadata.host into context.server for template variables
    if (event.metadata?.host && typeof event.metadata.host === "object") {
      enhancedContext.server = {
        ...enhancedContext.server,
        ...event.metadata.host,
      };
    }

    if (this.debug) {
      console.log("[DEBUG] Template:", template);
      console.log("[DEBUG] Context server:", JSON.stringify(enhancedContext.server, null, 2));
      console.log("[DEBUG] Context metadata:", JSON.stringify(context.metadata, null, 2));
    }

    return TemplateEngine.process(template, enhancedContext as any);
  }

  /**
   * Check if we're within rate limits
   */
  private checkRateLimit(): boolean {
    if (!this.config.rateLimit) {
      return true;
    }

    const now = Date.now();
    const key = this.config.id;
    const timestamps = this.rateLimitCounters.get(key) || [];

    // Clean old timestamps
    const validTimestamps = timestamps.filter((ts) => {
      const age = now - ts;
      return age < 3600000; // Keep last hour
    });

    // Check per-minute limit
    if (this.config.rateLimit.maxPerMinute) {
      const lastMinute = validTimestamps.filter((ts) => now - ts < 60000);
      if (lastMinute.length >= this.config.rateLimit.maxPerMinute) {
        return false;
      }
    }

    // Check per-hour limit
    if (this.config.rateLimit.maxPerHour) {
      if (validTimestamps.length >= this.config.rateLimit.maxPerHour) {
        return false;
      }
    }

    return true;
  }

  /**
   * Track a sent notification for rate limiting
   */
  private trackRateLimit(): void {
    if (!this.config.rateLimit) {
      return;
    }

    const key = this.config.id;
    const timestamps = this.rateLimitCounters.get(key) || [];
    timestamps.push(Date.now());
    this.rateLimitCounters.set(key, timestamps);
  }

  /**
   * Get metadata for this specific sink from event config
   * Looks in metadata.sink.{sinkId}.{key}
   *
   * @param event - Event configuration
   * @param key - Metadata key within the sink-specific metadata
   * @returns The metadata value or undefined
   */
  protected getSinkMetadata(event: EventConfig, key: string): any {
    if (!event.metadata?.sink) {
      return undefined;
    }

    const sinkMetadata = event.metadata.sink[this.config.id];
    if (!sinkMetadata || typeof sinkMetadata !== "object") {
      return undefined;
    }

    // Support dot notation for nested access
    const keys = key.split(".");
    let value: any = sinkMetadata;

    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Get metadata from event config with support for nested keys
   * Supports both dot notation (e.g., 'ntfy.priority') and direct keys
   *
   * @param event - Event configuration
   * @param key - Metadata key, supports dot notation for nested access
   * @returns The metadata value or undefined
   * @deprecated Use getSinkMetadata instead for sink-specific metadata
   */
  protected getEventMetadata(event: EventConfig, key: string): any {
    if (!event.metadata) {
      return undefined;
    }

    // Support dot notation for nested access
    const keys = key.split(".");
    let value: any = event.metadata;

    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }

    return value;
  }

  protected log(...args: any[]): void {
    if (this.debug) {
      console.log(`[${this.config.type}:${this.config.id}]`, ...args);
    }
  }
}

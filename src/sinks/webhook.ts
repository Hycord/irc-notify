import { EventConfig, MessageContext, PayloadTransform } from "../types";
import { FilterEngine } from "../utils/filters";
import { TemplateEngine } from "../utils/template";
import { BaseSink } from "./base";

/**
 * Webhook sink - sends HTTP requests with config-driven payload transformations
 * All platform-specific logic is now defined in config files via payloadTransforms
 */
export class WebhookSink extends BaseSink {
  private url!: string;
  private method!: string;
  private headers!: Record<string, string>;
  private payloadTransforms!: PayloadTransform[];

  async initialize(): Promise<void> {
    this.url = this.config.config.url;
    this.method = this.config.config.method || "POST";
    this.headers = this.config.config.headers || {};
    this.payloadTransforms = this.config.payloadTransforms || [];

    if (!this.url) {
      throw new Error(`Webhook sink ${this.config.id} requires a URL`);
    }

    // Sort transforms by priority (higher = checked first)
    this.payloadTransforms.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    this.log(
      `Webhook sink initialized: ${this.method} ${this.url} (${this.payloadTransforms.length} transforms)`,
    );
  }

  async sendNotification(
    title: string,
    body: string,
    context: MessageContext,
    event: EventConfig,
  ): Promise<void> {
    // Get sink-specific metadata from event
    const metadata = this.getSinkMetadata(event) || {};

    // Process template section: start with config template defaults, override with metadata
    const processedTemplate: Record<string, any> = {};
    if (this.config.template) {
      for (const [key, value] of Object.entries(this.config.template)) {
        // Check if metadata has override for this key
        const overrideValue = metadata[key];
        if (overrideValue !== undefined) {
          processedTemplate[key] = overrideValue;
        } else if (typeof value === "string") {
          // Process template string with context
          processedTemplate[key] = TemplateEngine.process(value, { context, event, metadata });
        } else {
          processedTemplate[key] = value;
        }
      }
    }

    // Also include title and body for backward compatibility
    processedTemplate.title = metadata.title || title;
    processedTemplate.body = metadata.body || body;

    // Create template context with all available data
    // Important: processedTemplate values should not override context/event/metadata
    const templateContext = {
      event,
      context,
      metadata,
      config: this.config.config,
      ...processedTemplate, // Spread template values last so they don't override system values
    };

    // Find matching transform based on conditions
    const transform = this.findMatchingTransform(context, event, metadata);

    if (!transform) {
      throw new Error(`No matching payload transform found for webhook ${this.config.id}`);
    }

    // Build request headers
    const headers = { ...this.headers };

    // Apply transform headers
    if (transform.headers) {
      for (const [key, value] of Object.entries(transform.headers)) {
        if (typeof value === "string") {
          headers[key] = value;
        } else if (value && typeof value === "object" && "template" in value) {
          headers[key] = TemplateEngine.process(value.template, templateContext);
        }
      }
    }

    // Set Content-Type if specified
    if (transform.contentType) {
      headers["Content-Type"] = transform.contentType;
    }

    // Allow event metadata to explicitly override headers
    if (metadata.headers && typeof metadata.headers === "object") {
      Object.assign(headers, metadata.headers);
    }

    // Handle authorization token if configured
    if (this.config.config.token && !headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${this.config.config.token}`;
    }

    // Build request body based on format
    const requestBody = this.buildPayload(transform, templateContext);

    // Use transform method or fall back to config method
    const method = transform.method || this.method;

    // Sanitize header values (strip non-ASCII to avoid runtime header errors with emojis)
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === "string") {
        headers[key] = this.sanitizeHeaderValue(value);
      }
    }

    try {
      const response = await fetch(this.url, {
        method,
        headers,
        body: requestBody,
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        throw new Error(
          `Webhook request failed: ${response.status} ${response.statusText}${responseText ? ` - ${responseText}` : ""}`,
        );
      }

      this.log(`Webhook notification sent successfully using transform: ${transform.name}`);
    } catch (error) {
      console.error(`Failed to send webhook notification:`, error);
      throw error;
    }
  }

  /**
   * Find the first matching transform based on priority and conditions
   */
  private findMatchingTransform(
    context: MessageContext,
    event: EventConfig,
    metadata: Record<string, any>,
  ): PayloadTransform | undefined {
    // Check for transform override in event metadata
    if (metadata.transform && typeof metadata.transform === "string") {
      const transform = this.payloadTransforms.find((t) => t.name === metadata.transform);
      if (transform) {
        return transform;
      }
      this.log(
        `Transform '${metadata.transform}' specified in metadata but not found, falling back to priority matching`,
      );
    }

    // Find first transform whose condition matches (already sorted by priority)
    for (const transform of this.payloadTransforms) {
      if (!transform.condition) {
        // No condition means always matches
        return transform;
      }

      // Evaluate condition filter
      const condition =
        "filters" in transform.condition
          ? (transform.condition as any)
          : { operator: "AND", filters: [transform.condition] };
      if (FilterEngine.evaluate(condition, context)) {
        return transform;
      }
    }

    // No matching transform found
    return undefined;
  }

  /**
   * Build the request payload based on the transform configuration
   */
  private buildPayload(transform: PayloadTransform, templateContext: any): string {
    switch (transform.bodyFormat) {
      case "json":
        return this.buildJsonPayload(transform, templateContext);
      case "text":
        return this.buildTextPayload(transform, templateContext);
      case "form":
        return this.buildFormPayload(transform, templateContext);
      case "custom":
        // Custom format allows metadata to override the entire payload
        if (templateContext.metadata.payload) {
          return typeof templateContext.metadata.payload === "string"
            ? templateContext.metadata.payload
            : JSON.stringify(templateContext.metadata.payload);
        }
        throw new Error(`Custom body format requires 'payload' in event metadata`);
      default:
        throw new Error(`Unknown body format: ${transform.bodyFormat}`);
    }
  }

  /**
   * Build JSON payload by processing the template recursively
   */
  private buildJsonPayload(transform: PayloadTransform, templateContext: any): string {
    if (!transform.jsonTemplate) {
      throw new Error(`JSON body format requires 'jsonTemplate' in transform`);
    }

    const payload = this.processTemplateRecursive(transform.jsonTemplate, templateContext);

    if (this.debug) {
      this.log(`Template context keys: ${Object.keys(templateContext).join(", ")}`);
      this.log(`Processed payload: ${JSON.stringify(payload, null, 2)}`);
    }

    return JSON.stringify(payload);
  }

  /**
   * Build text payload from template string
   */
  private buildTextPayload(transform: PayloadTransform, templateContext: any): string {
    if (!transform.textTemplate) {
      // Default to body if no template specified
      return templateContext.body;
    }

    return TemplateEngine.process(transform.textTemplate, templateContext);
  }

  /**
   * Build form-encoded payload from template
   */
  private buildFormPayload(transform: PayloadTransform, templateContext: any): string {
    if (!transform.formTemplate) {
      throw new Error(`Form body format requires 'formTemplate' in transform`);
    }

    const params = new URLSearchParams();
    for (const [key, valueTemplate] of Object.entries(transform.formTemplate)) {
      const value = TemplateEngine.process(valueTemplate, templateContext);
      params.append(key, value);
    }

    return params.toString();
  }

  /**
   * Recursively process template variables in nested objects/arrays
   */
  private processTemplateRecursive(obj: any, templateContext: any): any {
    if (typeof obj === "string") {
      const processed = TemplateEngine.process(obj, templateContext);
      // Try to parse as number if it looks like one
      if (/^\d+$/.test(processed)) {
        return parseInt(processed, 10);
      }
      // Try to parse as float if it looks like one
      if (/^\d+\.\d+$/.test(processed)) {
        return parseFloat(processed);
      }
      // Try to parse as boolean
      if (processed === "true") return true;
      if (processed === "false") return false;
      // Return empty string as undefined to avoid sending empty fields
      if (processed === "") return undefined;
      return processed;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.processTemplateRecursive(item, templateContext));
    }
    if (obj !== null && typeof obj === "object") {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        const processed = this.processTemplateRecursive(value, templateContext);
        // Only include non-undefined values
        if (processed !== undefined) {
          result[key] = processed;
        }
      }
      return result;
    }
    return obj;
  }

  /**
   * Remove characters outside visible ASCII range to satisfy HTTP header requirements.
   * Prevents runtime errors when event metadata contains emojis or Unicode symbols.
   */
  private sanitizeHeaderValue(value: string): string {
    return value.replace(/[^\x20-\x7E]/g, "");
  }
}

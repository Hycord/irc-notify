import { EventConfig, MessageContext } from "../types";
import { BaseSink } from "./base";

/**
 * Console sink - outputs to stdout
 */
export class ConsoleSink extends BaseSink {
  async initialize(): Promise<void> {
    this.log("Console sink initialized");
  }

  async sendNotification(
    title: string,
    body: string,
    context: MessageContext,
    event: EventConfig,
  ): Promise<void> {
    const format = this.config.template?.format || "text";

    if (format === "json") {
      console.log(
        JSON.stringify(
          {
            sink: this.config.id,
            event: event.name,
            title,
            body,
            context,
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
    } else {
      console.log("═══════════════════════════════════════");
      console.log(`[${this.config.name}] ${event.name}`);
      console.log("───────────────────────────────────────");
      console.log(`Title: ${title}`);
      console.log(`Body: ${body}`);
      console.log(`Time: ${context.timestamp.toISOString()}`);
      if (context.sender) {
        console.log(`From: ${context.sender.nickname}`);
      }
      if (context.target) {
        console.log(`Target: ${context.target.name}`);
      }
      if (context.server.displayName) {
        console.log(`Server: ${context.server.displayName}`);
      }
      console.log("═══════════════════════════════════════");
    }
  }
}

import * as fs from "fs";
import * as path from "path";
import { EventConfig, MessageContext } from "../types";
import { BaseSink } from "./base";

/**
 * File sink - writes notifications to a file
 */
export class FileSink extends BaseSink {
  private filePath!: string;
  private append!: boolean;

  async initialize(): Promise<void> {
    this.filePath = this.config.config.filePath;
    this.append = this.config.config.append !== false;

    if (!this.filePath) {
      throw new Error(`File sink ${this.config.id} requires a filePath`);
    }

    // Create directory if it doesn't exist
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.log(`File sink initialized: ${this.filePath} (append: ${this.append})`);
  }

  async sendNotification(
    title: string,
    body: string,
    context: MessageContext,
    event: EventConfig,
  ): Promise<void> {
    const format = this.config.template?.format || "text";

    let content: string;

    if (format === "json") {
      content =
        JSON.stringify({
          title,
          body,
          event: event.name,
          timestamp: new Date().toISOString(),
          context,
        }) + "\n";
    } else {
      content = `[${new Date().toISOString()}] ${event.name}: ${title}\n${body}\n\n`;
    }

    try {
      if (this.append) {
        fs.appendFileSync(this.filePath, content, "utf-8");
      } else {
        fs.writeFileSync(this.filePath, content, "utf-8");
      }

      this.log(`Notification written to file`);
    } catch (error) {
      console.error(`Failed to write notification to file:`, error);
      throw error;
    }
  }
}

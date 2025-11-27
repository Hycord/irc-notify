import { Sink, SinkConfig } from "../types";
import { ConsoleSink } from "./console";
import { FileSink } from "./file";
import { NtfySink } from "./ntfy";
import { TestCaptureSink } from "./test-capture";
import { WebhookSink } from "./webhook";

/**
 * Factory for creating sink instances
 */
export class SinkFactory {
  private static sinks: Map<string, any> = new Map([
    ["console", ConsoleSink],
    ["ntfy", NtfySink],
    ["webhook", WebhookSink],
    ["file", FileSink],
    ["custom", TestCaptureSink],
  ]);

  /**
   * Register a custom sink type
   */
  static register(type: string, sinkClass: any): void {
    this.sinks.set(type, sinkClass);
  }

  /**
   * Create a sink instance based on configuration
   */
  static create(config: SinkConfig, debug: boolean = false): Sink {
    const SinkClass = this.sinks.get(config.type);

    if (!SinkClass) {
      throw new Error(`Unknown sink type: ${config.type}`);
    }

    return new SinkClass(config, debug);
  }

  /**
   * Get list of registered sink types
   */
  static getRegisteredTypes(): string[] {
    return Array.from(this.sinks.keys());
  }
}

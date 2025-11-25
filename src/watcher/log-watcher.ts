import * as fs from "fs";
import * as readline from "readline";
import { ClientAdapter, MessageContext } from "../types";

/**
 * Log file watcher that monitors files for new lines
 */
export class LogWatcher {
  private watchers: Map<string, FileWatcher> = new Map();
  private adapter: ClientAdapter;
  private onMessage: (context: MessageContext) => void;
  private debug: boolean;
  private rescanOnStartup: boolean;

  constructor(
    adapter: ClientAdapter,
    onMessage: (context: MessageContext) => void,
    debug: boolean = false,
    rescanOnStartup: boolean = false,
  ) {
    this.adapter = adapter;
    this.onMessage = onMessage;
    this.debug = debug;
    this.rescanOnStartup = rescanOnStartup;
  }

  /**
   * Start watching log files
   */
  async start(): Promise<void> {
    const logPaths = await this.adapter.getLogPaths();

    this.log(`Starting to watch ${logPaths.length} log files`);

    for (const logPath of logPaths) {
      this.watchFile(logPath);
    }

    if (this.rescanOnStartup) {
      this.log("Rescanning all log files from beginning...");
      await this.rescanAllFiles();
    }
  }

  /**
   * Rescan all watched files from the beginning
   */
  private async rescanAllFiles(): Promise<void> {
    for (const [filePath, watcher] of this.watchers) {
      await watcher.rescan();
    }
    this.log("Finished rescanning all log files");
  }

  /**
   * Watch a specific log file
   */
  private watchFile(filePath: string): void {
    if (this.watchers.has(filePath)) {
      return;
    }

    const watcher = new FileWatcher(filePath, this.adapter, this.onMessage, this.debug);

    watcher.start();
    this.watchers.set(filePath, watcher);

    this.log(`Now watching: ${filePath}`);
  }

  /**
   * Stop watching a specific file
   */
  private unwatchFile(filePath: string): void {
    const watcher = this.watchers.get(filePath);
    if (watcher) {
      watcher.stop();
      this.watchers.delete(filePath);
      this.log(`Stopped watching: ${filePath}`);
    }
  }

  /**
   * Refresh the list of watched files
   */
  async refresh(): Promise<void> {
    const currentPaths = new Set(await this.adapter.getLogPaths());
    const watchedPaths = new Set(this.watchers.keys());

    // Stop watching files that no longer exist
    for (const path of watchedPaths) {
      if (!currentPaths.has(path)) {
        this.unwatchFile(path);
      }
    }

    // Start watching new files
    for (const path of currentPaths) {
      if (!watchedPaths.has(path)) {
        this.watchFile(path);
      }
    }
  }

  /**
   * Stop watching all files
   */
  stop(): void {
    for (const [path, watcher] of this.watchers) {
      watcher.stop();
    }
    this.watchers.clear();
    this.log("Stopped watching all files");
  }

  private log(...args: any[]): void {
    if (this.debug) {
      console.log("[LogWatcher]", ...args);
    }
  }
}

/**
 * Watches a single file for changes
 */
class FileWatcher {
  private filePath: string;
  private adapter: ClientAdapter;
  private onMessage: (context: MessageContext) => void;
  private debug: boolean;
  private fsWatcher?: fs.FSWatcher;
  private position: number = 0;
  private reading: boolean = false;

  constructor(
    filePath: string,
    adapter: ClientAdapter,
    onMessage: (context: MessageContext) => void,
    debug: boolean = false,
  ) {
    this.filePath = filePath;
    this.adapter = adapter;
    this.onMessage = onMessage;
    this.debug = debug;
  }

  /**
   * Start watching the file
   */
  start(): void {
    // Read initial content to get to end of file
    this.seekToEnd();

    // Watch for changes
    this.fsWatcher = fs.watch(this.filePath, (eventType) => {
      if (eventType === "change") {
        this.readNewLines();
      }
    });

    // Also poll periodically in case fs.watch misses events
    setInterval(() => {
      this.readNewLines();
    }, 1000);
  }

  /**
   * Stop watching the file
   */
  stop(): void {
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = undefined;
    }
  }

  /**
   * Seek to end of file
   */
  private seekToEnd(): void {
    try {
      const stats = fs.statSync(this.filePath);
      this.position = stats.size;
    } catch (error) {
      this.log(`Error seeking to end of ${this.filePath}:`, error);
    }
  }

  /**
   * Rescan the entire file from the beginning
   */
  async rescan(): Promise<void> {
    this.log(`Rescanning entire file...`);
    const originalPosition = this.position;
    this.position = 0;
    await this.readNewLines();
    this.log(`Rescan complete (processed ${originalPosition} bytes)`);
  }

  /**
   * Read new lines from the file
   */
  private async readNewLines(): Promise<void> {
    if (this.reading) {
      return;
    }

    this.reading = true;

    try {
      const stats = fs.statSync(this.filePath);

      // Check if file was truncated
      if (stats.size < this.position) {
        this.position = 0;
      }

      // Nothing new to read
      if (stats.size === this.position) {
        this.reading = false;
        return;
      }

      // Read new content
      const stream = fs.createReadStream(this.filePath, {
        start: this.position,
        encoding: "utf-8",
      });

      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      const context = this.adapter.extractContextFromPath(this.filePath);

      for await (const line of rl) {
        try {
          const messageContext = this.adapter.parseLine(line, context);
          if (messageContext) {
            this.onMessage(messageContext);
          }
        } catch (error) {
          this.log(`Error parsing line from ${this.filePath}:`, error);
        }
      }

      this.position = stats.size;
    } catch (error) {
      this.log(`Error reading ${this.filePath}:`, error);
    } finally {
      this.reading = false;
    }
  }

  private log(...args: any[]): void {
    if (this.debug) {
      console.log(`[FileWatcher:${this.filePath}]`, ...args);
    }
  }
}

/**
 * Strongly-typed configuration system for irc-notify
 * This file defines the configuration schema with runtime validation
 */

import type {
  ClientConfig,
  EventConfig,
  FileTypeConfig,
  FilterConfig,
  FilterGroup,
  IRCNotifyConfig,
  ParserRule,
  ServerConfig,
  SinkConfig,
} from "../types";

/**
 * Type guard to check if a value is a FilterConfig
 */
export function isFilterConfig(filter: FilterConfig | FilterGroup): filter is FilterConfig {
  return "field" in filter && "operator" in filter;
}

/**
 * Type guard to check if a value is a FilterGroup
 */
export function isFilterGroup(filter: FilterConfig | FilterGroup): filter is FilterGroup {
  return (
    "operator" in filter && "filters" in filter && Array.isArray((filter as FilterGroup).filters)
  );
}

/**
 * Validation error class
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public configType: string,
    public configId?: string,
    public field?: string,
  ) {
    super(`[${configType}${configId ? `:${configId}` : ""}${field ? `.${field}` : ""}] ${message}`);
    this.name = "ConfigValidationError";
  }
}

/**
 * Validator for configuration objects
 */
export class ConfigValidator {
  /**
   * Validate a ClientConfig
   */
  static validateClient(config: ClientConfig): void {
    if (!config.id) {
      throw new ConfigValidationError("Missing required field: id", "ClientConfig");
    }
    if (!config.type) {
      throw new ConfigValidationError("Missing required field: type", "ClientConfig", config.id);
    }
    if (!config.name) {
      throw new ConfigValidationError("Missing required field: name", "ClientConfig", config.id);
    }
    if (typeof config.enabled !== "boolean") {
      throw new ConfigValidationError(
        "Field must be boolean",
        "ClientConfig",
        config.id,
        "enabled",
      );
    }
    if (!config.logDirectory) {
      throw new ConfigValidationError(
        "Missing required field: logDirectory",
        "ClientConfig",
        config.id,
      );
    }

    // Validate discovery patterns
    if (!config.discovery) {
      throw new ConfigValidationError(
        "Missing required field: discovery",
        "ClientConfig",
        config.id,
      );
    }
    if (!config.discovery.patterns) {
      throw new ConfigValidationError(
        "Missing required field: discovery.patterns",
        "ClientConfig",
        config.id,
      );
    }
    if (!config.discovery.pathExtraction) {
      throw new ConfigValidationError(
        "Missing required field: discovery.pathExtraction",
        "ClientConfig",
        config.id,
      );
    }

    // Validate server discovery
    if (!config.serverDiscovery) {
      throw new ConfigValidationError(
        "Missing required field: serverDiscovery",
        "ClientConfig",
        config.id,
      );
    }
    const validServerDiscoveryTypes = ["static", "filesystem", "json", "sqlite"];
    if (!validServerDiscoveryTypes.includes(config.serverDiscovery.type)) {
      throw new ConfigValidationError(
        `Invalid serverDiscovery.type: ${config.serverDiscovery.type}. Must be one of: ${validServerDiscoveryTypes.join(", ")}`,
        "ClientConfig",
        config.id,
      );
    }

    // Validate file type
    if (!config.fileType) {
      throw new ConfigValidationError(
        "Missing required field: fileType",
        "ClientConfig",
        config.id,
      );
    }
    const validFileTypes = ["text", "sqlite", "json"];
    if (!validFileTypes.includes(config.fileType.type)) {
      throw new ConfigValidationError(
        `Invalid fileType.type: ${config.fileType.type}. Must be one of: ${validFileTypes.join(", ")}`,
        "ClientConfig",
        config.id,
      );
    }

    // Validate parser rules
    if (!config.parserRules || !Array.isArray(config.parserRules)) {
      throw new ConfigValidationError("parserRules must be an array", "ClientConfig", config.id);
    }
    config.parserRules.forEach((rule, index) => {
      this.validateParserRule(rule, config.id, index);
    });
  }

  /**
   * Validate a ParserRule
   */
  static validateParserRule(rule: ParserRule, clientId: string, index: number): void {
    if (!rule.name) {
      throw new ConfigValidationError(
        `parserRules[${index}]: Missing required field: name`,
        "ClientConfig",
        clientId,
      );
    }
    if (!rule.pattern) {
      throw new ConfigValidationError(
        `parserRules[${index}]: Missing required field: pattern`,
        "ClientConfig",
        clientId,
      );
    }

    // Test regex pattern
    try {
      new RegExp(rule.pattern, rule.flags);
    } catch (error) {
      throw new ConfigValidationError(
        `parserRules[${index}] (${rule.name}): Invalid regex pattern: ${error}`,
        "ClientConfig",
        clientId,
      );
    }
  }

  /**
   * Validate a ServerConfig
   */
  static validateServer(config: ServerConfig): void {
    if (!config.id) {
      throw new ConfigValidationError("Missing required field: id", "ServerConfig");
    }
    if (!config.hostname) {
      throw new ConfigValidationError(
        "Missing required field: hostname",
        "ServerConfig",
        config.id,
      );
    }
    if (!config.displayName) {
      throw new ConfigValidationError(
        "Missing required field: displayName",
        "ServerConfig",
        config.id,
      );
    }
    if (typeof config.enabled !== "boolean") {
      throw new ConfigValidationError(
        "Field must be boolean",
        "ServerConfig",
        config.id,
        "enabled",
      );
    }

    // Validate port if present
    if (config.port !== undefined) {
      if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
        throw new ConfigValidationError(
          "Port must be an integer between 1 and 65535",
          "ServerConfig",
          config.id,
          "port",
        );
      }
    }

    // Validate users if present
    if (config.users) {
      if (typeof config.users !== "object" || Array.isArray(config.users)) {
        throw new ConfigValidationError("users must be an object", "ServerConfig", config.id);
      }
    }
  }

  /**
   * Validate an EventConfig
   */
  static validateEvent(config: EventConfig): void {
    if (!config.id) {
      throw new ConfigValidationError("Missing required field: id", "EventConfig");
    }
    if (!config.name) {
      throw new ConfigValidationError("Missing required field: name", "EventConfig", config.id);
    }
    if (typeof config.enabled !== "boolean") {
      throw new ConfigValidationError("Field must be boolean", "EventConfig", config.id, "enabled");
    }

    // Validate baseEvent
    const validBaseEvents = [
      "message",
      "join",
      "part",
      "quit",
      "nick",
      "kick",
      "mode",
      "topic",
      "connect",
      "disconnect",
      "any",
    ];
    if (!validBaseEvents.includes(config.baseEvent)) {
      throw new ConfigValidationError(
        `Invalid baseEvent: ${config.baseEvent}. Must be one of: ${validBaseEvents.join(", ")}`,
        "EventConfig",
        config.id,
      );
    }

    // Validate serverIds
    if (!config.serverIds || !Array.isArray(config.serverIds)) {
      throw new ConfigValidationError("serverIds must be an array", "EventConfig", config.id);
    }
    if (config.serverIds.length === 0) {
      throw new ConfigValidationError(
        "serverIds must contain at least one server ID",
        "EventConfig",
        config.id,
      );
    }

    // Validate sinkIds
    if (!config.sinkIds || !Array.isArray(config.sinkIds)) {
      throw new ConfigValidationError("sinkIds must be an array", "EventConfig", config.id);
    }
    if (config.sinkIds.length === 0) {
      throw new ConfigValidationError(
        "sinkIds must contain at least one sink ID",
        "EventConfig",
        config.id,
      );
    }

    // Validate filters if present
    if (config.filters) {
      this.validateFilterGroup(config.filters, config.id);
    }
  }

  /**
   * Validate a FilterGroup
   */
  static validateFilterGroup(group: FilterGroup, eventId: string, path: string = "filters"): void {
    if (!group.operator) {
      throw new ConfigValidationError(
        `${path}: Missing required field: operator`,
        "EventConfig",
        eventId,
      );
    }
    if (group.operator !== "AND" && group.operator !== "OR") {
      throw new ConfigValidationError(
        `${path}.operator must be 'AND' or 'OR'`,
        "EventConfig",
        eventId,
      );
    }
    if (!group.filters || !Array.isArray(group.filters)) {
      throw new ConfigValidationError(`${path}.filters must be an array`, "EventConfig", eventId);
    }
    if (group.filters.length === 0) {
      throw new ConfigValidationError(
        `${path}.filters must contain at least one filter`,
        "EventConfig",
        eventId,
      );
    }

    // Validate each filter
    group.filters.forEach((filter, index) => {
      if (isFilterConfig(filter)) {
        this.validateFilterConfig(filter, eventId, `${path}.filters[${index}]`);
      } else if (isFilterGroup(filter)) {
        this.validateFilterGroup(filter, eventId, `${path}.filters[${index}]`);
      } else {
        throw new ConfigValidationError(
          `${path}.filters[${index}]: Invalid filter type`,
          "EventConfig",
          eventId,
        );
      }
    });
  }

  /**
   * Validate a FilterConfig
   */
  static validateFilterConfig(filter: FilterConfig, eventId: string, path: string): void {
    if (!filter.field) {
      throw new ConfigValidationError(
        `${path}: Missing required field: field`,
        "EventConfig",
        eventId,
      );
    }
    if (!filter.operator) {
      throw new ConfigValidationError(
        `${path}: Missing required field: operator`,
        "EventConfig",
        eventId,
      );
    }

    const validOperators = [
      "equals",
      "notEquals",
      "contains",
      "notContains",
      "matches",
      "notMatches",
      "exists",
      "notExists",
      "in",
      "notIn",
    ];
    if (!validOperators.includes(filter.operator)) {
      throw new ConfigValidationError(
        `${path}.operator: Invalid operator: ${filter.operator}. Must be one of: ${validOperators.join(", ")}`,
        "EventConfig",
        eventId,
      );
    }

    // Validate regex patterns
    if (filter.operator === "matches" || filter.operator === "notMatches") {
      if (!filter.pattern) {
        throw new ConfigValidationError(
          `${path}: operator '${filter.operator}' requires a 'pattern' field`,
          "EventConfig",
          eventId,
        );
      }
      try {
        new RegExp(filter.pattern, filter.flags);
      } catch (error) {
        throw new ConfigValidationError(
          `${path}: Invalid regex pattern: ${error}`,
          "EventConfig",
          eventId,
        );
      }
    }

    // Validate that value exists for operators that need it
    const operatorsNeedingValue = ["equals", "notEquals", "contains", "notContains", "in", "notIn"];
    if (operatorsNeedingValue.includes(filter.operator) && filter.value === undefined) {
      throw new ConfigValidationError(
        `${path}: operator '${filter.operator}' requires a 'value' field`,
        "EventConfig",
        eventId,
      );
    }
  }

  /**
   * Validate a SinkConfig
   */
  static validateSink(config: SinkConfig): void {
    if (!config.id) {
      throw new ConfigValidationError("Missing required field: id", "SinkConfig");
    }
    if (!config.type) {
      throw new ConfigValidationError("Missing required field: type", "SinkConfig", config.id);
    }
    if (!config.name) {
      throw new ConfigValidationError("Missing required field: name", "SinkConfig", config.id);
    }
    if (typeof config.enabled !== "boolean") {
      throw new ConfigValidationError("Field must be boolean", "SinkConfig", config.id, "enabled");
    }

    // Validate type
    const validTypes = ["ntfy", "webhook", "console", "file", "custom"];
    if (!validTypes.includes(config.type)) {
      throw new ConfigValidationError(
        `Invalid type: ${config.type}. Must be one of: ${validTypes.join(", ")}`,
        "SinkConfig",
        config.id,
      );
    }

    // Validate config object
    if (!config.config || typeof config.config !== "object" || Array.isArray(config.config)) {
      throw new ConfigValidationError("config must be an object", "SinkConfig", config.id);
    }

    // Type-specific validation
    this.validateSinkTypeSpecific(config);

    // Validate template if present
    if (config.template) {
      if (config.template.format) {
        const validFormats = ["text", "markdown", "json"];
        if (!validFormats.includes(config.template.format)) {
          throw new ConfigValidationError(
            `Invalid template.format: ${config.template.format}. Must be one of: ${validFormats.join(", ")}`,
            "SinkConfig",
            config.id,
          );
        }
      }
    }

    // Validate rate limit if present
    if (config.rateLimit) {
      if (config.rateLimit.maxPerMinute !== undefined) {
        if (!Number.isInteger(config.rateLimit.maxPerMinute) || config.rateLimit.maxPerMinute < 1) {
          throw new ConfigValidationError(
            "rateLimit.maxPerMinute must be a positive integer",
            "SinkConfig",
            config.id,
          );
        }
      }
      if (config.rateLimit.maxPerHour !== undefined) {
        if (!Number.isInteger(config.rateLimit.maxPerHour) || config.rateLimit.maxPerHour < 1) {
          throw new ConfigValidationError(
            "rateLimit.maxPerHour must be a positive integer",
            "SinkConfig",
            config.id,
          );
        }
      }
    }
  }

  /**
   * Type-specific validation for sinks
   */
  static validateSinkTypeSpecific(config: SinkConfig): void {
    // Skip validation for disabled sinks (allows placeholder configs)
    if (!config.enabled) {
      return;
    }

    switch (config.type) {
      case "ntfy":
        if (!config.config.endpoint) {
          throw new ConfigValidationError(
            "ntfy sink requires config.endpoint",
            "SinkConfig",
            config.id,
          );
        }
        if (!config.config.topic) {
          throw new ConfigValidationError(
            "ntfy sink requires config.topic",
            "SinkConfig",
            config.id,
          );
        }
        break;

      case "webhook":
        if (!config.config.url) {
          throw new ConfigValidationError(
            "webhook sink requires config.url",
            "SinkConfig",
            config.id,
          );
        }
        // Validate URL format
        try {
          new URL(config.config.url);
        } catch {
          throw new ConfigValidationError(
            "config.url must be a valid URL",
            "SinkConfig",
            config.id,
          );
        }
        break;

      case "file":
        if (!config.config.path && !config.config.filePath) {
          throw new ConfigValidationError(
            "file sink requires config.path or config.filePath",
            "SinkConfig",
            config.id,
          );
        }
        break;

      case "console":
        // No specific requirements
        break;

      case "custom":
        // Custom sinks are flexible
        break;
    }
  }

  /**
   * Validate main IRCNotifyConfig
   */
  static validateMain(config: IRCNotifyConfig): void {
    if (!config.global) {
      throw new ConfigValidationError("Missing required field: global", "IRCNotifyConfig");
    }

    // Validate poll interval
    if (config.global.pollInterval !== undefined) {
      if (!Number.isInteger(config.global.pollInterval) || config.global.pollInterval < 100) {
        throw new ConfigValidationError(
          "global.pollInterval must be an integer >= 100ms",
          "IRCNotifyConfig",
          undefined,
          "global.pollInterval",
        );
      }
    }

    // Validate API config if present
    if (config.api !== undefined) {
      if (config.api.port !== undefined) {
        if (!Number.isInteger(config.api.port) || config.api.port < 1 || config.api.port > 65535) {
          throw new ConfigValidationError(
            "api.port must be an integer between 1 and 65535",
            "IRCNotifyConfig",
            undefined,
            "api.port",
          );
        }
      }
      if (config.api.host !== undefined && typeof config.api.host !== "string") {
        throw new ConfigValidationError(
          "api.host must be a string",
          "IRCNotifyConfig",
          undefined,
          "api.host",
        );
      }
      if (config.api.authToken !== undefined && typeof config.api.authToken !== "string") {
        throw new ConfigValidationError(
          "api.authToken must be a string",
          "IRCNotifyConfig",
          undefined,
          "api.authToken",
        );
      }
      if (config.api.enabled !== undefined && typeof config.api.enabled !== "boolean") {
        throw new ConfigValidationError(
          "api.enabled must be a boolean",
          "IRCNotifyConfig",
          undefined,
          "api.enabled",
        );
      }
      if (config.api.enableFileOps !== undefined && typeof config.api.enableFileOps !== "boolean") {
        throw new ConfigValidationError(
          "api.enableFileOps must be a boolean",
          "IRCNotifyConfig",
          undefined,
          "api.enableFileOps",
        );
      }
    }

    // Validate arrays
    if (!config.clients || !Array.isArray(config.clients)) {
      throw new ConfigValidationError("clients must be an array", "IRCNotifyConfig");
    }
    if (!config.servers || !Array.isArray(config.servers)) {
      throw new ConfigValidationError("servers must be an array", "IRCNotifyConfig");
    }
    if (!config.events || !Array.isArray(config.events)) {
      throw new ConfigValidationError("events must be an array", "IRCNotifyConfig");
    }
    if (!config.sinks || !Array.isArray(config.sinks)) {
      throw new ConfigValidationError("sinks must be an array", "IRCNotifyConfig");
    }
  }

  /**
   * Validate references between configs
   */
  static validateReferences(
    config: IRCNotifyConfig,
    clients: ClientConfig[],
    servers: ServerConfig[],
    events: EventConfig[],
    sinks: SinkConfig[],
  ): void {
    const clientIds = new Set(clients.map((c) => c.id));
    const serverIds = new Set(servers.map((s) => s.id));
    const sinkIds = new Set(sinks.map((s) => s.id));

    // Validate event references
    for (const event of events) {
      // Check server references (allow wildcard)
      for (const serverId of event.serverIds) {
        if (serverId !== "*" && !serverIds.has(serverId)) {
          throw new ConfigValidationError(
            `references non-existent server: ${serverId}`,
            "EventConfig",
            event.id,
            "serverIds",
          );
        }
      }

      // Check sink references
      for (const sinkId of event.sinkIds) {
        if (!sinkIds.has(sinkId)) {
          throw new ConfigValidationError(
            `references non-existent sink: ${sinkId}`,
            "EventConfig",
            event.id,
            "sinkIds",
          );
        }
      }
    }
  }
}

/**
 * Helper to create a typed client config
 */
export function defineClient(config: ClientConfig): ClientConfig {
  ConfigValidator.validateClient(config);
  return config;
}

/**
 * Helper to create a typed server config
 */
export function defineServer(config: ServerConfig): ServerConfig {
  ConfigValidator.validateServer(config);
  return config;
}

/**
 * Helper to create a typed event config
 */
export function defineEvent(config: EventConfig): EventConfig {
  ConfigValidator.validateEvent(config);
  return config;
}

/**
 * Helper to create a typed sink config
 */
export function defineSink(config: SinkConfig): SinkConfig {
  ConfigValidator.validateSink(config);
  return config;
}

/**
 * Helper to create typed main config
 */
export function defineConfig(config: IRCNotifyConfig): IRCNotifyConfig {
  ConfigValidator.validateMain(config);
  return config;
}

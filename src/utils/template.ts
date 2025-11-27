import { MessageContext } from "../types";

/**
 * Template engine for processing {{field.path}} syntax
 */
export class TemplateEngine {
  /**
   * Process a template string with context data
   * Supports {{field.path}} syntax for accessing nested properties
   */
  static process(template: string, context: any): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = this.getNestedValue(context, path.trim());
      return value !== undefined && value !== null ? String(value) : match;
    });
  }

  /**
   * Get a nested value from an object using dot notation
   */
  private static getNestedValue(obj: any, path: string): any {
    const keys = path.split(".");
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * Check if a template string contains any variables
   */
  static hasVariables(template: string): boolean {
    return /\{\{[^}]+\}\}/.test(template);
  }

  /**
   * Extract all variable paths from a template
   */
  static extractVariables(template: string): string[] {
    const matches = template.matchAll(/\{\{([^}]+)\}\}/g);
    return Array.from(matches).map((m) => m[1].trim());
  }

  /**
   * Recursively process all string values in an object/array through the template engine
   * This allows templates to work in deeply nested structures like event metadata
   */
  static processDeep<T>(obj: T, context: any): T {
    if (typeof obj === "string") {
      return (this.hasVariables(obj) ? this.process(obj, context) : obj) as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.processDeep(item, context)) as T;
    }

    if (obj !== null && typeof obj === "object") {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.processDeep(value, context);
      }
      return result as T;
    }

    return obj;
  }
}

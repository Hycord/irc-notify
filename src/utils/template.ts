import { MessageContext } from "../types";

/**
 * Template engine for processing {{field.path}} syntax
 */
export class TemplateEngine {
  /**
   * Process a template string with context data
   * Supports {{field.path}} syntax for accessing nested properties
   */
  static process(template: string, context: MessageContext): string {
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
}

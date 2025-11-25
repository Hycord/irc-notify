import { FilterConfig, FilterGroup, MessageContext } from "../types";
import { TemplateEngine } from "./template";

/**
 * Filter evaluation engine
 */
export class FilterEngine {
  /**
   * Evaluate a filter group against a message context
   */
  static evaluate(filterGroup: FilterGroup, context: MessageContext): boolean {
    const results = filterGroup.filters.map((filter) => {
      if ("operator" in filter && "filters" in filter) {
        // Nested filter group
        return this.evaluate(filter as FilterGroup, context);
      } else {
        // Individual filter
        return this.evaluateFilter(filter as FilterConfig, context);
      }
    });

    if (filterGroup.operator === "AND") {
      return results.every((r) => r);
    } else {
      return results.some((r) => r);
    }
  }

  /**
   * Evaluate a single filter against a message context
   */
  private static evaluateFilter(filter: FilterConfig, context: MessageContext): boolean {
    const fieldValue = this.getNestedValue(context, filter.field);

    // Resolve template variables in filter value if it's a string
    const filterValue =
      typeof filter.value === "string" && TemplateEngine.hasVariables(filter.value)
        ? TemplateEngine.process(filter.value, context)
        : filter.value;

    switch (filter.operator) {
      case "equals":
        return fieldValue === filterValue;

      case "notEquals":
        return fieldValue !== filterValue;

      case "contains":
        if (typeof fieldValue === "string") {
          return fieldValue.includes(String(filterValue));
        }
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(filterValue);
        }
        return false;

      case "notContains":
        if (typeof fieldValue === "string") {
          return !fieldValue.includes(String(filterValue));
        }
        if (Array.isArray(fieldValue)) {
          return !fieldValue.includes(filterValue);
        }
        return true;

      case "matches":
        if (typeof fieldValue === "string" && filter.pattern) {
          const regex = new RegExp(filter.pattern, filter.flags || "");
          return regex.test(fieldValue);
        }
        return false;

      case "notMatches":
        if (typeof fieldValue === "string" && filter.pattern) {
          const regex = new RegExp(filter.pattern, filter.flags || "");
          return !regex.test(fieldValue);
        }
        return true;

      case "exists":
        return fieldValue !== undefined && fieldValue !== null;

      case "notExists":
        return fieldValue === undefined || fieldValue === null;

      case "in":
        if (Array.isArray(filterValue)) {
          return filterValue.includes(fieldValue);
        }
        return false;

      case "notIn":
        if (Array.isArray(filterValue)) {
          return !filterValue.includes(fieldValue);
        }
        return true;

      default:
        console.warn(`Unknown filter operator: ${(filter as any).operator}`);
        return false;
    }
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
}

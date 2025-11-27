import { FilterConfig, FilterGroup, MessageContext } from "../types";
import { TemplateEngine } from "./template";

/**
 * Filter evaluation engine
 */
export class FilterEngine {
  /**
   * Evaluate a filter group against a message context
   */
  static evaluate(
    filterGroup: FilterGroup,
    context: MessageContext,
    debug: boolean = false,
  ): boolean {
    const results = filterGroup.filters.map((filter) => {
      if ("operator" in filter && "filters" in filter) {
        // Nested filter group
        return this.evaluate(filter as FilterGroup, context, debug);
      } else {
        // Individual filter
        return this.evaluateFilter(filter as FilterConfig, context, debug);
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
  private static evaluateFilter(
    filter: FilterConfig,
    context: MessageContext,
    debug: boolean = false,
  ): boolean {
    const fieldValue = this.getNestedValue(context, filter.field);

    // Resolve template variables in filter value
    // Support both strings and arrays with template strings
    let filterValue = filter.value;
    if (typeof filter.value === "string" && TemplateEngine.hasVariables(filter.value)) {
      filterValue = TemplateEngine.process(filter.value, context);
      if (debug) {
        console.log(
          `[FilterEngine] Resolving template in filter value: "${filter.value}" -> "${filterValue}"`,
        );
      }
    } else if (Array.isArray(filter.value)) {
      // Process templates in array elements
      filterValue = filter.value.map((item) =>
        typeof item === "string" && TemplateEngine.hasVariables(item)
          ? TemplateEngine.process(item, context)
          : item,
      );
      if (
        debug &&
        filter.value.some((item) => typeof item === "string" && TemplateEngine.hasVariables(item))
      ) {
        console.log(
          `[FilterEngine] Resolving templates in array: [${filter.value}] -> [${filterValue}]`,
        );
      }
    }

    // Resolve template variables in pattern if present
    let pattern = filter.pattern;
    if (pattern && TemplateEngine.hasVariables(pattern)) {
      pattern = TemplateEngine.process(pattern, context);
      if (debug) {
        console.log(
          `[FilterEngine] Resolving template in pattern: "${filter.pattern}" -> "${pattern}"`,
        );
      }
    }

    if (debug) {
      console.log(`[FilterEngine] Field "${filter.field}" value: "${fieldValue}"`);
    }

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
        if (typeof fieldValue === "string" && pattern) {
          const regex = new RegExp(pattern, filter.flags || "");
          return regex.test(fieldValue);
        }
        return false;

      case "notMatches":
        if (typeof fieldValue === "string" && pattern) {
          const regex = new RegExp(pattern, filter.flags || "");
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

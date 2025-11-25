/**
 * Utility for environment variable substitution
 */
export class EnvSubstitution {
  /**
   * Replace ${ENV_VAR} or ${ENV_VAR:-default} or $ENV_VAR with actual environment variable values
   */
  static substitute(value: string): string {
    // Replace ${VAR:-default} syntax (bash-style default values)
    let result = value.replace(/\$\{([^}:]+)(:-([^}]+))?\}/g, (match, varName, _, defaultValue) => {
      const envValue = process.env[varName];
      if (envValue !== undefined && envValue !== "") {
        return envValue;
      }
      return defaultValue !== undefined ? defaultValue : match;
    });

    // Replace $VAR syntax (word boundary required)
    result = result.replace(/\$(\w+)/g, (match, varName) => {
      return process.env[varName] || match;
    });

    return result;
  }

  /**
   * Recursively substitute environment variables in an object
   */
  static substituteObject<T>(obj: T): T {
    if (typeof obj === "string") {
      return this.substitute(obj) as any;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.substituteObject(item)) as any;
    }

    if (obj !== null && typeof obj === "object") {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.substituteObject(value);
      }
      return result;
    }

    return obj;
  }
}

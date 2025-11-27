import { describe, expect, it } from "bun:test";
import { EnvSubstitution } from "../../src/utils/env";

describe("EnvSubstitution", () => {
  it("substitutes environment variables", () => {
    process.env.TEST_VAR = "test_value";
    const result = EnvSubstitution.substitute("${TEST_VAR}");
    expect(result).toBe("test_value");
    delete process.env.TEST_VAR;
  });

  it("uses default values when variable is not set", () => {
    const result = EnvSubstitution.substitute("${NONEXISTENT_VAR:-default}");
    expect(result).toBe("default");
  });

  it("substitutes multiple variables", () => {
    process.env.VAR1 = "value1";
    process.env.VAR2 = "value2";
    const result = EnvSubstitution.substitute("${VAR1} and ${VAR2}");
    expect(result).toBe("value1 and value2");
    delete process.env.VAR1;
    delete process.env.VAR2;
  });

  it("handles nested defaults", () => {
    const result = EnvSubstitution.substitute("${MISSING:-fallback}");
    expect(result).toBe("fallback");
  });

  it("leaves non-matching patterns unchanged", () => {
    const result = EnvSubstitution.substitute("not a variable");
    expect(result).toBe("not a variable");
  });

  it("processes deep objects", () => {
    process.env.TEST_URL = "http://example.com";
    const obj = {
      config: {
        url: "${TEST_URL}",
        port: "${PORT:-3000}",
      },
    };
    const result = EnvSubstitution.substituteObject(obj);
    expect(result.config.url).toBe("http://example.com");
    expect(result.config.port).toBe("3000");
    delete process.env.TEST_URL;
  });

  it("handles arrays", () => {
    process.env.ITEM1 = "first";
    const arr = ["${ITEM1}", "${ITEM2:-second}"];
    const result = EnvSubstitution.substituteObject(arr);
    expect(result[0]).toBe("first");
    expect(result[1]).toBe("second");
    delete process.env.ITEM1;
  });
});

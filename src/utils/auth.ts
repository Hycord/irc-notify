import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

/**
 * Get or create a secure auth token for the API server.
 * The token is stored in config/auth_token.txt and generated once per machine.
 *
 * @param configDir - The configuration directory path
 * @returns The auth token string
 */
export function getOrCreateAuthToken(configDir: string): string {
  const tokenPath = path.join(configDir, "auth_token.txt");

  // Try to read existing token
  if (fs.existsSync(tokenPath)) {
    try {
      const token = fs.readFileSync(tokenPath, "utf-8").trim();
      if (token.length > 0) {
        return token;
      }
    } catch (err) {
      console.warn(`[auth] Failed to read existing token: ${err}`);
    }
  }

  // Generate a new secure token (32 bytes = 64 hex chars)
  const token = crypto.randomBytes(32).toString("hex");

  // Ensure config directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Write token to file with restricted permissions
  try {
    fs.writeFileSync(tokenPath, token, { encoding: "utf-8", mode: 0o600 });
    console.log(`[auth] Generated new auth token at: ${tokenPath}`);
  } catch (err) {
    console.error(`[auth] Failed to write token file: ${err}`);
    // Return the token anyway - it will work for this session
  }

  return token;
}

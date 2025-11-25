#!/usr/bin/env bun
/**
 * Extract release notes for a given version from CHANGELOG.md
 * Usage: bun scripts/extract-changelog.ts <version>
 * Prints the markdown for that version to stdout.
 */

import { readFileSync } from "fs";
import { join } from "path";

const version = process.argv[2];
if (!version) {
  console.error("Version argument required.");
  process.exit(1);
}

const changelogPath = join(process.cwd(), "CHANGELOG.md");
const content = readFileSync(changelogPath, "utf8");

// Regex to capture a version section including heading until next heading or end
const sectionRegex = new RegExp(`## \\[${version}\\][^\n]*\n[\\s\S]*?(?=\n## \\[[^\]]+\\]|$)`, "m");
const match = content.match(sectionRegex);
if (!match) {
  console.error(`Version ${version} not found in CHANGELOG.md`);
  process.exit(1);
}

process.stdout.write(match[0].trim() + "\n");

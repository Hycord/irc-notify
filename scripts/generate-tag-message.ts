#!/usr/bin/env bun
/**
 * Generate and create a git tag from CHANGELOG.md for a specific version
 * 
 * Usage: bun scripts/generate-tag-message.ts <version> [--push]
 * 
 * Options:
 *   --push     Automatically push the tag to origin after creation
 *   --message  Only output the tag message without creating the tag
 * 
 * Examples:
 *   bun scripts/generate-tag-message.ts 1.0.0           # Create tag locally
 *   bun scripts/generate-tag-message.ts 1.0.0 --push    # Create and push tag
 *   bun scripts/generate-tag-message.ts 1.0.0 --message # Just show message
 */

import { readFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const args = process.argv.slice(2);
const version = args[0];
const shouldPush = args.includes("--push");
const messageOnly = args.includes("--message");

if (!version) {
  console.error("Usage: bun scripts/generate-tag-message.ts <version> [--push] [--message]");
  process.exit(1);
}

const changelogPath = join(process.cwd(), "CHANGELOG.md");
const content = readFileSync(changelogPath, "utf8");

// Extract the version section
const sectionRegex = new RegExp(
  `## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\][^\n]*\n([\\s\\S]*?)(?=\n## \\[[^\]]+\\]|$)`,
  "m"
);
const match = content.match(sectionRegex);

if (!match) {
  console.error(`Version ${version} not found in CHANGELOG.md`);
  process.exit(1);
}

// Extract the content, removing the heading
const sectionContent = match[1].trim();

// Parse sections (Added, Changed, Fixed, etc.)
const sections = sectionContent.split(/\n### /).slice(1);
const parsedSections: { [key: string]: string[] } = {};

for (const section of sections) {
  const lines = section.split("\n");
  const sectionName = lines[0].trim();
  const items = lines
    .slice(1)
    .map(line => line.trim())
    .filter(line => line.startsWith("-"))
    .map(line => line.substring(1).trim())
    .filter(line => line && line !== "");
  
  if (items.length > 0) {
    parsedSections[sectionName] = items;
  }
}

// Generate tag message
const tagMessage: string[] = [];
tagMessage.push(`Release v${version}`);
tagMessage.push("");

// Add sections in standard order
const sectionOrder = ["Added", "Changed", "Fixed", "Deprecated", "Removed", "Security"];

for (const sectionName of sectionOrder) {
  if (parsedSections[sectionName]) {
    tagMessage.push(`${sectionName}:`);
    for (const item of parsedSections[sectionName]) {
      tagMessage.push(`- ${item}`);
    }
    tagMessage.push("");
  }
}

// If no sections found, just output a simple message
if (Object.keys(parsedSections).length === 0) {
  tagMessage.push("See CHANGELOG.md for details.");
}

const message = tagMessage.join("\n").trimEnd();

// If --message flag is set, just output the message and exit
if (messageOnly) {
  process.stdout.write(message);
  process.exit(0);
}

// Check if tag already exists
try {
  execSync(`git rev-parse v${version}`, { stdio: "pipe" });
  console.error(`❌ Tag v${version} already exists!`);
  console.error("   Use: git tag -d v${version} to delete it first");
  process.exit(1);
} catch {
  // Tag doesn't exist, continue
}

// Create the tag
try {
  console.log(`📝 Creating tag v${version}...`);
  execSync(`git tag -a v${version} -m "${message.replace(/"/g, '\\"')}"`, { stdio: "inherit" });
  console.log(`✅ Created tag v${version}`);
  
  // Push if requested
  if (shouldPush) {
    console.log(`🚀 Pushing tag to origin...`);
    execSync(`git push origin v${version}`, { stdio: "inherit" });
    console.log(`✅ Pushed tag v${version} to origin`);
  } else {
    console.log(`💡 Push with: git push origin v${version}`);
  }
} catch (error) {
  console.error(`❌ Failed to create/push tag:`, error);
  process.exit(1);
}

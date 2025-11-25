#!/usr/bin/env bun
/**
 * Check that all git tags have corresponding CHANGELOG.md entries
 * and vice versa. Automatically fixes any missing entries.
 * 
 * Usage: bun scripts/check-changelog-sync.ts [--dry-run]
 * 
 * Options:
 *   --dry-run  Only report issues without fixing them
 */

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

function getGitTags(): string[] {
  try {
    const output = execSync("git tag", { encoding: "utf8" });
    return output
      .split("\n")
      .filter(tag => tag.trim())
      .map(tag => tag.replace(/^v/, "")) // Remove 'v' prefix
      .sort((a, b) => {
        // Sort by semver
        const [aMajor, aMinor, aPatch] = a.split(/[-.]/).map(n => parseInt(n) || 0);
        const [bMajor, bMinor, bPatch] = b.split(/[-.]/).map(n => parseInt(n) || 0);
        if (aMajor !== bMajor) return bMajor - aMajor;
        if (aMinor !== bMinor) return bMinor - aMinor;
        return bPatch - aPatch;
      });
  } catch (error) {
    console.error("Failed to get git tags:", error);
    return [];
  }
}

function getChangelogVersions(): string[] {
  const changelogPath = join(process.cwd(), "CHANGELOG.md");
  const content = readFileSync(changelogPath, "utf8");
  
  // Match all version headers like ## [1.0.0] or ## [1.0.0-rc1]
  const versionRegex = /## \[([^\]]+)\]/g;
  const versions: string[] = [];
  let match;
  
  while ((match = versionRegex.exec(content)) !== null) {
    const version = match[1];
    if (version !== "Unreleased") {
      versions.push(version);
    }
  }
  
  return versions;
}

function addVersionToChangelog(version: string, date: string): void {
  const changelogPath = join(process.cwd(), "CHANGELOG.md");
  let content = readFileSync(changelogPath, "utf8");
  
  // Find the Unreleased section and add the new version after it
  const unreleasedMatch = content.match(/## \[Unreleased\][^\n]*\n/);
  
  if (!unreleasedMatch) {
    console.error("Could not find Unreleased section in CHANGELOG.md");
    return;
  }
  
  // According to Keep a Changelog, only include sections that have content
  const newVersionSection = `
## [${version}] - ${date}
`;
  
  // Insert after the Unreleased section
  const insertPosition = unreleasedMatch.index! + unreleasedMatch[0].length;
  content = content.slice(0, insertPosition) + newVersionSection + content.slice(insertPosition);
  
  // Update the links section at the bottom
  const linksMatch = content.match(/\n\[Unreleased\]:[^\n]+\n/);
  if (linksMatch) {
    const oldUnreleasedLink = linksMatch[0];
    const newUnreleasedLink = `\n[Unreleased]: https://github.com/hycord/irc-notify/compare/v${version}...HEAD\n`;
    const versionLink = `[${version}]: https://github.com/hycord/irc-notify/releases/tag/v${version}\n`;
    
    content = content.replace(oldUnreleasedLink, newUnreleasedLink + versionLink);
  }
  
  writeFileSync(changelogPath, content, "utf8");
  console.log(`   ✅ Added [${version}] to CHANGELOG.md`);
}

function createGitTag(version: string): void {
  try {
    // Generate tag message using the other script
    const message = execSync(`bun scripts/generate-tag-message.ts ${version}`, { encoding: "utf8" });
    
    // Create annotated tag
    execSync(`git tag -a v${version} -m "${message.replace(/"/g, '\\"')}"`, { stdio: "inherit" });
    console.log(`   ✅ Created tag v${version}`);
    
    // Offer to push the tag
    console.log(`   💡 Push with: git push origin v${version}`);
  } catch (error) {
    console.error(`   ❌ Failed to create tag v${version}:`, error);
  }
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  
  console.log("🔍 Checking git tags against CHANGELOG.md...\n");
  
  const gitTags = getGitTags();
  const changelogVersions = getChangelogVersions();
  
  console.log(`Found ${gitTags.length} git tags`);
  console.log(`Found ${changelogVersions.length} CHANGELOG versions\n`);
  
  // Check for tags missing from CHANGELOG
  const missingInChangelog = gitTags.filter(tag => !changelogVersions.includes(tag));
  
  // Check for CHANGELOG versions missing from tags
  const missingInTags = changelogVersions.filter(version => !gitTags.includes(version));
  
  let hasIssues = false;
  
  if (missingInChangelog.length > 0) {
    hasIssues = true;
    console.log("❌ Tags missing from CHANGELOG.md:");
    missingInChangelog.forEach(tag => console.log(`   - ${tag}`));
    console.log();
    
    if (!dryRun) {
      console.log("Fixing missing CHANGELOG entries...");
      const today = new Date().toISOString().split("T")[0];
      missingInChangelog.forEach(tag => addVersionToChangelog(tag, today));
      console.log();
    }
  }
  
  if (missingInTags.length > 0) {
    hasIssues = true;
    console.log("⚠️  CHANGELOG versions without git tags:");
    missingInTags.forEach(version => console.log(`   - ${version}`));
    console.log();
    
    if (!dryRun) {
      console.log("Creating missing git tags...");
      missingInTags.forEach(version => createGitTag(version));
      console.log();
    }
  }
  
  if (!hasIssues) {
    console.log("✅ All git tags and CHANGELOG versions are in sync!");
  } else if (dryRun) {
    console.log("💡 Run without --dry-run to automatically fix these issues");
    process.exit(1);
  } else {
    console.log("✅ Fixed all sync issues!");
    if (missingInChangelog.length > 0) {
      console.log("\n💡 Don't forget to:");
      console.log("   - Fill in the changelog entries for new versions");
      console.log("   - Commit the updated CHANGELOG.md");
    }
  }
}

main();

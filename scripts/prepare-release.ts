#!/usr/bin/env bun
/**
 * Prepare a release:
 *  - Update package.json version
 *  - Move `[Unreleased]` section into a new version block with today's date
 *  - Update comparison links at bottom of CHANGELOG.md
 *  - Reset `[Unreleased]` section skeleton
 *
 * Usage: bun scripts/prepare-release.ts <version>
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const version = process.argv[2];
if (!version) die("Version argument required. Example: bun scripts/prepare-release.ts 1.2.3");
if (!/^\d+\.\d+\.\d+(?:[-a-zA-Z0-9\.]+)?$/.test(version)) die("Invalid semantic version format: " + version);

// Update package.json version if different
const pkgPath = join(process.cwd(), "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
if (pkg.version !== version) {
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`✓ Updated package.json version to ${version}`);
} else {
  console.log("✓ package.json already at target version");
}

// Update CHANGELOG.md
const changelogPath = join(process.cwd(), "CHANGELOG.md");
let changelog = readFileSync(changelogPath, "utf8");

// Locate Unreleased section boundaries
const unreleasedHeadingRegex = /^## \[Unreleased\]\s*$/m;
if (!unreleasedHeadingRegex.test(changelog)) die("CHANGELOG.md missing [Unreleased] heading");

// Find start of Unreleased content
const unreleasedMatch = changelog.match(unreleasedHeadingRegex);
if (!unreleasedMatch) die("Failed to match Unreleased heading");
const unreleasedIndex = unreleasedMatch.index! + unreleasedMatch[0].length;

// Find next version heading after Unreleased
const afterUnreleased = changelog.slice(unreleasedIndex);
const nextHeadingMatch = afterUnreleased.match(/^## \[[^\]]+\]/m);
const endOfUnreleasedIndex = nextHeadingMatch ? unreleasedIndex + nextHeadingMatch.index! : changelog.length;

const unreleasedContent = changelog.slice(unreleasedIndex, endOfUnreleasedIndex).trim();

// Prepare new version section using today's date
const today = new Date().toISOString().split("T")[0];
const newVersionHeading = `## [${version}] - ${today}`;

// Skeleton for resetting Unreleased section
const unreleasedSkeleton = `## [Unreleased]\n### Added\n- \n### Changed\n- \n### Fixed\n- \n### Deprecated\n- \n### Removed\n- \n### Security\n- \n`;

// Build new changelog content
const beforeUnreleased = changelog.slice(0, unreleasedMatch.index!);
const afterUnreleasedContent = changelog.slice(endOfUnreleasedIndex); // contains previous versions + link refs

// Insert new version section right after skeleton
let newChangelogBody = beforeUnreleased + unreleasedSkeleton + "\n" + newVersionHeading + "\n" + unreleasedContent.replace(/^\n+/, "") + "\n\n" + afterUnreleasedContent;

// Update comparison links at bottom
// Match link reference block (assuming at end of file)
const linkRefRegex = /(\[Unreleased\]: .*?)(\n[\s\S]*)$/;
const linkRefMatch = newChangelogBody.match(linkRefRegex);
if (linkRefMatch) {
  // Update Unreleased link
  const updatedUnreleased = `[Unreleased]: https://github.com/hycord/irc-notify/compare/v${version}...HEAD`;
  // Append new version link if missing
  const versionLink = `[${version}]: https://github.com/hycord/irc-notify/releases/tag/v${version}`;
  const rest = linkRefMatch[2];
  if (!rest.includes(versionLink)) {
    newChangelogBody = newChangelogBody.replace(linkRefRegex, `${updatedUnreleased}\n${versionLink}${rest}`);
  } else {
    newChangelogBody = newChangelogBody.replace(linkRefRegex, `${updatedUnreleased}${rest}`);
  }
} else {
  // Append links if not found
  newChangelogBody += `\n[Unreleased]: https://github.com/hycord/irc-notify/compare/v${version}...HEAD\n[${version}]: https://github.com/hycord/irc-notify/releases/tag/v${version}\n`;
}

writeFileSync(changelogPath, newChangelogBody);
console.log(`✓ Updated CHANGELOG.md with version ${version}`);

console.log("\nPreparation complete. Commit and tag next.");

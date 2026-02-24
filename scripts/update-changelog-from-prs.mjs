#!/usr/bin/env node

import fs from "node:fs";

const changelogFile = process.env.CHANGELOG_FILE ?? "docs/changelog.mdx";
const entriesJson = process.env.CHANGELOG_ENTRIES_JSON;

if (!entriesJson) {
  console.log("No CHANGELOG_ENTRIES_JSON provided. Skipping.");
  process.exit(0);
}

let entries;

try {
  const parsed = JSON.parse(entriesJson);
  entries = Array.isArray(parsed) ? parsed : [];
} catch (error) {
  console.error("Failed to parse CHANGELOG_ENTRIES_JSON:", error);
  process.exit(1);
}

if (entries.length === 0) {
  console.log("No changelog entries to apply.");
  process.exit(0);
}

const content = fs.readFileSync(changelogFile, "utf8");
const lines = content.split(/\r?\n/);

function sanitize(text) {
  return String(text ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMonthHeading(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatDateTime(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute} UTC`;
}

function findMonthHeadingIndex(monthHeading) {
  return lines.findIndex((line) => line.trim() === `## ${monthHeading}`);
}

function findFirstMonthHeadingIndex() {
  return lines.findIndex((line) => /^##\s+/.test(line.trim()));
}

function sectionLinesForEntry(entry) {
  const mergedDate = new Date(entry.mergedAt);
  const title = sanitize(entry.title);
  const heading = `### ${formatDateTime(mergedDate)} - PR #${entry.number}${title ? `: ${title}` : ""}`;

  const bullets =
    Array.isArray(entry.bullets) && entry.bullets.length > 0
      ? entry.bullets.map((bullet) => `- ${sanitize(bullet)}`)
      : [`- Merged PR #${entry.number}.`];

  return [
    heading,
    "",
    ...bullets,
    "",
    `[View PR](${sanitize(entry.url)})`,
    `<!-- changelog-pr:${entry.number} -->`,
  ];
}

const existingPrNumbers = new Set(
  [...content.matchAll(/<!--\s*changelog-pr:(\d+)\s*-->/g)].map((match) =>
    Number.parseInt(match[1], 10),
  ),
);

const uniqueNewEntries = entries
  .filter((entry) => !existingPrNumbers.has(Number(entry.number)))
  .filter(
    (entry) =>
      Number.isFinite(Number(entry.number)) &&
      typeof entry.mergedAt === "string" &&
      !Number.isNaN(new Date(entry.mergedAt).getTime()),
  )
  .sort(
    (a, b) =>
      new Date(a.mergedAt).getTime() - new Date(b.mergedAt).getTime(),
  );

if (uniqueNewEntries.length === 0) {
  console.log("No new changelog entries after dedupe.");
  process.exit(0);
}

for (const entry of uniqueNewEntries) {
  const mergedDate = new Date(entry.mergedAt);
  const monthHeading = formatMonthHeading(mergedDate);
  const newSection = [...sectionLinesForEntry(entry), ""];

  const monthIndex = findMonthHeadingIndex(monthHeading);

  if (monthIndex === -1) {
    const firstMonthIndex = findFirstMonthHeadingIndex();
    const monthBlock = [`## ${monthHeading}`, "", ...newSection];

    if (firstMonthIndex === -1) {
      if (lines[lines.length - 1] !== "") {
        lines.push("");
      }
      lines.push(...monthBlock);
    } else {
      lines.splice(firstMonthIndex, 0, ...monthBlock);
    }

    continue;
  }

  if (lines[monthIndex + 1] !== "") {
    lines.splice(monthIndex + 1, 0, "");
  }

  const insertionIndex = monthIndex + 2;
  lines.splice(insertionIndex, 0, ...newSection);
}

const updated = lines.join("\n");
fs.writeFileSync(
  changelogFile,
  updated.endsWith("\n") ? updated : `${updated}\n`,
  "utf8",
);

console.log(
  `Updated ${changelogFile} with ${uniqueNewEntries.length} changelog entr${uniqueNewEntries.length === 1 ? "y" : "ies"}.`,
);

export interface RawTextBlock {
  blockId: string;
  sourceName: string;
  rawText: string;
  titleHint?: string;
}

const COMPACT_PIN_LINE_RE =
  /\b(?:pin|mpin|atm|passcode|lock|puk|sim|gcash|maya|bdo|bpi|unionbank|metrobank|code|alarm)\b.*\b\d{4,12}\b/i;

const COMPACT_LOGIN_LINE_RE =
  /^(?:[^:\n]{1,40}:\s*)?[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\s*(?:[:|/\-]|\s+-\s+)\s*\S+/i;

const HEADER_LINE_RE = /^(?:#{1,3}\s+(.+)|\[([^\]]+)\])\s*$/;

function isCompactSingleLineList(lines: string[]): boolean {
  if (lines.length < 2) return false;
  return lines.every(
    (line) => COMPACT_PIN_LINE_RE.test(line) || COMPACT_LOGIN_LINE_RE.test(line)
  );
}

function cleanTitleHint(line: string): string | undefined {
  const match = HEADER_LINE_RE.exec(line.trim());
  if (!match) return undefined;
  return (match[1] ?? match[2] ?? '').trim() || undefined;
}

/**
 * Split unstructured .txt / .md note contents into candidate credential blocks
 * while preserving every character of the original text.
 */
export function splitRawTextIntoBlocks(
  rawText: string,
  sourceName: string = 'pasted-notes.txt'
): RawTextBlock[] {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  // Split first by horizontal dividers and blank-line paragraphs
  const coarseChunks = normalized
    .split(/(?:^\s*(?:-{3,}|={3,}|\*{3,})\s*$|\n\s*\n+)/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  // Further split chunks whenever a markdown/bracket header starts a new section inline
  const sectionedChunks: string[] = [];
  for (const chunk of coarseChunks) {
    const lines = chunk.split('\n');
    let buffer: string[] = [];

    for (const line of lines) {
      if (HEADER_LINE_RE.test(line.trim()) && buffer.length > 0) {
        sectionedChunks.push(buffer.join('\n').trim());
        buffer = [line];
      } else {
        buffer.push(line);
      }
    }

    if (buffer.length > 0) {
      sectionedChunks.push(buffer.join('\n').trim());
    }
  }

  const blocks: RawTextBlock[] = [];

  for (const chunk of sectionedChunks) {
    const nonEmptyLines = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    if (isCompactSingleLineList(nonEmptyLines)) {
      for (const line of nonEmptyLines) {
        blocks.push({
          blockId: globalThis.crypto.randomUUID(),
          sourceName,
          rawText: line,
        });
      }
      continue;
    }

    const firstLineHint = nonEmptyLines[0] ? cleanTitleHint(nonEmptyLines[0]) : undefined;
    blocks.push({
      blockId: globalThis.crypto.randomUUID(),
      sourceName,
      rawText: chunk,
      ...(firstLineHint ? { titleHint: firstLineHint } : {}),
    });
  }

  return blocks;
}

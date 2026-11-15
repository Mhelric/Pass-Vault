import { splitRawTextIntoBlocks } from './blockSplitter.js';
import { classifyBlock, type ParsedImportCandidate } from './classifiers.js';

interface GoogleKeepChecklistItem {
  text?: string;
  isChecked?: boolean;
}

interface GoogleKeepLabel {
  name?: string;
}

interface GoogleKeepJsonNote {
  title?: string;
  textContent?: string;
  listContent?: GoogleKeepChecklistItem[];
  labels?: GoogleKeepLabel[];
  isTrashed?: boolean;
  isArchived?: boolean;
}

function normalizeSingleKeepNote(
  note: GoogleKeepJsonNote,
  sourceName: string
): ParsedImportCandidate[] {
  if (note.isTrashed) {
    return [];
  }

  const bodyLines: string[] = [];
  if (note.textContent?.trim()) {
    bodyLines.push(note.textContent.trim());
  }
  if (Array.isArray(note.listContent)) {
    for (const entry of note.listContent) {
      if (entry.text?.trim()) {
        bodyLines.push(`${entry.isChecked ? '[x]' : '[ ]'} ${entry.text.trim()}`);
      }
    }
  }

  const combinedText = bodyLines.join('\n').trim();
  if (!combinedText) {
    return [];
  }

  const noteTitle = note.title?.trim();
  const labels = (note.labels ?? [])
    .map((l) => l.name?.trim())
    .filter((name): name is string => Boolean(name));

  const blocks = splitRawTextIntoBlocks(combinedText, sourceName);

  return blocks.map((block) => {
    const enrichedBlock =
      noteTitle && blocks.length === 1 && !block.titleHint
        ? { ...block, titleHint: noteTitle }
        : block;
    const candidate = classifyBlock(enrichedBlock);
    if (labels.length > 0) {
      candidate.item = {
        ...candidate.item,
        tags: Array.from(new Set([...candidate.item.tags, ...labels])),
      };
    }
    return candidate;
  });
}

/**
 * Parse a Google Takeout Keep `.json` note (or array of notes) into
 * structured Staging Inbox candidates without any network calls.
 */
export function parseGoogleKeepJson(
  jsonString: string,
  sourceName: string = 'keep-export.json'
): ParsedImportCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (error) {
    throw new Error(
      `Invalid Google Keep JSON in "${sourceName}": ${error instanceof Error ? error.message : 'parse error'}`
    );
  }

  if (Array.isArray(parsed)) {
    return parsed.flatMap((entry, idx) =>
      normalizeSingleKeepNote(entry as GoogleKeepJsonNote, `${sourceName}#${idx + 1}`)
    );
  }

  if (parsed && typeof parsed === 'object') {
    return normalizeSingleKeepNote(parsed as GoogleKeepJsonNote, sourceName);
  }

  return [];
}

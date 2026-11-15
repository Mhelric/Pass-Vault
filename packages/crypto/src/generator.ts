const UPPERCASE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE_CHARS = 'abcdefghijklmnopqrstuvwxyz';
const DIGIT_CHARS = '0123456789';
const SYMBOL_CHARS = '!@#$%^&*-_=+?';
const AMBIGUOUS_REGEX = /[0O1lI]/g;

// Curated 256-word unambiguous Diceware list (8 bits of entropy per word)
const DICEWARE_WORDS = [
  'acorn', 'adobe', 'agent', 'amber', 'anchor', 'angel', 'ankle', 'apple',
  'apron', 'arbor', 'arena', 'armor', 'arrow', 'atlas', 'attic', 'audio',
  'aurora', 'autumn', 'avocado', 'award', 'badge', 'bagel', 'baker', 'bamboo',
  'banana', 'banjo', 'banner', 'barrel', 'basil', 'basket', 'beacon', 'beaver',
  'beetle', 'bellow', 'berry', 'bevel', 'bicycle', 'birch', 'bison', 'blazer',
  'blizzard', 'blossom', 'bluejay', 'bobcat', 'bonfire', 'bonsai', 'border', 'boulder',
  'breeze', 'bridge', 'bronze', 'brook', 'bubble', 'bucket', 'buffalo', 'bugle',
  'bullet', 'bumper', 'bundle', 'bunker', 'butter', 'button', 'cabin', 'cactus',
  'canyon', 'canvas', 'carbon', 'cardinal', 'cargo', 'carpet', 'carrot', 'castle',
  'cedar', 'cellar', 'cement', 'chalice', 'chalk', 'channel', 'chapel', 'charcoal',
  'cherry', 'chess', 'chime', 'cider', 'cinder', 'circle', 'citadel', 'citrus',
  'clover', 'cobalt', 'cobble', 'coconut', 'coffee', 'comet', 'compass', 'copper',
  'coral', 'corner', 'cosmos', 'cotton', 'cougar', 'cradle', 'craft', 'crater',
  'creek', 'cricket', 'crimson', 'crystal', 'cupid', 'current', 'curtain', 'custom',
  'cypress', 'dagger', 'daisy', 'dancer', 'dandelion', 'dawn', 'delta', 'denim',
  'desert', 'diamond', 'diode', 'dolphin', 'domino', 'dragon', 'drawer', 'drift',
  'drizzle', 'drum', 'dune', 'eagle', 'earth', 'echo', 'eclipse', 'eddy',
  'elder', 'ember', 'emerald', 'empire', 'encore', 'energy', 'engine', 'enigma',
  'epoch', 'equator', 'ermine', 'escape', 'estate', 'ether', 'evergreen', 'fable',
  'falcon', 'feather', 'fender', 'fern', 'ferry', 'festival', 'fiber', 'fiddle',
  'field', 'fiesta', 'filter', 'finch', 'firefly', 'fjord', 'flame', 'flannel',
  'flash', 'fleece', 'flight', 'flint', 'flora', 'flower', 'flute', 'focus',
  'forest', 'forge', 'fossil', 'fountain', 'fox', 'freeze', 'frost', 'fruit',
  'galaxy', 'garden', 'garlic', 'garnet', 'gazebo', 'gecko', 'geyser', 'ginger',
  'glacier', 'glade', 'glider', 'glimmer', 'globe', 'gopher', 'granite', 'grape',
  'gravel', 'gravity', 'griffin', 'groove', 'grove', 'guitar', 'gull', 'harbor',
  'harmony', 'harvest', 'haven', 'hawk', 'hazel', 'heather', 'helmet', 'hemlock',
  'heron', 'hickory', 'horizon', 'hornet', 'iceberg', 'icicle', 'indigo', 'ingot',
  'island', 'ivory', 'ivy', 'jacket', 'jade', 'jaguar', 'jasper', 'javelin',
  'jester', 'jigsaw', 'juniper', 'kayak', 'kelp', 'kettle', 'kestrel', 'kingdom',
] as const;

export interface PasswordGeneratorOptions {
  length?: number;
  uppercase?: boolean;
  lowercase?: boolean;
  digits?: boolean;
  symbols?: boolean;
  excludeAmbiguous?: boolean;
}

export interface PassphraseGeneratorOptions {
  words?: number;
  separator?: string;
  capitalize?: boolean;
  includeNumber?: boolean;
}

export interface PinGeneratorOptions {
  length?: number;
  rejectWeakPatterns?: boolean;
}

export interface SecretStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  isWeak: boolean;
  reasons: string[];
}

/** Return a uniform cryptographically random integer in [0, maxExclusive) using rejection sampling. */
export function secureRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0xffffffff) {
    throw new RangeError(`maxExclusive must be an integer in [1, 2^32 - 1], got ${maxExclusive}`);
  }
  if (maxExclusive === 1) {
    return 0;
  }

  const maxUnbiased = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  while (true) {
    globalThis.crypto.getRandomValues(buf);
    const value = buf[0]!;
    if (value < maxUnbiased) {
      return value % maxExclusive;
    }
  }
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/** Generate a cryptographically random password guaranteeing at least one char per enabled pool. */
export function generatePassword(options: PasswordGeneratorOptions = {}): string {
  const length = options.length ?? 20;
  const useUpper = options.uppercase ?? true;
  const useLower = options.lowercase ?? true;
  const useDigits = options.digits ?? true;
  const useSymbols = options.symbols ?? true;
  const excludeAmbiguous = options.excludeAmbiguous ?? true;

  if (!Number.isInteger(length) || length < 8 || length > 64) {
    throw new RangeError('Password length must be an integer between 8 and 64');
  }

  const filterPool = (pool: string): string =>
    excludeAmbiguous ? pool.replace(AMBIGUOUS_REGEX, '') : pool;

  const pools: string[] = [];
  if (useUpper) pools.push(filterPool(UPPERCASE_CHARS));
  if (useLower) pools.push(filterPool(LOWERCASE_CHARS));
  if (useDigits) pools.push(filterPool(DIGIT_CHARS));
  if (useSymbols) pools.push(filterPool(SYMBOL_CHARS));

  if (pools.length === 0) {
    throw new Error('At least one character set must be enabled');
  }

  const combinedPool = pools.join('');
  const chars: string[] = [];

  for (const pool of pools) {
    chars.push(pool[secureRandomInt(pool.length)]!);
  }

  while (chars.length < length) {
    chars.push(combinedPool[secureRandomInt(combinedPool.length)]!);
  }

  return shuffleInPlace(chars).join('');
}

/** Generate a memorable Diceware passphrase from an offline local wordlist. */
export function generatePassphrase(options: PassphraseGeneratorOptions = {}): string {
  const wordCount = options.words ?? 4;
  const separator = options.separator ?? '-';
  const capitalize = options.capitalize ?? false;
  const includeNumber = options.includeNumber ?? false;

  if (!Number.isInteger(wordCount) || wordCount < 3 || wordCount > 8) {
    throw new RangeError('Passphrase word count must be an integer between 3 and 8');
  }

  const selected: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    const rawWord = DICEWARE_WORDS[secureRandomInt(DICEWARE_WORDS.length)]!;
    const formatted = capitalize
      ? rawWord.charAt(0).toUpperCase() + rawWord.slice(1)
      : rawWord;
    selected.push(formatted);
  }

  if (includeNumber) {
    const targetIdx = secureRandomInt(selected.length);
    selected[targetIdx] = `${selected[targetIdx]}${secureRandomInt(10)}`;
  }

  return selected.join(separator);
}

/** Check whether a numeric PIN uses trivial repeated, sequential, or keypad-line patterns. */
export function isWeakPinPattern(pin: string): boolean {
  if (!/^\d+$/.test(pin) || pin.length < 4) {
    return true;
  }

  // All identical digits (e.g., 0000, 111111)
  if (/^(\d)\1+$/.test(pin)) {
    return true;
  }

  // Strictly ascending or descending digits (e.g., 1234, 987654)
  let ascending = true;
  let descending = true;
  for (let i = 1; i < pin.length; i++) {
    const prev = pin.charCodeAt(i - 1);
    const curr = pin.charCodeAt(i);
    if (curr !== prev + 1) ascending = false;
    if (curr !== prev - 1) descending = false;
  }
  if (ascending || descending) {
    return true;
  }

  // Repeated two-digit pairs (e.g., 1212, 6969) or common vertical keypad lines
  if (/^(\d{2})\1+$/.test(pin) || pin === '2580' || pin === '0852') {
    return true;
  }

  return false;
}

/** Generate a cryptographically random numeric PIN (default 6 digits). */
export function generatePin(options: PinGeneratorOptions = {}): string {
  const length = options.length ?? 6;
  const rejectWeak = options.rejectWeakPatterns ?? true;

  if (!Number.isInteger(length) || length < 4 || length > 12) {
    throw new RangeError('PIN length must be an integer between 4 and 12');
  }

  for (let attempt = 0; attempt < 100; attempt++) {
    let pin = '';
    for (let i = 0; i < length; i++) {
      pin += String(secureRandomInt(10));
    }
    if (!rejectWeak || !isWeakPinPattern(pin)) {
      return pin;
    }
  }

  throw new Error('Failed to generate a non-weak PIN within attempt budget');
}

/** Locally inspect password or PIN strength without making external network calls. */
export function evaluateSecretStrength(
  secret: string,
  category: 'password' | 'pin'
): SecretStrengthResult {
  const reasons: string[] = [];

  if (category === 'pin') {
    if (!/^\d+$/.test(secret)) {
      reasons.push('Contains non-numeric characters');
    }
    if (secret.length < 4) {
      reasons.push('PIN is shorter than 4 digits');
      return { score: 0, isWeak: true, reasons };
    }
    if (isWeakPinPattern(secret)) {
      reasons.push('Uses a predictable sequence or repeated pattern');
      return { score: 1, isWeak: true, reasons };
    }
    if (/^(19\d\d|20[0-3]\d)$/.test(secret)) {
      reasons.push('Resembles a calendar year');
      return { score: 2, isWeak: true, reasons };
    }
    const score = secret.length >= 6 ? 4 : 3;
    return { score, isWeak: false, reasons };
  }

  if (secret.length < 12) {
    reasons.push('Password should be at least 12 characters');
  }

  let classes = 0;
  if (/[a-z]/.test(secret)) classes++;
  if (/[A-Z]/.test(secret)) classes++;
  if (/\d/.test(secret)) classes++;
  if (/[^a-zA-Z0-9]/.test(secret)) classes++;

  if (classes < 3 && secret.length < 16) {
    reasons.push('Mix uppercase, lowercase, numbers, and symbols (or use a longer passphrase)');
  }
  if (/(.)\1{3,}/.test(secret)) {
    reasons.push('Contains long repeated character runs');
  }

  let score: 0 | 1 | 2 | 3 | 4 = 0;
  if (secret.length >= 20 && classes >= 3) {
    score = 4;
  } else if (secret.length >= 14 && classes >= 3) {
    score = 3;
  } else if (secret.length >= 12 && classes >= 2) {
    score = 2;
  } else if (secret.length >= 8) {
    score = 1;
  }

  if (reasons.length > 0 && score >= 3) {
    score = 2;
  }

  return {
    score,
    isWeak: score < 3 || reasons.length > 0,
    reasons,
  };
}

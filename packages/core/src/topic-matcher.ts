/**
 * Glob-style topic matching shared across adapters that need it.
 *
 *   `*`  matches any run of characters within a segment (no `.`)
 *   `**` matches any run of characters across segments
 *   `?`  matches a single character within a segment
 *
 * Examples:
 *   matchTopic('users.*', 'users.created')       -> true
 *   matchTopic('users.*', 'users.created.email') -> false
 *   matchTopic('users.**', 'users.created.email') -> true
 */
export function matchTopic(pattern: string, topic: string): boolean {
  if (pattern === topic) return true;
  if (!isPattern(pattern)) return false;
  return patternToRegex(pattern).test(topic);
}

export function isPattern(input: string): boolean {
  return input.includes('*') || input.includes('?');
}

const cache = new Map<string, RegExp>();

function patternToRegex(pattern: string): RegExp {
  const cached = cache.get(pattern);
  if (cached) return cached;

  let regex = '^';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern.charAt(i);
    if (ch === '*') {
      if (pattern.charAt(i + 1) === '*') {
        regex += '.*';
        i += 2;
        continue;
      }
      regex += '[^.]*';
      i += 1;
      continue;
    }
    if (ch === '?') {
      regex += '[^.]';
      i += 1;
      continue;
    }
    if (/[.+^${}()|[\]\\]/.test(ch)) {
      regex += '\\';
    }
    regex += ch;
    i += 1;
  }
  regex += '$';
  const re = new RegExp(regex);
  cache.set(pattern, re);
  return re;
}

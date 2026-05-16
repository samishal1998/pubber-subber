import { describe, expect, it } from 'vitest';
import { isPattern, matchTopic } from '../src/index.js';

describe('matchTopic', () => {
  it('matches exact strings', () => {
    expect(matchTopic('users.created', 'users.created')).toBe(true);
    expect(matchTopic('users.created', 'users.updated')).toBe(false);
  });

  it('treats * as a single-segment wildcard', () => {
    expect(matchTopic('users.*', 'users.created')).toBe(true);
    expect(matchTopic('users.*', 'users.created.email')).toBe(false);
  });

  it('treats ** as a multi-segment wildcard', () => {
    expect(matchTopic('users.**', 'users.created')).toBe(true);
    expect(matchTopic('users.**', 'users.created.email')).toBe(true);
    expect(matchTopic('users.**', 'orders.created')).toBe(false);
  });

  it('treats ? as a single-character wildcard within a segment', () => {
    expect(matchTopic('user?', 'users')).toBe(true);
    expect(matchTopic('user?', 'user')).toBe(false);
    expect(matchTopic('user?', 'user.x')).toBe(false);
  });

  it('escapes regex metacharacters in literal pattern segments', () => {
    expect(matchTopic('a+b.*', 'a+b.x')).toBe(true);
    expect(matchTopic('a+b.*', 'aab.x')).toBe(false);
  });

  it('detects patterns', () => {
    expect(isPattern('users.*')).toBe(true);
    expect(isPattern('user?')).toBe(true);
    expect(isPattern('users.created')).toBe(false);
  });
});

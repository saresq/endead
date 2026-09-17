import { describe, it, expect } from 'vitest';
import { usesTabIdentity } from '../identity';

describe('usesTabIdentity', () => {
  it('leaves an ordinary tab on the stored identity', () => {
    expect(usesTabIdentity('', false)).toBe(false);
  });

  it('claims an identity when the URL carries the flag', () => {
    expect(usesTabIdentity('?tab', false)).toBe(true);
  });

  it('finds the flag anywhere in the query', () => {
    expect(usesTabIdentity('?x=1&tab', false)).toBe(true);
  });

  it('does not match a parameter that merely starts with tab', () => {
    expect(usesTabIdentity('?tabs=2', false)).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(usesTabIdentity('?TAB', false)).toBe(false);
  });

  it('latches once the tab holds its own id, with the query gone', () => {
    expect(usesTabIdentity('', true)).toBe(true);
  });
});

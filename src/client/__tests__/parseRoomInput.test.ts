import { describe, it, expect } from 'vitest';
import { parseRoomInput } from '../ui/MenuUI';

describe('parseRoomInput', () => {
  it('returns a plain code unchanged', () => {
    expect(parseRoomInput('k3j9x2')).toBe('k3j9x2');
  });

  it('trims surrounding whitespace', () => {
    expect(parseRoomInput(' k3j9x2 ')).toBe('k3j9x2');
    expect(parseRoomInput('\tk3j9x2\n')).toBe('k3j9x2');
  });

  it('extracts the code from a pasted invite link', () => {
    expect(parseRoomInput('https://endead.endea.ar/room/k3j9x2')).toBe('k3j9x2');
    expect(parseRoomInput('  http://localhost:5173/room/ab_c-12?x=1 ')).toBe('ab_c-12');
    expect(parseRoomInput('/room/k3j9x2')).toBe('k3j9x2');
  });

  it('returns an empty string for blank input', () => {
    expect(parseRoomInput('')).toBe('');
    expect(parseRoomInput('   ')).toBe('');
  });

  it('passes other text through trimmed', () => {
    expect(parseRoomInput(' not a code ')).toBe('not a code');
  });
});

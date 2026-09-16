import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { requireEditorSecret, EDITOR_SECRET_HEADER } from '../editorAuth';

/** Runs the middleware against a header bag and reports what it did. */
function call(headers: Record<string, string>) {
  const out = { status: 0, nexted: false };
  const res = {
    status(code: number) { out.status = code; return this; },
    json() { return this; },
  };
  requireEditorSecret({ headers } as any, res as any, () => { out.nexted = true; });
  return out;
}

describe('requireEditorSecret', () => {
  const original = process.env.EDITOR_SECRET;
  beforeEach(() => { process.env.EDITOR_SECRET = 's3cret'; });
  afterEach(() => {
    if (original === undefined) delete process.env.EDITOR_SECRET;
    else process.env.EDITOR_SECRET = original;
  });

  it('rejects a request carrying no secret, without reaching the handler', () => {
    const r = call({});
    expect(r.status).toBe(401);
    expect(r.nexted).toBe(false);
  });

  it('rejects a request carrying the wrong secret', () => {
    const r = call({ [EDITOR_SECRET_HEADER]: 'nope' });
    expect(r.status).toBe(401);
    expect(r.nexted).toBe(false);
  });

  it('passes a request carrying the configured secret', () => {
    const r = call({ [EDITOR_SECRET_HEADER]: 's3cret' });
    expect(r.nexted).toBe(true);
    expect(r.status).toBe(0);
  });

  it('rejects every request when no secret is configured', () => {
    delete process.env.EDITOR_SECRET;
    expect(call({}).status).toBe(401);
    expect(call({ [EDITOR_SECRET_HEADER]: 'anything' }).status).toBe(401);
  });
});

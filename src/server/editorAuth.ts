
// src/server/editorAuth.ts
//
// One shared secret gates every endpoint that writes maps or tile definitions.
// There is no user model here and only one map author, so this is the whole
// auth story: a header compared against EDITOR_SECRET. No secret configured
// means no writes, in every environment — a check that silently does nothing
// is the one that reaches production by accident.

import type { Request, Response, NextFunction } from 'express';

export const EDITOR_SECRET_HEADER = 'x-editor-secret';

export function requireEditorSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.EDITOR_SECRET;
  const supplied = req.headers[EDITOR_SECRET_HEADER];
  if (!expected || supplied !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

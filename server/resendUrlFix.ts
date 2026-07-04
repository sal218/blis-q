import type { Request, Response, NextFunction } from "express";

// Resend click-tracking encodes '?' as '%3F' in redirect URLs, which makes
// Express treat the query string as part of the path and breaks route matching
// for links like /reset-password?token=… . Detect the first %3F in the raw URL
// and 302-redirect with a real '?'. See CLAUDE.md "Resend %3F" gotcha.
//
// 🔒 The log line is the PATH ONLY — never the query string. The query can carry
// sensitive values (a reset-password token, or a safe-places `near=lat,lng`), and
// logging them would violate the request-log redaction rule (COMPLIANCE §9).
// Factored out of index.ts so it is unit-testable (index.ts self-bootstraps).
export function resendUrlFix(log: (msg: string) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    const match = req.url.match(/%3[Ff]/);
    if (!match) return next();
    const idx = match.index!;
    const fixed = req.url.substring(0, idx) + "?" + req.url.substring(idx + 3);
    log(
      `[URL-FIX] Resend encoding detected, redirecting path: ${fixed.split("?")[0]}`,
    );
    return res.redirect(302, fixed);
  };
}

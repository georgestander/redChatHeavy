# Security Best Practices Report

## Executive Summary
I found one medium-severity client-side XSS vector in markdown and tool-rendered links. In `main`, untrusted URLs were rendered directly in anchors and markdown without protocol allowlisting, so `javascript:` or other unsafe schemes could be embedded and triggered on user click. I implemented a fix in branch `security/sanitize-markdown-links` that sanitizes markdown links/images and tool-provided URLs with a safe-protocol allowlist.

## Medium Severity

### [MED-001] Untrusted link URLs rendered without protocol allowlisting
- Rule ID: JS-XSS-001 (untrusted input into a navigation/URL sink)
- Severity: Medium
- Location:
  - `components/ai-elements/streamdown-lite.tsx` lines 14-22 (main)
  - `components/part/retrieve-url.tsx` lines 99-131 (main)
- Evidence (main):
  - `components/ai-elements/streamdown-lite.tsx:14-22`
    - `<ReactMarkdown {...props}>{children ?? ""}</ReactMarkdown>`
  - `components/part/retrieve-url.tsx:99-103, 129-131`
    - `href={url || "#"}`
    - `<ReactMarkdown>{content}</ReactMarkdown>`
- Impact: If attacker-controlled content reaches markdown or tool results, a crafted link like `javascript:...` can be rendered. A user click could execute script in the app origin, leading to account compromise or data exposure.
- Fix: Sanitize URLs before rendering anchors/images. Restrict protocols to `http`, `https`, `mailto`, `tel` and drop unsafe schemes; ensure `_blank` links include `noopener` and `noreferrer`.
- Mitigation: Deploy a strict CSP (avoid `unsafe-inline`/`unsafe-eval`) to reduce XSS impact if a URL slips through.
- False positive notes: If you already enforce URL protocol allowlisting upstream or strip unsafe schemes in the markdown pipeline, verify and document it. I did not find evidence of such enforcement in `main`.
- Status: Fixed on branch `security/sanitize-markdown-links` by adding `lib/markdown.ts` sanitizer and using it in `StreamdownLite` and `RetrieveUrl`.


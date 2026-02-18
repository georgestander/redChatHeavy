---
description: Create a vercel/ai GitHub issue via gh CLI (safe body-file workflow)
---

Use this when you need to file an issue in `vercel/ai` and your body contains backticks/code blocks (avoid shell mangling).

```bash
# 0) sanity
gh --version
gh auth status
gh repo view vercel/ai --json nameWithOwner,url,defaultBranchRef

# 1) write body to a file (single-quoted heredoc = no interpolation)
cat <<'EOF' > /tmp/vercel-ai-issue-body.md
### What
<what happened>

### Error
```

<paste exact error>
```

### Versions

- ai: <version>
- <package>: <version>

### Repro

<minimal repro steps/snippet>

### Expected

<expected>

### Actual

<actual>
EOF

# 2) create issue

gh issue create -R vercel/ai \
  --title "<title>" \
  --body-file /tmp/vercel-ai-issue-body.md

# 3) (optional) edit later without fighting escaping

# gh issue edit -R vercel/ai <number> --body-file /tmp/vercel-ai-issue-body.md

```

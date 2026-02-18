# Documentation Review & Fix Skill

Review and **fix** all documentation issues. Only report issues requiring human decisions.

## Action Principle

**FIX immediately (don't report):**
- Typos, grammar, formatting
- Broken internal links (verify path exists, fix it)
- Outdated code with obvious correct version (check src/)
- Missing imports in code examples
- Unclear phrasing with obvious improvement
- Inconsistent terminology
- Dead external links (remove or update)
- Incorrect file paths in examples

**REPORT only (needs human decision):**
- Architectural decisions needed
- Missing sections requiring domain knowledge
- Conflicting info needing clarification from maintainer
- Features that may/may not exist in codebase
- Content that might be intentionally placeholder

## Agent Prompt Template

```
Review and FIX documentation files. You have Edit tool access.

Files: [list]

For each file:
1. Read completely
2. Check code examples against src/ - use Grep/Glob to find actual implementations
3. FIX immediately: typos, broken links, outdated code, formatting, unclear phrasing
4. Use Edit tool to make all fixes
5. Only REPORT issues needing human decision (architectural, ambiguous, domain-specific)

Return format:
FIXED: [list of files edited with 1-line summary each]
NEEDS DECISION: [only issues you couldn't fix, with context]
```

## Final Report Format

Only issues needing human decision:

```markdown
## Documentation Review Complete

### Fixes Applied
- X files edited
- [1-line summary per file]

### Needs Human Decision

#### [filename.mdx]
- **Issue**: [description]
- **Context**: [why you couldn't auto-fix]
- **Options**: [if applicable]
```

## Context Management

- After each phase: discard file contents, keep only fix summary + open issues
- Agents return compressed output only
- No raw content between phases
- Final report is just: what was fixed + what needs decision

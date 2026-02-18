# Mintlify documentation

## Working relationship

- You can push back on ideas-this can lead to better documentation. Cite sources and explain your reasoning when you do so
- ALWAYS ask for clarification rather than making assumptions
- NEVER lie, guess, or make up anything

## Project context

- Format: MDX files with YAML frontmatter
- Config: docs.json for navigation, theme, settings
- Components: Mintlify components

## Content strategy

- Document just enough for user success - not too much, not too little
- Prioritize accuracy and usability
- Make content evergreen when possible
- Search for existing content before adding anything new. Avoid duplication unless it is done for a strategic reason
- Check existing patterns for consistency
- Start by making the smallest reasonable changes

## Docs organization (separation of concerns)

Keep pages single-purpose. If you need both "what/how-to-use" and "how-it's-built", split into a concept page + cookbook recipe and link between them.

### Core Concepts (`docs/core/*`)

- Explain **what** the feature is, **what to expect**, **how to use it**, and **what knobs exist** at a user/operator level.
- Keep implementation details light. Prefer behavior, invariants, and contracts over file-level walkthroughs.
- Include "Manual update / troubleshooting" when it’s part of operating the feature.
- Link to cookbook for the implementation recipe when readers need to change code.

### Cookbook (`docs/cookbook/*`)

- Explain **how it works under the hood** and **how to implement/modify it**.
- Show concrete code paths, file locations, and the sequence of steps to build the pattern.
- Prefer "Problem → Solution → How it works → Flow → Key files" structure.
- It’s fine to be opinionated and repo-specific here.

### Reference (`docs/reference/*`)

- Exhaustive, lookup-style docs: config keys, env vars, schemas, endpoints, DB tables.
- Avoid narrative. Prefer tables, signatures, defaults, constraints, and examples.

### Linking rule

- If you mention a non-trivial implementation detail in a concept page, add a "Related" link to the cookbook recipe.
- If the cookbook relies on a conceptual model, link back to the Core Concepts page first.

## docs.json

- Refer to the [docs.json schema](https://mintlify.com/docs.json) when building the docs.json file and site navigation

## Frontmatter requirements for pages

- title: Clear, descriptive page title
- description: Concise summary for SEO/navigation

## Writing standards

- Second-person voice ("you")
- Prerequisites at start of procedural content
- Test all code examples before publishing
- Match style and formatting of existing pages
- Include both basic and advanced use cases
- Language tags on all code blocks
- Alt text on all images
- Relative paths for internal links
- Never use em dashes (U+2014).
- Avoid semicolons in prose. Prefer two sentences or parentheses.
- Use Mermaid for diagrams instead of ASCII art

## Git workflow

- NEVER use --no-verify when committing
- Ask how to handle uncommitted changes before starting
- Create a new branch when no clear branch exists for changes
- Commit frequently throughout development
- NEVER skip or disable pre-commit hooks

## Navigation updates

- Update docs.json navigation when adding, removing, or renaming pages
- Keep page order logical within each group

## Do not

- Skip frontmatter on any MDX file
- Use absolute URLs for internal links
- Include untested code examples
- Make assumptions - always ask for clarification

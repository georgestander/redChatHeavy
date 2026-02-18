---
description: Generate a shareable code snippet image via code.franciscomoretti.com
---

Create a code snippet for sharing on Twitter/X and generate a https://code.franciscomoretti.com URL.

Requirements:

- **Max 15 lines** of code unless otherwise specified (fits nicely in a tweet image)
- **One clear concept** per snippet
- Start with a `// Comment` explaining the benefit/concept
- Use real imports and realistic code
- Keep it self-contained and easy to understand at a glance
- No types that require context to understand
- Prefer hooks and patterns that show elegance

Output format:

1. Show the code snippet in a code block
2. Base64 encode using this command:
   ```bash
   echo 'YOUR_CODE_HERE' | base64 -w 0 | sed 's/+/-/g; s/\//_/g; s/=//g'
   ```
3. Generate a https://code.franciscomoretti.com URL with these params:
   ```
   https://code.franciscomoretti.com//#code={base64}&theme=sparka&darkMode=true&padding=64&language={language}
   ```
   - `language`: `tsx` (default), `shell`, or `json`
4. Output the full URL (print it in the chat)

**Note**: code.franciscomoretti.com uses localStorage which can override URL params. Open in incognito if the code doesn't load.

The snippet should make developers think "oh that's nice" when they see it.

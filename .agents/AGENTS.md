<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:rant-and-heal-agent-rules -->
# Rant and Heal V2 - Agent Rules

## 1. Always Check Context First
Before making sweeping changes, planning architecture, or doing deep investigations, you MUST review `.codex_context.md`. This file provides a highly compressed overview of the tech stack, directory structure, and current implementation state. Reading this saves tokens and gives you the exact context you need.

## 2. Auto-Documentation Policy
- **Do NOT** update `ARCHITECTURE.md` or `README.md` on every minor code change (like fixing typos, CSS adjustments, or small logic tweaks).
- **DO** update `ARCHITECTURE.md`, `README.md`, and `.codex_context.md` whenever you:
  - Add a new core feature or route.
  - Modify the database schema (Firestore rules, new collections).
  - Change architectural patterns or data flows.
  - Integrate new external services or APIs.

## 3. Architecture & Style Adherence
- **Service-Oriented Architecture**: Privileged Firebase Admin logic belongs in `src/server/` or Next.js Route Handlers (`app/api/`). Client Firebase logic belongs in `src/services/`.
- **UI Components**: Adhere to the "Radiant Brutalism" design system. Use the established atomic structure in `src/components/`. Do not introduce ad-hoc styling that breaks the design system.
<!-- END:rant-and-heal-agent-rules -->

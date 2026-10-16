# flamingbeing/hi: Claude Code

@AGENTS.md

Shared instructions are in `AGENTS.md`; only Claude Code–specific notes belong here.

- The Firebase plugin/MCP and the `firebase` CLI act with the owner's own Google access: never use them against live
  projects (no login, deploy, reads) without the owner's OK in that session. The local emulator with a `demo-*`
  project needs no OK. Live Firebase changes: AGENTS.md, "Live cloud changes".
- The Cloudflare connector may list the Worker and search Cloudflare docs; settings changes follow AGENTS.md,
  "Live cloud changes", or are the owner's clicks.

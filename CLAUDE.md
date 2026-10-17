# flamingbeing/hi: Claude Code

@AGENTS.md

Shared instructions are in `AGENTS.md`; only Claude Code–specific notes belong here.

- Never use the Firebase plugin/MCP or the `firebase` CLI against live projects (no login, deploy or reads) without the
  owner's OK in that session; the local emulator with a `demo-*` project needs none. Cloudflare settings changes are the
  owner's to approve.

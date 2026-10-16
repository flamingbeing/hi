# flamingbeing/hi: Claude Code

@AGENTS.md

Shared instructions are in `AGENTS.md`; only Claude Code–specific notes belong here.

- The Firebase plugin/MCP and the `firebase` CLI act with the owner's own Google access: never use them against live
  projects (no login, deploy, reads) without the owner's OK in that session. The local emulator with a `demo-*`
  project needs no OK. Live Firebase changes go to firetop as a job (AGENTS.md, "Cloud changes go through firetop").
- The Cloudflare connector may list the Worker and search Cloudflare docs; settings changes go to firetop as a job,
  or are the owner's clicks when firetop can't do them.

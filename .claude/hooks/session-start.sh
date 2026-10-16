#!/bin/bash
# Cloud sessions: load the owner's private context (rules, ops, per-repo notes) from flamingbeing/life.
# Read-only use; never copy anything from it into this public repo.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
LIFE_DIR="$(dirname "${CLAUDE_PROJECT_DIR:-$PWD}")/life"
if [ ! -d "$LIFE_DIR/.git" ]; then
  if git clone -q --depth 1 https://github.com/flamingbeing/life "$LIFE_DIR" 2>/dev/null; then
    echo "Private context: cloned flamingbeing/life to $LIFE_DIR. Read its CLAUDE.md, README.md and repos/hi.md before starting; call register_repo_root for it if you have that tool."
  else
    echo "Private context: this session can't reach flamingbeing/life yet. Call add_repo (owner flamingbeing, repo life), clone it to $LIFE_DIR, then read its CLAUDE.md, README.md and repos/hi.md. Never copy anything from it into this public repo."
  fi
fi
exit 0

#!/usr/bin/env bash
# Stop hook: don't let the agent finish while the tests fail (one extra pass per turn).
# The test command is detected automatically. To override it, either
#   - put the command in .claude/test-command (one line), or
#   - set the TEST_CMD environment variable.
# If no tests are found, the hook does nothing.

input=$(cat)
[ "$(jq -r '.stop_hook_active' <<<"$input")" = "true" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-$PWD}" || exit 0

has() { command -v "$1" >/dev/null 2>&1; }

detect() {
  # 1) explicit override
  if [ -n "${TEST_CMD:-}" ]; then echo "$TEST_CMD"; return; fi
  if [ -s .claude/test-command ]; then head -n 1 .claude/test-command | tr -d '\r'; return; fi

  # 2) JavaScript / TypeScript: only if package.json has a real "test" script
  if [ -f package.json ]; then
    t=$(jq -r '.scripts.test // empty' package.json 2>/dev/null)
    if [ -n "$t" ] && ! grep -q 'no test specified' <<<"$t"; then
      if   [ -f pnpm-lock.yaml ] && has pnpm; then echo "pnpm test"
      elif [ -f yarn.lock ] && has yarn;      then echo "yarn test"
      elif [ -f bun.lockb ] && has bun;       then echo "bun test"
      else echo "npm test"; fi
      return
    fi
  fi

  # 3) Python
  if [ -f pytest.ini ] || [ -f conftest.py ] || [ -d tests ] || [ -d test ] \
     || grep -qs '\[tool.pytest' pyproject.toml || grep -qs '\[tool:pytest\]' setup.cfg; then
    for py in python python3 py; do
      if has "$py"; then echo "$py -m pytest -q"; return; fi
    done
  fi

  # 4) Rust, Go, Makefile
  [ -f Cargo.toml ] && has cargo && { echo "cargo test"; return; }
  [ -f go.mod ] && has go && { echo "go test ./..."; return; }
  [ -f Makefile ] && grep -q '^test:' Makefile && has make && { echo "make test"; return; }
}

cmd=$(detect)
[ -z "$cmd" ] && exit 0   # no tests found: don't block

out=$(bash -c "$cmd" 2>&1); code=$?
# pytest exit code 5 = no tests collected: treat as pass
if [ $code -ne 0 ] && ! { [[ "$cmd" == *pytest* ]] && [ $code -eq 5 ]; }; then
  jq -n --arg cmd "$cmd" --arg log "$(tail -n 40 <<<"$out")" \
    '{decision: "block", reason: ("Tests are failing (" + $cmd + "). Fix them before you stop.\n" + $log)}'
fi
exit 0

# Hooks

Two Claude Code hooks that give the diagram a place in the session, since the MCP
alone cannot make an agent read it first or update it last.

| hook | when | does |
|---|---|---|
| `session-start.mjs` | session start, resume, after compaction | prints the outline of every diagram in `./dgv` into context, with the drift summary |
| `stop.mjs` | end of each turn | if a node's path no longer exists, code belongs to no node, or source changed and the diagram did not — says so. Never blocks |

Both are silent in projects without a `./dgv` directory.

## Install

Add to `~/.claude/settings.json` (user scope — every project) or `.claude/settings.json`
in one project. Replace `/ABS/PATH` with where you cloned Dia-GramV.

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node /ABS/PATH/Dia-GramV/hooks/session-start.mjs", "timeout": 10 } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node /ABS/PATH/Dia-GramV/hooks/stop.mjs", "timeout": 10 } ] }
    ]
  }
}
```

`node packages/mcp/bin/dgv.mjs doctor` prints this block with the path filled in.

## Try one by hand

```bash
echo '{"cwd":"/path/to/a/project"}' | node hooks/session-start.mjs
echo '{"cwd":"/path/to/a/project"}' | node hooks/stop.mjs
```

The first prints the context the agent would receive; the second prints a JSON
`systemMessage` or nothing.

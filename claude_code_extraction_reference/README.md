# Claude Code Extraction Reference

This directory is a portable reference bundle for the EACY Claude Code extraction path.
It contains the project skills, MCP tools, runner wiring, and production config snippets
needed to understand how Claude Code is used as a controlled backend extraction agent.

## Directory Layout

```text
claude_code_extraction_reference/
  skills/
    eacy-medical-extraction-core/SKILL.md
    eacy-pancreatic-cancer-extraction/SKILL.md
    eacy-schema-output-contract/SKILL.md
    eacy-evidence-and-validation/SKILL.md
  mcp_tools/
    eacy_extraction_mcp_server.py
  runner/
    claude_code_runner.py
    claude_code_ehr_extractor.py
    agent__init__.py
  config_snippets/
    env_prod_claude_code.env
    docker_compose_worker_claude_code.yml
```

## Original Source Paths

- `backend/app/agent_skills/*/SKILL.md`
- `backend/app/services/agent/eacy_extraction_mcp_server.py`
- `backend/app/services/agent/claude_code_runner.py`
- `backend/app/services/agent/claude_code_ehr_extractor.py`
- `backend/app/services/agent/__init__.py`
- `.env.prod.example`
- `docker-compose.prod.yml`

## MCP Tools Exposed To Claude Code

- `mcp__eacy_extraction__get_field_spec`
- `mcp__eacy_extraction__search_ocr`
- `mcp__eacy_extraction__validate_candidate_fields`
- `mcp__eacy_extraction__save_result_json`

## Runtime Notes

The runner copies `skills/*/SKILL.md` into each task workspace under:

```text
.claude/skills/<skill_name>/SKILL.md
```

When MCP tools are enabled, the runner writes a per-workspace `.mcp.json` and launches
Claude Code with `--mcp-config` and `--strict-mcp-config`.

Default allowed tools are:

```text
Read,LS,Grep,mcp__eacy_extraction__get_field_spec,mcp__eacy_extraction__search_ocr,mcp__eacy_extraction__validate_candidate_fields,mcp__eacy_extraction__save_result_json
```

Default disallowed tools are:

```text
Bash,Edit,Write,WebFetch,WebSearch
```

The service still parses and validates the final JSON itself. Claude Code is used as
the controlled extraction executor, not as an unrestricted shell agent.

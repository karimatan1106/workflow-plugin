# Workflow Plugin for Claude Code

A workflow management plugin for Claude Code. It provides a 19-phase TDD (Test-Driven Development) enhanced workflow and supports Specification-Driven Development (SDD).

## Overview

This plugin systematically manages development tasks and enforces a high-quality development process.

### Features

1. **Phase Management**: Enforces a development flow of up to 19 phases from research to completed
2. **TDD Cycle Enforcement**: test_impl (Red) → implementation (Green) → refactoring (Refactor)
3. **Spec-First Approach**: Enforces specification updates before code editing
4. **Artifact Verification**: Checks state machine diagrams and flowcharts are reflected
5. **Infinite Loop Detection**: Detects and warns about repetitive edits to the same file
6. **Task Size Support**: Adjusts the number of phases with 3 levels: Small/Medium/Large

## Requirements

- **Node.js**: 18.0.0 or higher
- **Package Manager**: npm or pnpm
- **Claude Code**: MCP support enabled

## Installation

### Method 1: Automatic Installation (Recommended)

```bash
# 1. Copy/clone the plugin to your project
git clone https://github.com/yourname/workflow-plugin.git
# or
cp -r workflow-plugin /path/to/your/project/

# 2. Run the installation script
node workflow-plugin/install.js
```

The installation script automatically performs the following:

- Creates symlink to `.claude/commands/workflow.md`
- Creates symlink to `.claude/workflow-phases/`
- Merges hooks into `.claude/settings.json`
- Adds MCP server configuration to `.mcp.json`
- Builds the MCP server (if necessary)

### Method 2: Manual Installation

#### 2-1. Copy the Plugin to Your Project

```bash
cp -r workflow-plugin /path/to/your/project/
```

#### 2-2. Merge Claude Code Settings

Merge the contents of `workflow-plugin/settings.json` into `.claude/settings.json`.

#### 2-3. Build the MCP Server

```bash
cd workflow-plugin/mcp-server
npm install  # or pnpm install
npm run build
```

#### 2-4. Configure the MCP Server

Add the following to `.mcp.json`:

```json
{
  "mcpServers": {
    "workflow": {
      "command": "node",
      "args": ["workflow-plugin/mcp-server/dist/index.js"],
      "cwd": "workflow-plugin/mcp-server"
    }
  }
}
```

#### 2-5. Link Commands

```bash
# Unix/macOS
ln -s ../workflow-plugin/commands/workflow.md .claude/commands/workflow.md
ln -s ../workflow-plugin/workflow-phases .claude/workflow-phases

# Windows (requires admin privileges or use junctions)
mklink /H .claude\commands\workflow.md workflow-plugin\commands\workflow.md
mklink /J .claude\workflow-phases workflow-plugin\workflow-phases
```

## Update

After updating the plugin, run the installation script again:

```bash
node workflow-plugin/install.js
```

## Usage

### Basic Commands

| Command | Description |
|---------|-------------|
| `/workflow start <task-name> [-s small\|medium\|large]` | Start a task |
| `/workflow next` | Proceed to the next phase |
| `/workflow status` | Check current status |
| `/workflow approve design` | Approve design review |
| `/workflow reset [reason]` | Reset to research phase |
| `/workflow list` | List active tasks |
| `/workflow switch <task-id>` | Switch to another task |
| `/workflow complete-sub <subphase>` | Complete a subphase in parallel phases |

### Examples

#### Adding a New Feature (Medium Size)

```
/workflow start Add user authentication -s medium
# research: Investigate existing authentication code
/workflow next
# requirements: Define requirements
/workflow next
# planning: Create implementation plan
/workflow next
# design_review: Review design (requires approval)
/workflow approve design
# Continue with TDD-style implementation...
```

#### Bug Fix (Small Size)

```
/workflow start Fix login bug -s small
/workflow next  # research → requirements
/workflow next  # requirements → implementation
/workflow next  # implementation → testing
/workflow next  # testing → commit
```

## Phase Configuration by Task Size

### Small (5 Phases) - Simple Bug Fixes, Small Changes

```
research → requirements → implementation → testing → commit
```

### Medium (13 Phases) - Feature Additions, Medium-Scale Changes

```
research → requirements → parallel_design → design_review [Approval Required]
→ test_design → test_impl → implementation → refactoring
→ parallel_quality → testing → docs_update → commit → completed
```

### Large (18 Phases) - Architecture Changes, Large-Scale Features

```
research → requirements → parallel_analysis (threat_modeling + planning)
→ parallel_design (state_machine + flowchart + ui_design)
→ design_review [AI Review + User Approval]
→ test_design → test_impl → implementation → refactoring
→ parallel_quality (build_check + code_review) → testing
→ parallel_verification (manual_test + security_scan + performance_test + e2e_test)
→ docs_update → commit → push → ci_verification → deploy → completed
```

## Hooks

### PreToolUse Hooks

| Hook | Target Tools | Description |
|------|--------------|-------------|
| `enforce-workflow.js` | Edit, Write, NotebookEdit | Blocks file editing when task is not started |
| `phase-edit-guard.js` | Edit, Write, NotebookEdit | Restricts file type editing based on phase |
| `spec-first-guard.js` | Edit, Write, NotebookEdit | Blocks code editing before spec update |
| `loop-detector.js` | Edit, Write, NotebookEdit | Detects repetitive edits to the same file |
| `check-spec.js` | Write | Checks spec existence when creating new files |
| `check-test-first.js` | Write | Enforces test-first during TDD phases |

### PostToolUse Hooks

| Hook | Target Tools | Description |
|------|--------------|-------------|
| `check-workflow-artifact.js` | workflow_next | Checks artifact reflection on phase transitions |
| `spec-guard-reset.js` | Bash | Resets spec guard state |
| `check-spec-sync.js` | Write, Edit | Checks sync between code and specs |

## Phase Edit Rules

| Phase | Editable | Prohibited |
|-------|----------|------------|
| research | None (read-only) | All files |
| requirements | .md | Code |
| parallel_analysis | .md | Code |
| parallel_design | .md, .mmd | Code |
| design_review | .md | Code |
| test_design | .md, test files | Source code |
| test_impl | Test files | Source code |
| implementation | Source code | Test files |
| refactoring | All code | - |
| parallel_quality | All code | - |
| testing | None (read-only) | All |
| parallel_verification | .md | Code |
| docs_update | .md, .mdx | Code |
| commit | None | All |
| push | None | All |
| ci_verification | .md | Code |
| deploy | .md | Code |

### Subphase Editable Files

| Subphase | Editable |
|----------|----------|
| threat_modeling | .md |
| planning | .md |
| state_machine | .md, .mmd |
| flowchart | .md, .mmd |
| ui_design | .md, .mmd |
| build_check | All (for build fixes) |
| code_review | .md |
| manual_test | .md |
| security_scan | .md |
| performance_test | .md |
| e2e_test | .md, test files |

## Environment Variables

| Variable | Default Value | Description |
|----------|---------------|-------------|
| `WORKFLOW_STATE_FILE` | `.claude-workflow-state.json` | Path to global state file |
| `WORKFLOW_DIR` | `docs/workflows` | Workflow directory |
| `SPEC_DIR` | `docs/specs` | Specifications directory |
| `CODE_DIRS` | `src` | Code directories (comma-separated) |
| `SKIP_PHASE_GUARD` | - | Set to `true` to disable phase edit restrictions |
| `SKIP_SPEC_GUARD` | - | Set to `true` to disable spec-first check |
| `SKIP_LOOP_DETECTION` | - | Set to `true` to disable infinite loop detection |
| `SKIP_ARTIFACT_CHECK` | - | Set to `true` to disable artifact reflection check |
| `DEBUG_PHASE_GUARD` | - | Set to `true` to output debug logs |

## Directory Structure

```
workflow-plugin/
├── hooks/                          # Hook scripts
│   ├── enforce-workflow.js         # Workflow enforcement
│   ├── phase-edit-guard.js         # Phase-based edit restrictions
│   ├── spec-first-guard.js         # Spec-first enforcement
│   ├── spec-guard-reset.js         # Spec guard reset
│   ├── loop-detector.js            # Infinite loop detection
│   ├── check-spec.js               # Spec existence check
│   ├── check-spec-sync.js          # Code/spec sync check
│   ├── check-test-first.js         # Test-first check
│   └── check-workflow-artifact.js  # Artifact reflection check
├── mcp-server/                     # MCP Server
│   ├── src/
│   │   ├── index.ts                # Entry point
│   │   ├── server.ts               # Server implementation
│   │   ├── tools/                  # Tool implementations
│   │   │   ├── start.ts            # Start task
│   │   │   ├── next.ts             # Next phase transition
│   │   │   ├── status.ts           # Get status
│   │   │   ├── approve.ts          # Approval
│   │   │   ├── reset.ts            # Reset
│   │   │   ├── list.ts             # Task list
│   │   │   ├── switch.ts           # Switch task
│   │   │   └── complete-sub.ts     # Complete subphase
│   │   ├── phases/
│   │   │   └── definitions.ts      # Phase definitions
│   │   ├── state/
│   │   │   ├── types.ts            # Type definitions
│   │   │   └── manager.ts          # State management
│   │   └── utils/
│   │       ├── errors.ts           # Error handling
│   │       └── retry.ts            # Retry mechanism
│   ├── package.json
│   └── tsconfig.json
├── skills/                         # Skill definitions
│   └── workflow/
│       └── SKILL.md                # Workflow skill
├── workflow-phases/                # Phase-specific prompts
│   ├── README.md                   # Phase overview
│   ├── research.md
│   ├── requirements.md
│   ├── threat_modeling.md
│   ├── planning.md
│   ├── state_machine.md
│   ├── flowchart.md
│   ├── ui_design.md
│   ├── design_review.md
│   ├── test_design.md
│   ├── test_impl.md
│   ├── implementation.md
│   ├── refactoring.md
│   ├── build_check.md
│   ├── code_review.md
│   ├── testing.md
│   ├── manual_test.md
│   ├── security_scan.md
│   ├── performance_test.md
│   ├── e2e_test.md
│   ├── docs_update.md
│   ├── commit.md
│   ├── push.md
│   ├── ci_verification.md
│   └── deploy.md
├── commands/                       # Command definitions
│   └── workflow.md
├── .claude-plugin/
│   └── manifest.json               # Plugin manifest
├── settings.json                   # Hook settings (for merging)
└── README.md                       # Japanese documentation
```

## Artifact Placement

| Phase | Artifact | Location |
|-------|----------|----------|
| research | Research results | `{workflowDir}/research.md` |
| requirements | Requirements definition | `{workflowDir}/requirements.md` |
| planning | Implementation plan/Spec | `docs/specs/domains/{domain}/{name}.md` |
| threat_modeling | Threat model | `{workflowDir}/threat-model.md` |
| state_machine | State machine diagram | `docs/specs/{domain}/{name}.state-machine.mmd` |
| flowchart | Flowchart | `docs/specs/{domain}/{name}.flowchart.mmd` |
| ui_design | UI design | `{workflowDir}/ui-design.md` |
| test_design | Test cases | `{workflowDir}/test-cases.md` |
| code_review | Review results | `{workflowDir}/code-review.md` |
| performance_test | Performance test results | `{workflowDir}/performance-test.md` |
| e2e_test | E2E test results | `{workflowDir}/e2e-test.md` |
| docs_update | Documentation updates | `docs/specs/`, `README.md` |
| ci_verification | CI result record | `{workflowDir}/ci-result.md` |

## TDD Cycle

```
┌─────────────────────────────────────────────────────────────┐
│                        TDD Cycle                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   test_impl (Red)  →  implementation (Green)  →  refactoring│
│        ↓                      ↓                      ↓      │
│   Write tests           Make tests pass       Improve code  │
│    (Failing)               (Passing)          quality       │
│                                              (Keep tests    │
│                                               passing)      │
└─────────────────────────────────────────────────────────────┘
```

## Parallel Phases

For Large tasks, there are phases that can be executed in parallel.

| Group | Subphases |
|-------|-----------|
| `parallel_analysis` | threat_modeling, planning |
| `parallel_design` | state_machine, flowchart, ui_design |
| `parallel_quality` | build_check, code_review |
| `parallel_verification` | manual_test, security_scan, performance_test, e2e_test |

Complete subphases:

```
/workflow complete-sub threat_modeling
/workflow complete-sub planning
```

After all subphases are completed, use `/workflow next` to proceed to the next phase.

## Prohibited Actions

The following actions are automatically blocked by hooks:

| Action | Enforcement |
|--------|-------------|
| Code editing before task start | `enforce-workflow.js` |
| File editing during research phase | `phase-edit-guard.js` |
| Code editing before spec update | `spec-first-guard.js` |
| Implementation code editing before test creation (TDD violation) | `check-test-first.js` |
| Passing design_review without approval | MCP Server |
| Commit without artifact reflection | `check-workflow-artifact.js` |
| Repetitive edits to the same file (5+ times/5 minutes) | `loop-detector.js` |

## New Phase Descriptions

### docs_update (Documentation Update Phase)

A phase to update documentation after implementation and testing are complete.

**Purpose:**
- Reflect implementation details in specifications
- Update README and changelog
- Update API documentation

**Artifacts:**
- Updated specifications (`docs/specs/`)
- Updated README (if necessary)
- Changelog (CHANGELOG.md, etc.)

**Editable files:** `.md`, `.mdx`

### ci_verification (CI Verification Phase)

A phase to verify CI/CD pipeline success after push.

**Purpose:**
- Verify CI/CD pipeline execution results
- Check build, test, lint, and other automated check results
- Identify and fix issues if failed

**Checklist:**
- [ ] Build succeeded
- [ ] All tests passed
- [ ] Lint/static analysis passed
- [ ] No security scan issues

**Editable files:** `.md` (CI result recording only)

### performance_test (Performance Test)

A subphase of parallel_verification. Verifies performance requirements.

**Purpose:**
- Measure response time
- Check memory usage
- Conduct load testing (if necessary)

**Artifacts:**
- Performance test results (`{workflowDir}/performance-test.md`)

**Editable files:** `.md`

### e2e_test (E2E Test)

A subphase of parallel_verification. Executes end-to-end tests.

**Purpose:**
- Verify user scenarios
- Confirm frontend-backend integration
- Cross-browser testing (if applicable)

**Artifacts:**
- E2E test results (`{workflowDir}/e2e-test.md`)

**Editable files:** `.md`, test files (`.test.ts`, `.spec.ts`, etc.)

## Troubleshooting

### Cannot Transition Phases

1. Check if artifacts for the current phase are created
2. Check status with `/workflow status`
3. `/workflow approve design` is required for design review phase

### Infinite Loop Detection Triggered

1. Stop and analyze the root cause of the error
2. Check sync between tests and implementation
3. Check for discrepancies between spec and implementation
4. Skip with `SKIP_LOOP_DETECTION=true` if necessary (not recommended)

### Spec-First Violation Occurred

1. First update the relevant spec in `docs/specs/`
2. Then edit the code
3. Skip with `SKIP_SPEC_GUARD=true` for emergencies

## License

MIT

## References

- [TDD (Test-Driven Development)](https://en.wikipedia.org/wiki/Test-driven_development)
- [STRIDE Threat Modeling](https://docs.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats)
- [Mermaid Syntax](https://mermaid.js.org/)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)

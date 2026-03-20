# Coding Agent Bakeoff Tasks

This repository contains the comparison tasks and the minimal codebase used in
the accompanying articles.

- `task-a.md`: existing bug fix
- `task-b.md`: small feature addition plus test updates
- `task-c.md`: harder ledger replay task with retroactive correction,
  reversal, snapshot invalidation, and incremental replay
- `task-c-prime.md`: a focused variant of Task C that removes snapshot
  invalidation and tests rebuild vs incremental consistency
- `task-d.md`: retroactive transfer rebinding and redirect with exact replay
- `task-e.md`: JSON-safe compact streaming replay

This repository includes:

- public task prompts such as `task-a.md`
- benchmark JavaScript code under `src/`
- visible tests under `test/`
- hidden-checker-style scripts under `eval/`

The public task names match the names used in the articles, so readers can
reproduce the experiments directly from this repository.

## File Mapping

The public task names map to the actual implementation files as follows.

| Public task | Main code | Visible tests | Hidden checker |
| --- | --- | --- | --- |
| `Task A` | `src/checkout.js` | `test/checkout.test.js` | additional regression tests |
| `Task B` | `src/reporting.js` | `test/reporting.test.js` | `eval/task-b-check.js` |
| `Task C` | `src/account-state.js` | `test/account-state.test.js` | `eval/task-e-check.js` |
| `Task C'` | `src/account-state-f.js` | `test/account-state-f.test.js` | `eval/task-f-check.js` |
| `Task D` | `src/settlement-state.js` | `test/settlement-state.test.js` | `eval/task-g-check.js` |
| `Task E` | `src/streaming-state.js` | `test/streaming-state.test.js` | `eval/task-h-check.js` |

The task prompts are written so they can be pasted directly into each CLI.

## Quick Start

Clone the repository and confirm that the visible test suite passes.

```bash
git clone https://github.com/ms-Ys/coding-agent-bakeoff.git
cd coding-agent-bakeoff
npm test
```

The checked-in baseline is intended as a benchmark starting point. The visible
tests pass, but some hidden checkers are expected to fail until the task is
actually solved.

## Reproduction Example

The safest way to compare multiple agents is to give each one its own fresh
working copy.

### 1. Create an isolated working directory

```bash
cp -a coding-agent-bakeoff /tmp/task-d-codex
cd /tmp/task-d-codex
```

### 2. Give the agent the task prompt

You can paste the task prompt directly, or use a short instruction like this:

```text
Complete the task in task-d.md in this repository.
You may read and modify files and run tests.
Keep changes minimal.
Do not commit.
When done, print a short summary and the final test command and result.
```

### 3. Example CLI invocations

Codex:

```bash
codex exec -m gpt-5.4 "Complete the task in task-d.md in this repository. You may read and modify files and run tests. Keep changes minimal. Do not commit. When done, print a short summary and the final test command and result."
```

Claude Code:

```bash
claude -p --model claude-opus-4-6 --dangerously-skip-permissions "Complete the task in task-d.md in this repository. You may read and modify files and run tests. Keep changes minimal. Do not commit. When done, print a short summary and the final test command and result."
```

Gemini CLI:

```bash
gemini -m gemini-3.1-pro-preview -p "Complete the task in task-d.md in this repository. You may read and modify files and run tests. Keep changes minimal. Do not commit. When done, print a short summary and the final test command and result." --yolo -o text
```

### 4. Validate the result

Run the visible tests first:

```bash
npm test
```

Then run the task-specific hidden checker against the modified working copy:

```bash
node eval/task-g-check.js .
```

For other tasks, swap in the matching checker from the table above, for example:

```bash
node eval/task-b-check.js .
node eval/task-e-check.js .
node eval/task-f-check.js .
node eval/task-h-check.js .
```

### 5. Compare multiple agents fairly

Use a fresh copy for each agent and task combination:

```bash
cp -a coding-agent-bakeoff /tmp/task-d-codex
cp -a coding-agent-bakeoff /tmp/task-d-claude
cp -a coding-agent-bakeoff /tmp/task-d-gemini
```

That avoids cross-contamination from previous edits and makes hidden-checker
results easier to compare.

## License

This repository is released under the MIT License. See [`LICENSE`](./LICENSE).

## Notes

- These tasks are intended for reproducible local benchmarking, but identical
  results are not guaranteed across dates, model versions, rate limits, or tool
  updates.
- Hidden checker scripts are included for local verification, but benchmark
  outcomes can still vary depending on execution environment and provider-side
  behavior.

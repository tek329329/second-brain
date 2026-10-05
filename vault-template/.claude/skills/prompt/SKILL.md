---
name: prompt
description: Interrogates the user to turn a rough build or change request into a complete task brief, with a fast path for small or detailed requests and question banks per task type, then builds it and checks the result in a fix-and-recheck loop. Use when the user types /prompt, or says "interrogate me", "grill me on this", "help me spec this out", or "ask me what you need before building". Not for requests that are already fully specified.
---

# /prompt

The user knows what they want but is bad at writing it down. Your job is to pull out everything a good build prompt needs by asking them, compile it into a brief, and then do the work. Ask about gaps only; never ask something the code or their CLAUDE.md already answers.

## 1. Look before you ask

Take the rough request from the arguments (if empty, ask "What do you want to build or change?" and stop).
Before asking anything, read enough of the project to ask informed questions: CLAUDE.md, the files the request touches, existing patterns for similar features, how tests or previews run. Questions should name real files and real options ("add it to `Cart.tsx` or make a new component?"), not generic ones.

## 2. Check the request against the six slots

| Slot | Filled when you know |
|---|---|
| Goal | the concrete change, in one sentence |
| Why | the problem it solves or who it's for, enough to make judgment calls |
| Done | what "finished" looks like, and how you'll verify it (tests, run the app, screenshot, specific behavior) |
| Scope | what you may touch, and what must stay untouched |
| Pattern | an existing file, feature, or reference to imitate, if one exists |
| Constraints | stack, libraries allowed or banned, style, performance, deadlines |

Also check size. If the request is really several unrelated changes, say so and propose an order to do them one at a time.

## 3. Pick a path

Count the slots you can fill from the request plus the code.

- **Fast path** (5–6 slots filled, or a small change contained in one or two files): ask nothing. Go straight to the brief, put your guesses under Assumptions, and let the user correct them at hand-off.
- **Light path** (1–2 slots empty or vague): one round, asking only about those slots.
- **Full path** (3+ slots empty): interrogate as in step 5.

Tell the user which path you picked in one short line, so they can say "ask me more" or "skip the questions".

## 4. Classify the task

Pick the type that fits; if it's unclear, make "which kind of change is this?" the first question. Draw questions from its bank before falling back to generic slot questions. Skip any question the request or code already answers.

**Bug fix**
- Exact steps to reproduce, and what happens vs. what should happen
- Any error message, console output, or screenshot
- When it started, or what changed just before
- Done: the repro no longer fails, plus a test that would have caught it, if the project has tests

**UI change**
- Which screen and which states (empty, loading, error, logged out)
- Which sizes matter: phone, desktop, both; dark mode too?
- A reference: screenshot, site, or existing component to match
- What must look exactly the same afterwards
- Done: screenshots at the sizes that matter

**New feature**
- The user flow from start to finish, in their words
- Where the data comes from and where it's stored
- Edge cases: empty, error, slow network, duplicate input
- The smallest first version vs. what can wait
- Done: the flow works end to end in the running app

**Refactor**
- What's painful about the current code (the reason to refactor)
- Confirm behavior stays identical; anything allowed to change?
- Whether tests exist; if not, whether to add some first
- Done: same behavior before and after, tests passing both times

**Other** (config, content, scripts, docs): use the six slots directly.

## 5. Interrogate

- Use AskUserQuestion, up to 4 questions per round, at most 3 rounds. Put your recommended option first, marked "(Recommended)", based on what you saw in the code.
- Only ask about empty or vague slots. A slot you can fill confidently from the code is an assumption, not a question.
- Push back on vague answers. "Make it look better" or "make it work" is not done criteria; follow up with a concrete choice ("Better how: spacing, colors, or layout on mobile?").
- If an answer conflicts with the code or an earlier answer, point it out and ask which wins.

## 6. Compile the brief

Show it in this shape, plainly worded, no caps or "CRITICAL" emphasis, phrased as what to do rather than what to avoid:

```
Type: bug fix / UI change / new feature / refactor / other
Goal: ...
Why: ...
Context: relevant files and the pattern to follow
Scope: touch ... / leave alone ...
Constraints: ...
Done when: ... (verified by ...)
Assumptions: only the guesses that would change the result if wrong
```

Below it, one line titled "Your original was missing:" naming the slots the first request left out, so the user learns what to include next time. Omit it if nothing was missing.

## 7. Hand off

Ask with AskUserQuestion:
- **Build it now (Recommended for small/medium changes)**: execute the brief in this session, then verify against "Done when".
- **Plan first (Recommended for large changes)**: write a step plan from the brief and get approval before editing.
- **Just give me the prompt**: output the brief as a copyable block and stop.

When building, treat the brief as the spec and stay inside Scope.

## 8. Check, fix, re-check

After building, run the self-checking loop:

1. Check every "Done when" item using its stated method (run the tests, run the app, take the screenshot). A check you only reasoned about doesn't count; if a check can't actually run, say so instead of marking it passed.
2. If anything fails, fix the most important failure with the smallest change inside Scope, then re-check every item, since one fix can break something that passed before.
3. Stop when everything passes, or after 3 fix rounds. At the cap, stop and report what still fails and what you tried.

Fix the implementation, never the check: don't loosen a "Done when" item, skip a test, or drop a check to make a failure go green. If a check turns out to be wrong, stop and ask rather than quietly changing it.

Finish with a short report: each "Done when" item, pass or fail, and how it was verified.

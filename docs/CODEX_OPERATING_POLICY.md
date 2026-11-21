# Codex repository operating policy

Scope: **only** `SammyRyuga/tactile`. This policy records the repository
owner's instruction on November 21, 2026. It is a working authorization,
**not** a grant of GitHub API or application credentials. Codex must use its
existing authenticated connection with appropriate repo-scoped permissions.

## Repo operations Codex may perform autonomously

For work **inside this repository only**, Codex is authorized to:

- Create, switch, push, rebase, and delete **working branches**.
- Commit code, tests, documentation, and CI/workflow changes.
- Create, edit, comment on, assign, label, close, reopen, and merge pull requests
  and issues as needed for the approved Tactile work.
- Review and merge suitable dependency updates after compatibility and CI checks.
- Remove stale **Codex-created temporary branches** after checking that their
  work is safely merged or superseded.
- Fix failing builds, improve review correctness, and finish the COMPUTE 50
  deliverables without asking for approval for each routine repo action.

## Required branch workflow

1. Refresh `main` and read `AGENTS.md`, `progress.md`, and relevant PRs
   before making changes.
2. **All new development begins on a distinct branch off current `main`.**
   Never develop directly on `main`.
3. Implement narrowly, run applicable checks, update `progress.md` with
   verified results, push the branch, and open a reviewable PR.
4. Review the diff, checks, dependencies, and effects on the hosted demo.
   Merge the PR when its required checks pass and no unresolved blocking risks
   remain. Prefer a clean, reversible, traceable history.
5. Revalidate `main` after merging. Remove obsolete working branches when safe.

Do not merge failing or incompatible dependency updates merely to clear the
queue. Coordinate related version upgrades in one compatible branch and PR.

## Boundaries and safeguards

- **Never touch other repositories** or their PRs, issues, branches, releases,
  settings, secrets, workflows, or collaborators.
- Do not delete `SammyRyuga/tactile`, alter its ownership, visibility,
  collaborator permissions, security settings, or branch protection without
  a separate explicit request.
- Do not delete `main`, erase unmerged teammate work, or force-push shared
  branches. Never delete a branch containing unique work.
- Do not change external systems (Render, Supabase, email, domains, billing,
  provider accounts, or credentials) without separate authorization.
- Preserve secret hygiene, evidence provenance, test integrity, and correct
  attribution. Do not claim external deployment or live-model accuracy tests
  that were not actually completed.
- If an action is irrecoverable or there is uncertainty about lost teammate
  work, stop that destructive action, document the blocker, and continue
  non-destructive tasks.

Owner's authorization for the listed GitHub operations is standing
authorization for this repository, not for unrelated accounts or projects.

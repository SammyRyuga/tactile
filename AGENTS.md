# Working on Tactile

Tactile reviews assumptions behind engineering proposals. Keep demo runs local and repeatable. Live runs send proposals to the configured provider and keep credentials server-side.

- Use Node.js 22.19 or newer in the 22.x line, or Node.js 24 or newer. Run `npm ci` before developing.
- Start with `src/App.tsx` for the user flow, `shared/review.ts` for the contracts, and `server/pipeline.ts` for live orchestration.
- Keep extraction separate from the user-confirmed review. Preserve original claim IDs and reject citations outside the evidence for that claim.
- Treat missing or conflicting evidence as unresolved. Keep demo fixtures and live results visibly labeled.
- Run `npm run check` and exercise the changed user flow. Update `progress.md` with verified work and remaining gaps.
- Keep commits focused. Follow the checkout and review steps in [CONTRIBUTING.md](CONTRIBUTING.md).

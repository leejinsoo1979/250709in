# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the Vite React app: `components/` (UI), `editor/` + `engine/` (canvas logic), `store/` + `contexts/` (state), `services/` + `repositories/` (API/Firebase), shared helpers in `utils/` and `types/`.
- Styling lives in `styles/`, `theme/`, and Tailwind config; static assets ship from `public/`. Firebase wiring sits in `firebase/` and root `firebase.*` files.
- Tests live near features and in `src/test/` for mocks/setup; DXF fixtures and regression scripts are the root `test-*.js` and `test-dxf*` assets.
- `functions/` holds Cloud Functions, while reference docs stay in `docs/` and top-level reports.

## Build, Test, and Development Commands
- `npm run dev` starts Vite HMR; combine with emulators when touching data flows.
- `npm run build` plus `npm run preview` validate production bundles; `npm run prod:deploy` performs the build and Firebase hosting deploy.
- `npm run lint` applies the TypeScript + React ESLint stack. `npm run test`, `npm run test:ui`, and `npm run test:coverage` run Vitest suites, the UI watcher, and coverage; `npm run test:emu` binds emulator state.
- `npm run emu:start` (or `npm run firebase:emulators`) launches auth/firestore/storage locally; use `npm run firebase:deploy:*` or `npm run deploy` (GitHub Pages) for releases.

## Coding Style & Naming Conventions
- Follow the ESLint defaults: two-space indentation, single quotes, no trailing semicolons, and React hooks linting.
- Components and hooks use PascalCase (`RoomSidebar.tsx`, `useRoomStore.ts`); utilities stay camelCase.
- Prefer the `@/` alias for shared imports and keep side-effect imports near entry points.

## Testing Guidelines
- Vitest with Testing Library drives unit and UI coverage, configured via `src/test/setup.ts`.
- Name tests `*.test.ts[x]`, co-locate with features, and reuse fixtures from `src/test/mocks/` or DXF resources.
- Run `npm run test:coverage` on editor updates and `npm run test:emu` for Firestore or storage changes.

## Commit & Pull Request Guidelines
- Use `type: summary` commits (`fix:`, `feat:`, `debug:`); keep messages imperative and add Korean context only when it clarifies domain terms.
- PRs should describe scope, link issues, attach UI/DXF evidence for visual changes, and flag migrations in `scripts/` or rules files.
- Verify `npm run lint` and relevant `npm run test*` tasks before review, noting any exceptions.

## Firebase & Configuration Notes
- Keep secrets out of git; configure `.env.local` with `VITE_*` variables and avoid sharing emulator credentials.
- Update `firestore.rules`, `storage.rules`, and indexes with code changes, then run `npm run firebase:deploy:rules` or `npm run firebase:deploy:indexes` to sync.

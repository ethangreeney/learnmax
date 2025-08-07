Phase 5 — Persistent-first state

What changed:
- Client-side LearnView now derives unlockedIndex from mastered subtopics returned by the server.
- UI-only state (currentIndex, unlockedIndex) lives in a tiny Zustand store created per page mount.
- On quiz pass, the client calls /api/mastery to persist mastery, then locally unlocks the next subtopic.

What you can remove/stop using:
- src/lib/learn-store.ts (old in-memory topic/subtopic/quiz store driving the entire Learn flow)
- src/lib/store.ts for global "progress" numbers; use real values from DB on server pages instead.

Next steps to complete removal:
1) Remove imports/usages of useLearnStore and useProgressStore from client components.
2) On the Dashboard, read stats from DB directly (already implemented in Phase 4 server page).
3) If you still need per-session UI (like toasts, toggles), create tiny local Zustand stores colocated with those components.

Optional enhancements:
- Refetch lecture data after mastery to reflect new mastered state from DB (SWR/React Query) or navigate refresh.
- Add optimistic UI badge "Mastered" on subtopic list after pass.


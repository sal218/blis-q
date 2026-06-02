# Engineering Standards — Blisko

> This file defines code quality, design, and maintainability standards for the Blisko codebase. It applies to every file written or modified by any developer or AI agent. The goal is a codebase that the next developer — who has never seen this project before — can pick up and work with confidently.
>
> These are not suggestions. They are the baseline for all code in this repository.

---

## 1. File Size and Responsibility

**One file, one responsibility.** A file should do one thing and do it completely.

- If a file exceeds ~300 lines, ask: is this file doing more than one thing? If yes, split it.
- Route handlers belong in `routes.ts` — but if any single domain (auth, communities, events) grows beyond ~150 lines of routes, extract it to its own file: `routes/auth.ts`, `routes/communities.ts`, etc.
- Never put business logic inside a route handler. Route handlers do three things only: validate input, call a storage or service method, return a response.
- Never put database queries inside a route handler. All queries go through `DatabaseStorage` methods.
- React Native screens should not contain business logic. Screens render UI and call hooks or API functions. If a screen file exceeds ~250 lines, something that belongs in a hook or utility is living in the screen.

---

## 2. Function Design

- **One function, one job.** If you need the word "and" to describe what a function does, it should be two functions.
- Functions should be readable without comments. If a function needs a comment to explain what it does, rename it or split it.
- Prefer explicit over clever. A slightly longer but obvious implementation beats a short but opaque one every time.
- Maximum function length: ~40 lines. If it's longer, look for a logical extraction point.
- Avoid deeply nested logic. More than 3 levels of nesting is a signal to extract a helper function or invert the condition (early return pattern).

**Early return pattern — prefer this:**
```typescript
// Good — conditions handled at the top, happy path at the bottom
async function createPost(userId: string, data: PostInput) {
  if (!userId) return { error: 'Unauthenticated' };
  if (!data.content) return { error: 'Content required' };
  if (data.content.length > 2000) return { error: 'Content too long' };

  const post = await storage.createPost(userId, data);
  return { post };
}

// Avoid — deeply nested
async function createPost(userId: string, data: PostInput) {
  if (userId) {
    if (data.content) {
      if (data.content.length <= 2000) {
        const post = await storage.createPost(userId, data);
        return { post };
      }
    }
  }
}
```

---

## 3. Naming

Names are documentation. A well-named variable or function eliminates the need for a comment.

**Variables and functions:**
- Name variables for what they contain, not how they are typed: `userId` not `id`, `communityMembers` not `data`, `isLoading` not `loading`.
- Boolean variables and props start with `is`, `has`, `can`, or `should`: `isAuthenticated`, `hasUnreadMessages`, `canModerate`.
- Functions that fetch data start with `get`: `getCommunityById`, `getUserPosts`.
- Functions that create records start with `create`: `createCommunity`, `createEvent`.
- Functions that check a condition return a boolean and start with `is` or `has`: `isCommunityMember`, `hasActiveSubscription`.
- Event handlers start with `handle` or `on`: `handleSubmit`, `onMessageReceived`.

**Files:**
- Server files: lowercase with camelCase — `communityRoutes.ts`, `objectStorage.ts`.
- React Native screens: PascalCase with `Screen` suffix — `CommunityDetailScreen.tsx`, `EventListScreen.tsx`.
- React Native components: PascalCase — `CommunityCard.tsx`, `EventBanner.tsx`.
- Hooks: camelCase with `use` prefix — `useCommunityChat.ts`, `useEventRsvp.ts`.
- Constants: SCREAMING_SNAKE_CASE for true constants — `MAX_MESSAGE_LENGTH`, `DEFAULT_PAGE_SIZE`.

---

## 4. Components and Hooks

- **Components display data. Hooks manage data.** A component should never contain a `useEffect` that fetches data directly — put that in a hook or use TanStack Query.
- Props interfaces are defined directly above the component, named `[ComponentName]Props`: `interface CommunityCardProps { ... }`.
- Components that accept more than 5 props are a signal to consider whether the component is doing too much.
- Never pass a raw API response object as a prop. Map it to the specific fields the component needs.
- Avoid anonymous arrow functions as component definitions. Name your components — it makes React DevTools and error stacks readable.

```typescript
// Good
export function CommunityCard({ name, memberCount, onPress }: CommunityCardProps) { ... }

// Avoid
export default ({ name, memberCount, onPress }: any) => { ... }
```

---

## 5. TypeScript

- **No `any`.** Every `any` is a lie to the type system and a future bug. If you don't know the type, use `unknown` and narrow it.
- No type assertions (`as SomeType`) unless you can write a comment explaining exactly why the assertion is safe.
- All function parameters and return types are explicitly typed. Do not rely on inference for public function signatures.
- Use `type` for object shapes that are used in one place. Use `interface` for shapes that are extended or implemented elsewhere.
- Enums are avoided in favour of `as const` objects or union types — enums compile to runtime objects and have surprising behaviour in some contexts.

```typescript
// Prefer this
const NotificationType = {
  NEW_POST: 'new_post',
  NEW_EVENT: 'new_event',
} as const;
type NotificationType = typeof NotificationType[keyof typeof NotificationType];

// Over this
enum NotificationType {
  NEW_POST = 'new_post',
  NEW_EVENT = 'new_event',
}
```

---

## 6. Error Handling

- **Every async function that can fail must have its error handled.** An unhandled promise rejection in a route handler will crash the process.
- Route handlers must have a `try/catch` that returns a structured error response. Never let an unhandled exception reach the Express error middleware if you can catch it at the route level.
- Error responses always use the same shape: `{ error: string, details?: unknown }`. Never return different shapes for different errors in the same endpoint.
- Client-facing error messages never expose internal details (stack traces, SQL errors, file paths). Log the full error server-side, return a generic message to the client.
- Functions in `server/notifications.ts` and similar fire-and-forget utilities must never throw. Wrap their internals in `try/catch` and log errors silently.

```typescript
// Route handler pattern
router.post('/communities', isAuthenticated, async (req, res) => {
  try {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid input', details: result.error.issues });
    }
    const community = await storage.createCommunity(req.user.id, result.data);
    return res.status(201).json({ community });
  } catch (err) {
    console.error('[POST /communities]', err);
    return res.status(500).json({ error: 'Failed to create community' });
  }
});
```

---

## 7. Database and Storage Layer

- All database queries live in `server/storage.ts` inside `DatabaseStorage` methods. Zero exceptions.
- Method names describe the operation and the entity: `getCommunityById`, `createCommunityMembership`, `softDeletePost`.
- Methods that return nothing on a miss return `null`, not `undefined`. Callers check `if (!result)`.
- Methods that write to the `users` table must call `invalidateProfileCache(userId)` before returning.
- Never expose Drizzle query objects or raw database errors outside of `storage.ts`. Catch database errors inside the storage method and either handle them or rethrow a domain-level error with a clear message.
- Transactions wrap any operation that touches more than one table.

---

## 8. Constants and Magic Numbers

No magic numbers or magic strings in code.

```typescript
// Bad
if (content.length > 2000) { ... }
await redis.set(key, value, { ex: 60 });

// Good
const MAX_POST_LENGTH = 2000;
const PROFILE_CACHE_TTL_SECONDS = 60;

if (content.length > MAX_POST_LENGTH) { ... }
await redis.set(key, value, { ex: PROFILE_CACHE_TTL_SECONDS });
```

Constants that are used across multiple files live in `shared/constants.ts`. Constants local to one file live at the top of that file.

---

## 9. Avoiding Over-Engineering

Build what is needed now. Do not build what might be needed later.

- No abstract base classes, factory factories, or plugin systems unless a concrete requirement demands them.
- No generic utility functions that are only used once. Write the specific thing.
- No premature optimisation. Write the clear version first. Optimise when there is a measured problem.
- No configuration objects for things that are not configurable. If something has one value, it is a constant, not a config.
- When choosing between two approaches, pick the one the next developer will understand in 30 seconds without context.

---

## 10. Comments

Comments explain **why**, not **what**. The code explains what. If you need to explain what the code does, the code needs to be rewritten.

```typescript
// Bad — explains what, which the code already shows
// Loop through members and send notification to each one
for (const member of members) {
  await notifyUser(member.id, payload);
}

// Good — explains why, which the code cannot show
// Skip the community owner — they triggered the event and don't need to be notified about their own action
for (const member of members.filter(m => m.id !== actorId)) {
  await notifyUser(member.id, payload);
}
```

Comments are required for:
- Non-obvious security decisions (add a note referencing the rule in CLAUDE.md)
- Workarounds for known bugs or platform limitations (include the bug reference or date)
- Performance-critical sections where a simpler implementation was consciously rejected

---

## 11. Git and Branching

- Never commit directly to `main`. Always create a branch.
- Branch names follow the pattern: `feat/community-chat`, `fix/event-rsvp-duplicate`, `chore/update-dependencies`.
- Commit messages are present tense, imperative: "Add community chat endpoint" not "Added" or "Adding".
- One logical change per commit. A commit that fixes a bug and adds a feature is two commits.
- Every bug fix and security patch ships with a regression test on the same branch.

---

## 12. Handoff Readiness

This codebase will be handed to a developer who has never seen it before. Every decision should be made with that person in mind.

- If you had to leave the project tomorrow, would the next developer be able to understand this file without you? If not, it needs work.
- New concepts or non-obvious patterns get a brief comment pointing to the relevant section in `CLAUDE.md` or `TRANSFER_CONTEXT_EVENTAB_TO_BLISKO.md`.
- Do not leave TODO comments in committed code. Either do it now or create a tracked issue. A TODO in code is a thing that will never get done.
- Delete dead code. Commented-out code that is not coming back is noise. Version control exists — it can be recovered if needed.
- Keep `CLAUDE.md`'s issue tracker up to date. When a bug is found and fixed, it goes in the tracker. When a known risk is accepted, it goes in the accepted risks section.

---

*These standards exist so that Blisko remains maintainable as it grows and as the team changes. When in doubt, optimise for the next person who reads the code, not for the person writing it today.*

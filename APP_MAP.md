# APP_MAP — Travel Together App

> Stack: Next.js 16, React 19, Apollo Client 4 + Apollo Server 5, Mongoose 9, NextAuth 4, Socket.IO client, Redis (rate-limiting), TailwindCSS 4, TypeScript 5, JWT, bcryptjs, qrcode.react

---

## File Map

```
app/
  layout.tsx               Root layout — wraps ApolloWrapper + AuthProvider + Toaster
  auth-provider.tsx        SessionProvider; on auth writes appJwt → cookie "guestToken"; redirects / → /dashboard
  page.tsx                 Home/landing — join-journey or create-journey entry point
  not-found.tsx            404 page
  globals.css              Global CSS reset + Tailwind base
  context/
    CurrencyContext.tsx    Provides formatCurrency() via React context
  components/
    ActivityFeed.tsx       Expense list + Action Logs tab; leader can edit/delete any expense (61KB)
    AddExpenseForm.tsx     Add expense form with split calculator + image upload (23KB)
    JourneySettingsModal.tsx  Leader-only settings: lock, input-lock, approval, password (13KB)
    LoginBtn.tsx           Google sign-in / sign-out button
    MembersModal.tsx       Member list; leader: remove + guest QR; guest: self-QR regenerate (20KB)
    MyTotalSpend.tsx       Personal spend summary widget
    PendingRequestsModal.tsx  Leader approve/reject pending join requests
    SettleUpModal.tsx      Debt settlement UI with balance calculation (31KB)
    StyledQRCode.tsx       Styled QR code renderer using qr-code-styling
    TailwindDatePicker.tsx Tailwind-styled date input component
    UserSettingsModal.tsx  User currency preference settings
  dashboard/
    page.tsx               Auth-required dashboard — lists user's journeys
  journey/[slug]/
    page.tsx               Main journey room — expenses, activity logs, members, settings (38KB)
  join/
    page.tsx               Join via QR token link; handles password gate + approval pending state
  join/guest/
    page.tsx               Claim guest session via signed JWT; handles PASSWORD_REQUIRED flow
  api/
    auth/[...nextauth]/
      route.ts             NextAuth Google OAuth handler
    graphql/
      route.ts             Apollo Server GraphQL endpoint with rate-limiting middleware
    image/[id]/
      route.ts             Serve expense receipt image binary by expense ID

lib/
  authOptions.ts           Google OAuth; on sign-in upserts DB user; attaches userId + appJwt to session
  mongodb.ts               Cached Mongoose connection helper
  rateLimiter.ts           rlGeneral(200/60s) · rlMutations(20/60s) · rlAuth(5/600s) · rlCreateJourney(3/3600s) — Redis-backed
  apollo-wrapper.tsx       Client: errorLink→authLink(guestToken cookie)→httpLink; SSR: SSRMultipartLink→httpLink
  apolloCache.ts           addExpenseToJourneyCache · removeExpenseFromJourneyCache · addMemberToJourneyCache · updateJourneyMembers
  graphql/
    typeDefs.ts            Schema: User · Journey · ActionLog · Expense · Split · AuthPayload · GuestUserResponse + all Q/M
    resolvers/
      index.ts             Merges user + journey + expense resolvers; maps Journey · ActionLog · Expense · Split · User
      users.ts             createUser · joinAsGuest · createGuestUser · regenerateGuestInvite(leader or self-guest) · claimGuestUser · login
      journeys.ts          createJourney · updateJourney · generateJoinToken · joinJourneyViaToken · setJourneyPassword ·
                           toggleApprovalRequirement · toggleJourneyLock · toggleJourneyInputLock · approveJoinRequest ·
                           rejectJoinRequest · approveAllJoinRequests · rejectAllJoinRequests · removeMember · leaveJourney (32KB)
      expenses.ts          addExpense(logs EXPENSE_CREATED) · updateExpense(payer-or-leader; logs before/after metadata) ·
                           deleteExpense(payer-or-leader; logs description)
  models/
    User.ts       { name, email?, isGuest, expireAt } — TTL index on expireAt (guest auto-delete)
    Journey.ts    { name, slug, startDate?, endDate?, leaderId, members[], pendingMembers[], rejectedMembers[],
                    password?, requireApproval, isLocked, isInputLocked, status, expireAt?, joinTokenJti?, joinTokenExpiresAt? }
    Expense.ts    { journeyId, payerId, totalAmount, description, imageBinary?, splits[], expireAt? } — TTL index
    ActionLog.ts  { journeyId, actorId?, actorName?, action, targetType?, targetId?, details?, metadata?, expireAt } — TTL index
  hooks/
    useSocket.ts  Singleton socket.io-client; joins journey room; fires onUpdate on "update_data"; reconnects up to 5×
  utils/
    expiration.ts    refreshJourneyExpiration(sliding 5d or endDate+5d) · calculateJwtExpiration(journey→seconds)
    limiterKey.ts    getRateLimiterKey → "user:<id>" or "ip:<x-forwarded-for>"
    notifySocket.ts  notifyJourneyUpdate — debounce 1000ms, MAX_RETRIES=3, exponential backoff; clearPendingNotifies (test helper)
    actionLog.ts     logJourneyAction — writes ActionLog document with journeyId, actor, action, details, metadata, expireAt

scripts/
  check_redis.js   One-off script to verify Redis connectivity
test/              Jest suite (13 files — see §Tests)
doc/
  MANUAL_TEST_GUIDE.md  Manual QA test scenarios
  TODO_document.md      Feature backlog and known issues
```

---

## Routes

| URL | File | Notes |
| --- | ---- | ----- |
| `/` | `app/page.tsx` | Landing; create or join journey |
| `/dashboard` | `app/dashboard/page.tsx` | Requires auth; lists journeys |
| `/journey/[slug]` | `app/journey/[slug]/page.tsx` | Main room; auth via cookie |
| `/join` | `app/join/page.tsx` | Join via QR token; password gate |
| `/join/guest` | `app/join/guest/page.tsx` | Claim guest session via JWT token |
| `/api/graphql` | `app/api/graphql/route.ts` | Apollo Server; rate-limited |
| `/api/auth/[...nextauth]` | NextAuth | Google OAuth |
| `/api/image/[id]` | `app/api/image/[id]/route.ts` | Serve receipt binary |

---

## GraphQL Operations → Resolver File

**Queries** (`resolvers/journeys.ts` + `resolvers/users.ts`)
`getJourneyDetails` · `getUserJourneys` · `getJourneyActions` · `getUsers` · `me`

**User Mutations** (`resolvers/users.ts`)
`createUser` · `joinAsGuest`★ · `createGuestUser`★ · `regenerateGuestInvite` · `claimGuestUser` · `login`

**Journey Mutations** (`resolvers/journeys.ts`)
`createJourney`★ · `updateJourney` · `generateJoinToken` · `joinJourneyViaToken`★ · `setJourneyPassword` ·
`toggleApprovalRequirement` · `toggleJourneyLock` · `toggleJourneyInputLock` · `approveJoinRequest` ·
`rejectJoinRequest` · `approveAllJoinRequests` · `rejectAllJoinRequests` · `removeMember` · `leaveJourney`

**Expense Mutations** (`resolvers/expenses.ts`)
`addExpense` · `updateExpense` · `deleteExpense`

★ = rate-limited via rlCreateJourney (3/hr)

---

## Auth Flow

```
Google OAuth → NextAuth → jwt() callback
  → upsert User in MongoDB → sign appJwt (JWT_SECRET, 30d)
  → session.user.appJwt → AuthProvider writes to cookie "guestToken"
  → Apollo authLink reads "guestToken" → Authorization: Bearer <jwt>
  → GraphQL route verifies JWT → context.user.userId
Guest path: leader creates guest → signed JWT → QR → /join/guest?token=
  → claimGuestUser verifies JWT → password check if journey.password set
  → writes "guestToken" cookie → redirects to /journey/[slug]
```

---

## ENV VARS

| Key | Purpose |
| --- | ------- |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `SOCKET_SECRET` | Shared secret for socket notify webhook |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.IO server URL (client-side) |
| `NEXTAUTH_URL` | NextAuth base URL |
| `NEXTAUTH_SECRET` | NextAuth session encryption + join token signing |
| `GOOGLE_CLIENT_ID` | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth app client secret |
| `JWT_SECRET` | Signs guest/user JWTs for Apollo auth |
| `REDIS_URL` | Redis connection URL for rate limiters |

---

## Key Patterns

1. **Dual JWT system**: NextAuth session JWT (NEXTAUTH_SECRET) for join tokens; separate JWT_SECRET for user/guest auth tokens sent in Apollo headers.
2. **Cookie name "guestToken"** used for both regular users (appJwt from Google OAuth) and actual guests — naming is misleading.
3. **Leader override on expenses**: `updateExpense`/`deleteExpense` allow journey leader to modify any member's expense; logged with actor identity.
4. **ActionLog metadata** stored as Mixed in MongoDB, serialised to JSON string in GraphQL resolver — ActivityFeed parses it client-side to show before/after diffs.
5. **Sliding-window expiration**: journeys without `endDate` auto-delete after 5 days of inactivity; `endDate` journeys use fixed `endDate + 5d`.
6. **Socket debounce**: `notifyJourneyUpdate` coalesces rapid mutations into one socket ping per journey per 1s window.
7. **Rate limiter bypass in tests**: `rlCreateJourney` is a no-op stub when `NODE_ENV=test`.
8. **Guest self-QR**: guests can call `regenerateGuestInvite` for their own userId; leader can call it for any guest in the journey.

---

## Tests

| File | Covers |
| ---- | ------ |
| `actionLogs.test.ts` | ActionLog creation resolver |
| `apolloCache.test.ts` | Cache add/remove helpers |
| `dateNormalization.test.ts` | endDate end-of-day normalisation |
| `expenses.test.ts` | Expense CRUD + leader override |
| `guestAuth.test.ts` | Guest claim + password gate |
| `journeyToken.test.ts` | Join token generate + validate |
| `LoginBtn.test.tsx` | LoginBtn render states |
| `MembersModal.test.tsx` | QR button visibility + remove |
| `MyTotalSpend.test.tsx` | Spend widget calculation |
| `notifySocket.test.ts` | Socket notify (skipped — open handle) |
| `removeMember.test.ts` | removeMember leader-only |
| `resolvers_rateLimit.test.ts` | Rate limiter enforcement |
| `securityJoinFlows.test.ts` | Join approval/rejection flows |

`npm run dev` · `npm run build` · `npm run test` · `npm run lint`

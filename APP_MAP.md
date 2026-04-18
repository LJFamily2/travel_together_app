# APP_MAP — Travel Together
> Stack: Next.js 15 App Router · TypeScript · Apollo GraphQL · MongoDB/Mongoose · Redis · Socket.IO · NextAuth v4

---

## File Map

```
app/
  layout.tsx              ROOT – AuthProvider + ApolloWrapper + Toaster
  auth-provider.tsx       SessionProvider; sets guestToken cookie; redirects /→/dashboard on login
  page.tsx                Landing / sign-in
  not-found.tsx           404
  globals.css
  context/
    CurrencyContext.tsx   useCurrency() — US/EU format, persisted to localStorage
  components/
    ActivityFeed.tsx      Expense history list + splits display
    AddExpenseForm.tsx    Add/edit expense → addExpense / updateExpense mutations
    JourneySettingsModal  Password, approval, lock, input-lock, QR code
    LoginBtn.tsx          Google signIn/signOut button
    MembersModal.tsx      View members, remove, regenerate guest invite
    MyTotalSpend.tsx      Per-user spend summary widget
    PendingRequestsModal  Approve / reject join requests
    SettleUpModal.tsx     Debt settlement calculator
    StyledQRCode.tsx      QR renderer (qr-code-styling)
    UserSettingsModal.tsx Currency preference + user info
  dashboard/page.tsx      My journeys list + create journey
  journey/[slug]/page.tsx Journey tracker — main page (~31KB)
  join/page.tsx           Token/QR join flow
  join/guest/page.tsx     Anonymous name-only join
  api/
    auth/[...nextauth]/route.ts   NextAuth handler → lib/authOptions.ts
    graphql/route.ts              Apollo Server; JWT context; rlGeneral rate limit
    image/[id]/route.ts           Serve expense imageBinary from MongoDB by expense _id

lib/
  authOptions.ts          Google OAuth → find/create User → sign appJwt (JWT_SECRET, 30d)
  mongodb.ts              dbConnect() singleton
  rateLimiter.ts          Redis limiters: rlGeneral(200/min) rlMutations(20/min) rlAuth(5/10min) rlCreateJourney(3/hr)
  apollo-wrapper.tsx      ApolloNextAppProvider; authLink reads guestToken cookie; errorLink toasts 429
  apolloCache.ts          addExpenseToJourneyCache / removeExpense / addMember / updateJourneyMembers
  graphql/
    typeDefs.ts           All GQL types + schema
    resolvers/
      index.ts            Merges users + journeys + expenses
      users.ts            createUser, createGuestUser, regenerateGuestInvite, claimGuestUser, login, me
      journeys.ts         Journey CRUD, join flows, tokens, locks, approval (~23KB — largest resolver)
      expenses.ts         addExpense, updateExpense, deleteExpense
  models/
    User.ts               { name, email?, isGuest, expireAt } — TTL index on expireAt
    Journey.ts            { name, slug, leaderId, members[], pendingMembers[], password?, requireApproval,
                            isLocked, isInputLocked, status, expireAt, joinTokenJti/ExpiresAt/Used }
    Expense.ts            { journeyId, payerId, totalAmount, description, splits[], imageBinary?, expireAt }
  hooks/
    useSocket.ts          Singleton Socket.IO client; joins journey room; fires onUpdate on "update_data"
  utils/
    expiration.ts         refreshJourneyExpiration() sliding TTL (5d); calculateJwtExpiration()
    limiterKey.ts         getRateLimiterKey(ctx) → "user:<id>" | "ip:<x>"
    notifySocket.ts       notifyJourneyUpdate(id) — debounced 1s POST to socket server; 3 retries

scripts/check_redis.js    One-off: verify Redis connection
test/                     Jest suite (10 files — see §Tests)
doc/TODO_document.md      Backlog
doc/MANUAL_TEST_GUIDE.md  QA checklist
```

---

## Routes

| URL | File | Notes |
|---|---|---|
| `/` | `app/page.tsx` | Landing |
| `/dashboard` | `app/dashboard/page.tsx` | Journey list |
| `/journey/[slug]` | `app/journey/[slug]/page.tsx` | Main tracker |
| `/join` | `app/join/page.tsx` | Token join |
| `/join/guest` | `app/join/guest/page.tsx` | Anonymous join |
| `POST /api/graphql` | `app/api/graphql/route.ts` | All data ops |
| `/api/auth/[...]` | NextAuth | Google OAuth |
| `GET /api/image/[id]` | image route | Expense images |

---

## GraphQL Operations → Resolver File

**Queries** (`resolvers/users.ts` + `resolvers/journeys.ts`)
`me` · `getUsers` · `getUserJourneys` · `getJourneyDetails(slug)`

**User Mutations** (`resolvers/users.ts`)
`createUser` · `createGuestUser` · `regenerateGuestInvite` · `claimGuestUser` · `login`

**Journey Mutations** (`resolvers/journeys.ts`)
`createJourney`(rl 3/hr) · `joinJourney` · `generateJoinToken` · `joinJourneyViaToken` · `joinAsGuest` · `leaveJourney` · `setJourneyPassword` · `toggleApprovalRequirement` · `toggleJourneyLock` · `toggleJourneyInputLock` · `approveJoinRequest` · `rejectJoinRequest` · `approveAllJoinRequests` · `rejectAllJoinRequests` · `removeMember`

**Expense Mutations** (`resolvers/expenses.ts`)
`addExpense` · `updateExpense` · `deleteExpense`

---

## Auth Flow

```
Google OAuth → NextAuth (authOptions.ts)
  jwt cb: find/create User → sign appJwt (JWT_SECRET 30d)
  session cb: expose userId + appJwt
  auth-provider.tsx: guestToken cookie = appJwt

Request → api/graphql/route.ts
  Bearer token → jwt.verify → rlGeneral.consume(key) → context{req, user, limiters}
  Resolvers apply: rlMutations · rlAuth · rlCreateJourney as needed
```

---

## ENV VARS

| Key | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB Atlas |
| `REDIS_URL` | RedisLabs cloud |
| `JWT_SECRET` | Guest + app JWT signing |
| `NEXTAUTH_SECRET` | NextAuth session encryption |
| `NEXTAUTH_URL` | App base URL |
| `GOOGLE_CLIENT_ID/SECRET` | OAuth credentials |
| `SOCKET_SECRET` | Socket server webhook auth |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.IO server (client-visible) |

---

## Key Patterns

1. **Dual auth path** — Google users get `appJwt` via NextAuth; guests get JWT directly. Both use `guestToken` cookie via `authLink`.
2. **Single-active join token** — `joinTokenJti` on Journey; consuming sets `joinTokenUsed=true`.
3. **TTL cascade** — call `refreshJourneyExpiration()` after mutations; cascades to Expense + guest Users.
4. **Socket singleton** — `globalSocket` is module-level in `useSocket.ts`; one connection per tab.
5. **`rlCreateJourney` no-ops in tests** — `NODE_ENV==="test"` guard in `rateLimiter.ts`.
6. **Image storage** — `Buffer` in `Expense.imageBinary`; GridFS migration in TODO.

## Tests

| File | Covers |
|---|---|
| `LoginBtn.test.tsx` | Sign-in button |
| `MyTotalSpend.test.tsx` | Spend calc |
| `apolloCache.test.ts` | Cache helpers |
| `expenses.test.ts` | Expense resolvers |
| `guestAuth.test.ts` | Guest create/claim |
| `journeyToken.test.ts` | Join token single-use |
| `notifySocket.test.ts` | Debounce & retry |
| `removeMember.test.ts` | removeMember resolver |
| `resolvers_rateLimit.test.ts` | Rate limit enforcement |
| `securityJoinFlows.test.ts` | Lock/approval edge cases |

`npm test` · `npm run dev` · `node scripts/check_redis.js`

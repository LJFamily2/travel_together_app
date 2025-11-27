1. Architecture & Database Decision
Since you want to store images directly in the database (Binary data) and are familiar with MongoDB (from your previous work), I recommend sticking with it. It handles unstructured data (like variable splits) very well.

Primary Choice: MongoDB with GridFS.

Why: MongoDB has a built-in specification called GridFS for storing files larger than the 16MB document limit (images). It is native to the Mongo driver.

Alternative: PostgreSQL.

Why: You can use the bytea column type to store binary strings, but it can bloat the database quickly if not managed well.

High-Level Architecture
Next.js (Port 3000): Hosting the Frontend and the GraphQL API. It talks to the Database to save data.

Node.js Socket Server (Port 4000): Maintains open WebSocket connections. It does not write to the DB. It simply receives a trigger from Next.js saying "Data Changed" and broadcasts it to the phone screens.

Database: Stores User data, Journey data, and Images.

2. Project Requirements Document (PRD)
A. Core Logic & Privacy
The "Privacy" Rule:

Public (Group Level): Any member can see the details of a specific Activity/Bill (e.g., "Dinner at 7 PM: Total $100, Shared by Alice, Bob, Charlie").

Private (User Level): A user can only see their own "Total Spend" and "Total Owed."

Leader Restriction: The Leader cannot see the total spend of other members. They can only see the journey status (Active/Complete) and members list.

Deduction Logic (Scenario B):

Calculation: (Split Amount) - (Deduction) = Final Owed.

Example: Activity Cost: $100. Split equally (2 people): $50 each. Payer deducts $10 for User B. User B now sees: "Owe $40".

B. Authentication & Persistence
OAuth Users: Data saved for 30 days.

Quick Use (Guest) Users:

Security Strategy: When a user joins via QR, generate a GuestToken (JWT). Save this in localStorage.

Re-joining: On page load, the app checks localStorage. If a token exists and the Journey is still "Active," the user automatically rejoins.

Cleanup: Once the Leader marks Journey as "Complete," the backend invalidates all Guest Tokens for that journey and deletes the data.

C. Features
QR Code: Contains the JourneyID and a JoinKey (for basic security so random people can't guess IDs).

Image Upload: Users upload bill images; stored in MongoDB GridFS; displayed in the activity detail view.

Settlement: Users upload bank info. Once Payer confirms receipt, the debt is settled.

3. Developer To-Do List
I have broken this down into phases to manage complexity.

Phase 1: Project Setup (The Foundation)
[ ] Initialize Next.js App: npx create-next-app@latest (App Router recommended).

[ ] Initialize Socket Server: Create a separate folder socket-server with npm init -y, npm install express socket.io.

[ ] Database Setup: Set up a MongoDB Atlas cluster (free tier) or local instance.

[ ] Environment Variables: Create .env files for DB strings and API secrets.

Phase 2: The Data Layer (Next.js + GraphQL)
[ ] Install GraphQL dependencies: npm install @apollo/server @as-integrations/next graphql mongoose.

[ ] Define Mongoose Schemas:

User: (id, name, email, avatar, bankInfo, isGuest).

Journey: (id, leaderId, members[], status, createdAt).

Expense: (id, journeyId, payerId, totalAmount, imageBinary, splits: [{ userId, baseAmount, deduction, reason }]).

[ ] Setup GraphQL Route: Create app/api/graphql/route.ts.

[ ] Implement Resolvers (CRUD):

createJourney, joinJourney

addExpense, updateExpense (Handle the deduction math here).

Crucial: In the getJourneyDetails resolver, ensure you filter out "Total Spend" fields for anyone other than the currentUser.

Phase 3: Real-Time Communication (Node.js + Socket.io)
[ ] Server Logic: In socket-server/index.js, setup io.on('connection').

[ ] Rooms: Use socket.join(journeyId) so messages only go to the relevant group.

[ ] The "Webhook" Endpoint: Create an endpoint on this Node server (e.g., POST /notify-update).

Logic: When Next.js finishes saving an expense, it sends a POST request to this Node server. The Node server then emits io.to(journeyId).emit('update_data').

[ ] Client Side: Install socket.io-client in Next.js and listen for update_data to trigger a GraphQL refetch (Apollo Client refetch()).

Phase 4: Authentication (OAuth + Guest)
[ ] NextAuth.js: Install next-auth for the OAuth part (Google/GitHub).

[ ] Guest Logic:

Create a mutation joinAsGuest(name, journeyId).

Return a signed JWT.

Save JWT in localStorage.

Add logic to Apollo Client to attach this token to every request header.

Phase 5: Image Handling & UI
[ ] Image Upload Component: Create a drag-and-drop zone.

[ ] Backend Image Handling:

Convert the uploaded file to base64 or Buffer in the GraphQL mutation.

Store in MongoDB.

Optimization: Create a separate REST API route in Next.js (GET /api/image/[id]) to serve the image, rather than sending huge base64 strings via GraphQL.

[ ] Dashboard UI:

"My Total Spend" card (Visible only to me).

"Activity Feed" (Visible to all).

"Settle Up" Modal.

Phase 6: Cleanup & Polish
[ ] Delete Logic: Create a scheduled task (Cron) or a trigger that deletes "Quick Use" data when the status changes to Completed or after 24h of inactivity.

[ ] Testing: Open the app on your phone (Guest) and Laptop (Leader) to test real-time sync.
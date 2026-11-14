# NEXORA 2.0 — The Intelligence That Remains

A redesigned NEXORA knowledge-continuity platform based on the original 12-page Pixel Pair proposal. This release keeps the proposal's core workflow (connect, ingest, reconstruct, build project memory, verify, assess knowledge risk, review/approve, permissions, handover and continuity) while changing the product UI and repository workflow.

## What changed in this release

- Uses the supplied NEXORA orbital logo artwork throughout the interface: full wordmark in the navigation/login identity, the orbital N mark on the login feature panel/loading state, and the mark as the browser favicon. White image backgrounds are made transparent for clean placement.
- Adds a profile dropdown in the top-right with persistent Dark and Light appearance choices and Log out.
- Uses Inter for body/UI text and Poppins for bold headings. Short helper/instruction text is italicised for distinction.
- Resets account-specific client state at each sign-in/sign-out/account change, including AI assistant chat, pending question, sources, repository list/search, selected pass-on report, project/source forms, and GitHub status. Late API responses from the previous session are ignored so old AI answers cannot reappear after switching accounts.

- New dark charcoal / deep-grey interface with teal structural surfaces and coral primary actions.
- Off-white body text, larger headings, wider spacing and one focused page/module at a time.
- Account entry with email/password registration and sign-in, plus Google OAuth.
- A dedicated **Enter mock database** action that skips account login and opens a seeded demonstration workspace.
- Mock mode has no GitHub navigation or GitHub API integration. It never requests GitHub authorisation or reads real repositories.
- Real accounts can connect a GitHub profile with OAuth, view accessible repositories (owned, collaborator and organisation-member repositories), search the list, and create a repository-specific pass-on report.
- Pass-on reports use GitHub repository metadata, README, recent commits, open issues, pull requests, branches, languages and contributor data. If `OPENAI_API_KEY` is configured, NEXORA asks OpenAI for a structured evidence-first report. If not, it builds a transparent deterministic evidence summary and labels that limitation.
- Every project, report, source and risk record is scoped by `ownerId`, so real accounts do not see each other's workspace records.
- Local JSON persistence is the default. A MongoDB URI can be configured for persistent MongoDB storage.
- The application includes an account-scoped source library, knowledge radar, AI assistant, project list and pass-on report viewer.

## Stack

- Frontend: React 18, Vite, Lucide icons, custom CSS
- Backend: Node.js, Express
- Database: local JSON persistence by default, optional MongoDB/Mongoose
- Authentication: JWT sessions, bcrypt password hashing, Google OAuth 2.0
- Repository source: GitHub OAuth + REST API
- AI: OpenAI Chat Completions with JSON structured response mode; evidence-only fallback when no API key is configured

## Requirements

- Node.js 20 LTS or newer recommended
- npm
- Internet connection for package installation and OAuth/GitHub/OpenAI requests
- No VS Code extensions are required

## Windows / VS Code setup

1. Extract the ZIP to a folder such as `C:\Projects\NEXORA`.
2. Open that folder in VS Code: **File → Open Folder**.
3. Open **Terminal → New Terminal**.
4. If PowerShell blocks `npm.ps1`, either run `npm.cmd` instead of `npm`, or set the per-user policy once:

   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
   ```

   Close and reopen the VS Code terminal afterwards.

5. Copy the environment examples:

   ```powershell
   Copy-Item server/.env.example server/.env
   Copy-Item client/.env.example client/.env
   ```

6. Install dependencies:

   ```powershell
   npm.cmd install
   npm.cmd run install:all
   ```

7. Start both apps:

   ```powershell
   npm.cmd run dev
   ```

8. Open the frontend at **http://localhost:5173**. The API health endpoint is **http://localhost:5000/api/health**.

### PowerShell note

If `npm` returns `npm.ps1 cannot be loaded because running scripts is disabled`, use `npm.cmd install`, `npm.cmd run install:all` and `npm.cmd run dev`, or apply the CurrentUser execution policy above.

## Demo / mock database

On the login page, click **Enter mock database**. This opens seeded local sample content without email login or Google login. It does not expose the Repositories navigation item, does not start GitHub OAuth, and cannot call GitHub endpoints. Mock content is clearly labelled and stored separately in `server/data/nexora-mock-db.json`, even when real accounts use MongoDB. It cannot see or modify real account records.

## Email/password accounts

Email/password registration works immediately with the default local JSON store. Passwords are stored as bcrypt hashes. The JWT is kept in browser localStorage for the account session. Account-owned projects, reports, sources and risks are separated by account ID.

## Configure Google sign-in

1. Open Google Cloud Console: https://console.cloud.google.com/.
2. Create/select a project and configure the OAuth consent screen.
3. Create an OAuth Client ID for a **Web application**.
4. Add this authorised redirect URI:

   `http://localhost:5000/api/auth/google/callback`

5. Put the client ID and secret in `server/.env`:

   ```env
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
   ```

6. Restart the backend. The Google button will then perform real OAuth sign-in.

## Configure real GitHub integration

1. Sign in using an email/password account or Google account. Do not use mock mode.
2. Open GitHub Developer Settings → OAuth Apps: https://github.com/settings/developers.
3. Create an OAuth App with:
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:5000/api/github/callback`
4. Generate a client secret and add both values to `server/.env`:

   ```env
   GITHUB_CLIENT_ID=your-github-client-id
   GITHUB_CLIENT_SECRET=your-github-client-secret
   GITHUB_CALLBACK_URL=http://localhost:5000/api/github/callback
   ```

5. Restart the backend, sign in to a real account and open **Repositories → Connect GitHub profile**.
6. Approve the GitHub authorisation. NEXORA will return to the repository page. Click **Load repositories**.
7. Select any accessible repository and click **Create pass-on report**.

The OAuth request asks for `read:user`, `user:email` and `repo`. GitHub's classic OAuth `repo` scope is broad and permits access to private repository data. The Google sign-in callback uses a one-time exchange code that expires after one minute; the full NEXORA JWT is not placed in the redirect URL. Only connect an account whose repositories you are authorised to share with this local NEXORA instance. For a public production launch, consider migrating to a GitHub App with narrowly selected read-only repository permissions.

GitHub access tokens are encrypted at rest in the user record using AES-256-GCM. Set a stable, private `TOKEN_ENCRYPTION_KEY` in `server/.env`; do not change it after connecting GitHub unless you are prepared to reconnect accounts.

## Configure OpenAI

Your original NEXORA PDF specifies **LLM API + Structured Outputs + Retrieval-Augmented Generation (RAG)**. This implementation uses OpenAI for structured repository report synthesis and evidence-grounded assistant answers. It does not claim to train a foundation model.

Add to `server/.env`:

```env
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o-mini
```

Restart the backend. Repository reports use the OpenAI model when configured. Without a key, the app still builds a clearly labelled structured evidence summary from the GitHub API results. The AI assistant can retrieve account-specific sources and saved reports; OpenAI synthesises an answer when configured.

## Use MongoDB instead of local JSON

1. Create a MongoDB Atlas cluster or run MongoDB locally.
2. Add the connection URI to **`server/.env`** (not `client/.env` and not a root-level `.env`). NEXORA now resolves this file relative to the server source, regardless of which folder VS Code or npm uses as the working directory:

   ```env
   MONGO_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/nexora
   ```

3. Stop the running dev process with `Ctrl+C`, then restart from the project root using `npm.cmd run dev`. The backend terminal should print `NEXORA connected to MongoDB for real accounts`. Check `http://localhost:5000/api/health`; it should include `"storage":"mongodb"`. If Atlas cannot be reached, the backend now prints a clear connection error and does not silently claim MongoDB is active.

When `MONGO_URI` is blank, real account data is persisted in `server/data/nexora-db.json`. Mock samples remain in their separate `server/data/nexora-mock-db.json` file. Do not commit real database credentials.

## Environment reference

| Variable | Purpose |
|---|---|
| `PORT` | API port, default 5000 |
| `CLIENT_ORIGIN` | Frontend origin, default localhost:5173 |
| `JWT_SECRET` | Signs account session tokens; replace before deployment |
| `TOKEN_ENCRYPTION_KEY` | Encrypts stored GitHub OAuth tokens; keep stable and secret |
| `MONGO_URI` | Optional MongoDB connection; blank uses JSON persistence |
| `OPENAI_API_KEY` | Enables OpenAI structured analysis |
| `OPENAI_MODEL` | OpenAI model name; default gpt-4o-mini |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `GOOGLE_CALLBACK_URL` | Google OAuth callback URL |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth credentials |
| `GITHUB_CALLBACK_URL` | GitHub OAuth callback URL |

## Notes and limitations

- The GitHub repository list follows pagination until GitHub returns no further pages, so the UI can show all repositories the authenticated profile is authorised to access. GitHub access is still bounded by the connected profile’s permissions and API rate limits.
- The pass-on report uses currently available repository metadata and recent GitHub activity. It cannot infer undocumented production architecture, deployment secrets, decisions or responsibilities. It identifies those as unknowns or recommended follow-ups.
- New repository reports start in `pending_review` state. A signed-in account owner can approve a report in the detail view before sharing it.
- The report fallback is not an LLM. Configure OpenAI to enable AI-written analysis.
- The current local development configuration is suitable for a prototype/demo. Before production deployment, add HTTPS, secure cookie-based sessions, CSRF protection, account recovery/email verification, audit logs, rate limiting, OAuth token rotation/revocation, stricter CORS, encrypted database backups and a security review.
- Never place `.env` files, OAuth credentials, API keys or access tokens in GitHub.

## Main routes

- `POST /api/auth/register` — create email/password account
- `POST /api/auth/login` — email/password sign-in
- `GET /api/auth/google` — Google OAuth start
- `POST /api/auth/mock` — mock workspace (no GitHub)
- `POST /api/github/connect/start` — begin GitHub OAuth for real account
- `GET /api/github/repos` — list accessible repositories
- `POST /api/github/report` — generate and save a repository pass-on report
- `GET /api/reports` — reports belonging to signed-in account
- `PATCH /api/reports/:id/approve` — approve an account-owned pass-on report
- `GET /api/workspace` — account-scoped workspace data
- `POST /api/ai/ask` — evidence-grounded assistant response

---

Built for Pixel Pair | Hack with Pune | NEXORA — The Intelligence That Remains.

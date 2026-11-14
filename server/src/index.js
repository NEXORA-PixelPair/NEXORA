import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import OpenAI from 'openai';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initStore, storageMode, findUserByEmail, findUserByGoogleId, findUserById, createUser, updateUser,
  listOwned, insertOwned, findOwned, updateOwned, deleteOwned
} from './store.js';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(SERVER_DIR, '.env') });
const app = express();
const port = Number(process.env.PORT || 5000);
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const jwtSecret = process.env.JWT_SECRET || 'change-this-development-secret-before-deployment';
app.use(cors({ origin: clientOrigin.split(',').map(x => x.trim()), credentials: true }));
app.use(express.json({ limit: '4mb' }));

const oauthStates = new Map();
const loginCodes = new Map();
const stateTtlMs = 10 * 60 * 1000;
function createState(payload) {
  const state = crypto.randomBytes(24).toString('hex');
  oauthStates.set(state, { ...payload, expiresAt: Date.now() + stateTtlMs });
  return state;
}
function consumeState(state) {
  const entry = oauthStates.get(state); oauthStates.delete(state);
  return entry && entry.expiresAt > Date.now() ? entry : null;
}
function signToken(user, mode = 'account') {
  return jwt.sign({ id: String(user._id), email: user.email || '', name: user.name || 'NEXORA Member', role: user.role || 'member', mode }, jwtSecret, { expiresIn: '7d' });
}
function safeUser(user) {
  return { id: String(user._id), name: user.name, email: user.email, role: user.role || 'member', githubLogin: user.githubLogin || null, githubConnected: Boolean(user.githubTokenEncrypted) };
}
function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new Error('Missing token');
    req.auth = jwt.verify(token, jwtSecret);
    req.ownerId = req.auth.id;
    req.isMock = req.auth.mode === 'mock';
    next();
  } catch { res.status(401).json({ message: 'Your session has expired. Please sign in again.' }); }
}
function realAccountOnly(req, res, next) {
  if (req.isMock) return res.status(403).json({ message: 'GitHub integration is unavailable in Mock Database mode.' });
  next();
}
function encryptSecret(value) {
  const key = crypto.createHash('sha256').update(process.env.TOKEN_ENCRYPTION_KEY || jwtSecret).digest();
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}
function decryptSecret(value) {
  const [iv, tag, encrypted] = String(value || '').split('.');
  const key = crypto.createHash('sha256').update(process.env.TOKEN_ENCRYPTION_KEY || jwtSecret).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
}
async function githubFetch(path, accessToken, accept = 'application/vnd.github+json') {
  const response = await fetch(`https://api.github.com${path}`, { headers: {
    Authorization: `Bearer ${accessToken}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'NEXORA-Knowledge-Continuity'
  } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const err = new Error(body.message || `GitHub API returned ${response.status}`); err.status = response.status; throw err;
  }
  return response;
}
async function getGithubToken(user) {
  if (!user?.githubTokenEncrypted) throw new Error('Connect your GitHub account first.');
  try { return decryptSecret(user.githubTokenEncrypted); }
  catch { throw new Error('The stored GitHub credential could not be decrypted. Reconnect GitHub.'); }
}
async function openaiJson(system, userContent, schemaName, schema) {
  if (!process.env.OPENAI_API_KEY) return null;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.2,
    response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
    messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }]
  });
  const raw = completion.choices?.[0]?.message?.content || '{}';
  return JSON.parse(raw);
}
function fallbackReport(repo, readme, languages, commits, issues, prs, branches, contributors) {
  return {
    executiveSummary: `${repo.full_name} is a ${repo.private ? 'private' : 'public'} ${repo.language || 'software'} repository. This report is assembled from repository metadata and the GitHub activity visible at report-generation time.`,
    projectPurpose: readme?.slice(0, 1800) || repo.description || 'No README content was available. Confirm the repository purpose with its maintainers.',
    setup: ['Review the README for installation and environment instructions.', 'Confirm required environment variables and services with the maintainer.', 'Run the repository test and build commands before taking ownership.'],
    architectureAndTechnology: [
      `Primary language: ${repo.language || 'Not declared'}.`,
      `Detected languages: ${Object.keys(languages || {}).join(', ') || 'No language statistics returned'}.`,
      `Default branch: ${repo.default_branch || 'Not declared'}.`,
      `Branches visible: ${branches.map(b => b.name).join(', ') || 'No branch data returned'}.`
    ],
    recentActivity: commits.slice(0, 10).map(c => `${c.commit?.author?.date || ''} — ${(c.commit?.message || '').split('\n')[0]} (${c.author?.login || c.commit?.author?.name || 'unknown author'})`),
    openWork: issues.filter(i => !i.pull_request).slice(0, 12).map(i => `#${i.number} ${i.title} [${i.state}]`),
    pullRequests: prs.slice(0, 12).map(i => `#${i.number} ${i.title} [${i.state}]`),
    ownershipAndContributors: contributors.slice(0, 10).map(c => `${c.login}: ${c.contributions} contributions`),
    decisionsAndConventions: ['No architectural decision record was inferred automatically. Review README and repository documentation for explicit decisions.'],
    risksAndKnowledgeGaps: [
      ...(repo.archived ? ['Repository is marked archived. Confirm whether the project is still maintained.'] : []),
      ...(issues.some(i => !i.pull_request) ? ['Open issues exist; assign owners and confirm prioritisation.'] : []),
      ...(!readme ? ['README content was not available; project setup and purpose may be under-documented.'] : []),
      'Confirm production deployment ownership, secrets management and recovery procedures with maintainers.'
    ],
    recommendedNextSteps: ['Read the README and verify local setup instructions.', 'Review open issues and pull requests with their owners.', 'Identify the maintainers responsible for deployments and releases.', 'Record architectural decisions and operational runbooks in the project memory.'],
    sourceEvidence: [
      { source: 'GitHub repository metadata', detail: `${repo.full_name} · default branch ${repo.default_branch || 'unknown'}`, url: repo.html_url },
      { source: 'README', detail: readme ? 'Repository README text retrieved.' : 'README was unavailable or not readable.', url: `https://github.com/${repo.full_name}#readme` },
      { source: 'Recent commits', detail: `${commits.length} commit records retrieved.`, url: `https://github.com/${repo.full_name}/commits/${repo.default_branch || 'HEAD'}` },
      { source: 'Open issues', detail: `${issues.filter(i => !i.pull_request).length} open issues retrieved.`, url: `https://github.com/${repo.full_name}/issues` },
      { source: 'Open pull requests', detail: `${prs.length} open pull requests retrieved.`, url: `https://github.com/${repo.full_name}/pulls` },
      { source: 'Contributors and languages', detail: `${contributors.length} contributor records and ${Object.keys(languages || {}).length} language categories retrieved.`, url: `https://github.com/${repo.full_name}/graphs/contributors` }
    ],
    limitation: 'This structured fallback is based only on the retrieved GitHub data. Configure OPENAI_API_KEY to generate a richer AI-written analysis. Verify findings with project maintainers.'
  };
}

app.get('/api/health', (_req, res) => res.json({ ok: true, storage: storageMode(), openaiConfigured: Boolean(process.env.OPENAI_API_KEY) }));

// Email/password account authentication.
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '') || !password || password.length < 8)
      return res.status(400).json({ message: 'Enter your name, a valid email address and a password of at least 8 characters.' });
    if (await findUserByEmail(email)) return res.status(409).json({ message: 'An account with this email already exists.' });
    const user = await createUser({ name: name.trim(), email: email.trim().toLowerCase(), passwordHash: await bcrypt.hash(password, 12), authProviders: ['email'], role: 'administrator' });
    res.status(201).json({ token: signToken(user), user: safeUser(user) });
  } catch (error) { res.status(500).json({ message: error.message || 'Could not create account.' }); }
});
app.post('/api/auth/exchange', (req, res) => {
  const code = String(req.body?.code || ''); const entry = loginCodes.get(code); loginCodes.delete(code);
  if (!entry || entry.expiresAt < Date.now()) return res.status(401).json({ message: 'The sign-in completion code has expired. Please try again.' });
  res.json({ token: entry.token, user: entry.user });
});
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {}; const user = await findUserByEmail(email);
  if (!user?.passwordHash || !(await bcrypt.compare(password || '', user.passwordHash))) return res.status(401).json({ message: 'Email or password is incorrect.' });
  res.json({ token: signToken(user), user: safeUser(user) });
});
app.post('/api/auth/mock', (_req, res) => {
  const user = { _id: 'mock-workspace', name: 'Demo Workspace', email: 'demo@nexora.local', role: 'administrator' };
  res.json({ token: signToken(user, 'mock'), user: { ...safeUser(user), mode: 'mock', githubConnected: false } });
});
app.get('/api/auth/me', auth, async (req, res) => {
  if (req.isMock) return res.json({ user: { id: req.ownerId, name: 'Demo Workspace', email: 'demo@nexora.local', role: 'administrator', githubConnected: false }, mode: 'mock' });
  const user = await findUserById(req.ownerId); if (!user) return res.status(404).json({ message: 'Account not found.' });
  res.json({ user: safeUser(user), mode: 'account' });
});

// Google OAuth sign-in.
app.get('/api/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return res.status(503).send('Google sign-in is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to server/.env.');
  const state = createState({ provider: 'google' });
  const params = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: process.env.GOOGLE_CALLBACK_URL || `http://localhost:${port}/api/auth/google/callback`, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});
app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query; const oauth = consumeState(state);
    if (error || !code || !oauth || oauth.provider !== 'google') throw new Error('Google sign-in was cancelled or the state expired.');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: process.env.GOOGLE_CALLBACK_URL || `http://localhost:${port}/api/auth/google/callback`, grant_type: 'authorization_code' }) });
    const tokenData = await tokenResponse.json(); if (!tokenResponse.ok) throw new Error(tokenData.error_description || 'Could not exchange Google code.');
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const profile = await profileResponse.json(); if (!profileResponse.ok || !profile.email || profile.email_verified !== true) throw new Error('Google did not return a verified email address.');
    let user = await findUserByGoogleId(profile.sub) || await findUserByEmail(profile.email);
    if (!user) user = await createUser({ name: profile.name || profile.email.split('@')[0], email: profile.email.toLowerCase(), googleId: profile.sub, authProviders: ['google'], role: 'administrator' });
    else user = await updateUser(user._id, { googleId: profile.sub, authProviders: [...new Set([...(user.authProviders || []), 'google'])] });
    const token = signToken(user); const ticket = crypto.randomBytes(24).toString('hex');
    loginCodes.set(ticket, { token, user: safeUser(user), expiresAt: Date.now() + 60_000 });
    res.redirect(`${clientOrigin}/auth/complete?code=${encodeURIComponent(ticket)}`);
  } catch (error) { res.redirect(`${clientOrigin}/?authError=${encodeURIComponent(error.message)}`); }
});

// GitHub OAuth is available only to real signed-in accounts, never to mock mode.
app.post('/api/github/connect/start', auth, realAccountOnly, async (req, res) => {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) return res.status(503).json({ message: 'GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to server/.env.' });
  const state = createState({ provider: 'github', userId: req.ownerId });
  const params = new URLSearchParams({ client_id: process.env.GITHUB_CLIENT_ID, redirect_uri: process.env.GITHUB_CALLBACK_URL || `http://localhost:${port}/api/github/callback`, scope: 'read:user user:email repo', state });
  res.json({ authorizationUrl: `https://github.com/login/oauth/authorize?${params}` });
});
app.get('/api/github/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query; const oauth = consumeState(state);
    if (error || !code || !oauth || oauth.provider !== 'github') throw new Error('GitHub connection was cancelled or the state expired.');
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code, redirect_uri: process.env.GITHUB_CALLBACK_URL || `http://localhost:${port}/api/github/callback` }) });
    const tokenData = await tokenResponse.json(); if (!tokenResponse.ok || !tokenData.access_token) throw new Error(tokenData.error_description || 'GitHub token exchange failed.');
    const profile = await (await githubFetch('/user', tokenData.access_token)).json();
    const linkedUser = await findUserById(oauth.userId);
    if (!linkedUser) throw new Error('The NEXORA account no longer exists. Sign in again and reconnect GitHub.');
    await updateUser(oauth.userId, { githubLogin: profile.login, githubTokenEncrypted: encryptSecret(tokenData.access_token), githubConnectedAt: new Date(), authProviders: [...new Set([...(linkedUser.authProviders || []), 'github'])] });
    res.redirect(`${clientOrigin}/?github=connected`);
  } catch (error) { res.redirect(`${clientOrigin}/?githubError=${encodeURIComponent(error.message)}`); }
});
app.get('/api/github/status', auth, realAccountOnly, async (req, res) => {
  const user = await findUserById(req.ownerId); res.json({ connected: Boolean(user?.githubTokenEncrypted), login: user?.githubLogin || null });
});
app.get('/api/github/repos', auth, realAccountOnly, async (req, res) => {
  try {
    const user = await findUserById(req.ownerId); const token = await getGithubToken(user);
    const allRepos = []; let page = 1;
    // GitHub returns at most 100 repositories per page. Continue until there are no more.
    // This avoids silently hiding repositories for accounts with more than 1,000 accessible repositories.
    while (true) {
      const response = await githubFetch(`/user/repos?per_page=100&page=${page}&sort=updated&direction=desc&affiliation=owner%2Ccollaborator%2Corganization_member`, token);
      const batch = await response.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      allRepos.push(...batch);
      if (batch.length < 100) break;
      page += 1;
    }
    res.json({ repositories: allRepos.map(r => ({ id: r.id, name: r.name, fullName: r.full_name, description: r.description, private: r.private, htmlUrl: r.html_url, language: r.language, stars: r.stargazers_count, forks: r.forks_count, updatedAt: r.updated_at, defaultBranch: r.default_branch, archived: r.archived })), count: allRepos.length, truncated: false });
  } catch (error) { res.status(error.status || 400).json({ message: error.message }); }
});
app.post('/api/github/disconnect', auth, realAccountOnly, async (req, res) => { await updateUser(req.ownerId, { githubLogin: null, githubTokenEncrypted: null, githubConnectedAt: null }); res.json({ ok: true }); });

// Repository pass-on report: GitHub data + OpenAI structured analysis, scoped to the signed-in account.
app.post('/api/github/report', auth, realAccountOnly, async (req, res) => {
  try {
    const fullName = String(req.body?.fullName || '');
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) return res.status(400).json({ message: 'Choose a repository from your connected GitHub account.' });
    const user = await findUserById(req.ownerId); const token = await getGithubToken(user);
    const repo = await (await githubFetch(`/repos/${fullName}`, token)).json();
    const [readmeResponse, commitsResponse, issuesResponse, prsResponse, branchesResponse, contributorsResponse, languagesResponse] = await Promise.all([
      githubFetch(`/repos/${fullName}/readme`, token, 'application/vnd.github.raw+json').catch(() => null),
      githubFetch(`/repos/${fullName}/commits?per_page=25`, token).catch(() => null),
      githubFetch(`/repos/${fullName}/issues?state=open&per_page=25`, token).catch(() => null),
      githubFetch(`/repos/${fullName}/pulls?state=open&per_page=25`, token).catch(() => null),
      githubFetch(`/repos/${fullName}/branches?per_page=50`, token).catch(() => null),
      githubFetch(`/repos/${fullName}/contributors?per_page=25`, token).catch(() => null),
      githubFetch(`/repos/${fullName}/languages`, token).catch(() => null)
    ]);
    let readme = readmeResponse ? await readmeResponse.text() : '';
    if (readme.startsWith('{')) { try { const parsed = JSON.parse(readme); readme = Buffer.from(parsed.content || '', 'base64').toString('utf8'); } catch {} }
    const [commits, issues, prs, branches, contributors, languages] = await Promise.all([commitsResponse, issuesResponse, prsResponse, branchesResponse, contributorsResponse, languagesResponse].map(async r => r ? r.json() : []));
    const system = `You are NEXORA, an evidence-first software project continuity analyst. Create a practical pass-on report for an incoming developer. Use ONLY supplied GitHub evidence. Do not invent undocumented architecture, owners, decisions, deployment details, secrets, or dates. Clearly label unknowns and recommendations. Return JSON with keys executiveSummary, projectPurpose, architectureAndTechnology (array), setup (array), recentActivity (array), openWork (array), pullRequests (array), ownershipAndContributors (array), decisionsAndConventions (array), risksAndKnowledgeGaps (array), recommendedNextSteps (array), sourceEvidence (array of {source,detail,url}), and limitation. Cite evidence item labels in findings where useful.`;
    const evidence = { repository: { full_name: repo.full_name, description: repo.description, html_url: repo.html_url, private: repo.private, language: repo.language, default_branch: repo.default_branch, created_at: repo.created_at, updated_at: repo.updated_at, archived: repo.archived, topics: repo.topics, license: repo.license?.spdx_id }, readme: readme.slice(0, 12000), languages, commits: commits.slice(0, 25).map(c => ({ sha: c.sha?.slice(0, 8), message: c.commit?.message, date: c.commit?.author?.date, author: c.author?.login || c.commit?.author?.name, url: c.html_url })), openIssues: issues.filter(i => !i.pull_request).map(i => ({ number: i.number, title: i.title, body: i.body?.slice(0, 700), user: i.user?.login, url: i.html_url, created_at: i.created_at })), openPullRequests: prs.map(p => ({ number: p.number, title: p.title, body: p.body?.slice(0, 700), user: p.user?.login, url: p.html_url, updated_at: p.updated_at })), branches: branches.map(b => ({ name: b.name, protected: b.protected })), contributors: contributors.map(c => ({ login: c.login, contributions: c.contributions, url: c.html_url })) };
    const stringArray = { type: 'array', items: { type: 'string' } };
    const reportSchema = { type: 'object', additionalProperties: false, properties: {
      executiveSummary: { type: 'string' }, projectPurpose: { type: 'string' }, architectureAndTechnology: stringArray,
      setup: stringArray, recentActivity: stringArray, openWork: stringArray, pullRequests: stringArray,
      ownershipAndContributors: stringArray, decisionsAndConventions: stringArray, risksAndKnowledgeGaps: stringArray,
      recommendedNextSteps: stringArray,
      sourceEvidence: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { source: { type: 'string' }, detail: { type: 'string' }, url: { type: 'string' } }, required: ['source', 'detail', 'url'] } },
      limitation: { type: 'string' }
    }, required: ['executiveSummary','projectPurpose','architectureAndTechnology','setup','recentActivity','openWork','pullRequests','ownershipAndContributors','decisionsAndConventions','risksAndKnowledgeGaps','recommendedNextSteps','sourceEvidence','limitation'] };
    let report = null; let aiProvider = 'Deterministic GitHub evidence summary';
    if (process.env.OPENAI_API_KEY) {
      try { report = await openaiJson(system, JSON.stringify(evidence), 'nexora_pass_on_report', reportSchema); aiProvider = process.env.OPENAI_MODEL || 'gpt-4o-mini'; }
      catch (error) { console.error('OpenAI report generation failed:', error.message); }
    }
    if (!report) report = fallbackReport(repo, readme, languages, commits, issues, prs, branches, contributors);
    report.aiProvider = aiProvider; report.generatedAt = new Date().toISOString(); report.repository = { fullName: repo.full_name, url: repo.html_url, private: repo.private, defaultBranch: repo.default_branch, primaryLanguage: repo.language };
    const saved = await insertOwned('reports', req.ownerId, { repoFullName: repo.full_name, repoUrl: repo.html_url, title: `${repo.name} — Pass-on report`, summary: report.executiveSummary, report, createdBy: user.email, status: 'pending_review' });
    res.status(201).json(saved);
  } catch (error) { res.status(error.status || 500).json({ message: error.message || 'Could not generate the repository report.' }); }
});

app.get('/api/workspace', auth, async (req, res) => {
  const [projects, reports, sources, risks] = await Promise.all(['projects','reports','sources','risks'].map(c => listOwned(c, req.ownerId)));
  const user = req.isMock ? { id: 'mock-workspace', name: 'Demo Workspace', email: 'demo@nexora.local', role: 'administrator', githubConnected: false } : safeUser(await findUserById(req.ownerId));
  res.json({ user, mode: req.isMock ? 'mock' : 'account', storage: storageMode(req.ownerId), projects, reports, sources, risks: risks.filter(r => !r.resolved), ai: { provider: process.env.OPENAI_API_KEY ? 'OpenAI API' : 'Structured evidence fallback', model: process.env.OPENAI_MODEL || 'gpt-4o-mini', configured: Boolean(process.env.OPENAI_API_KEY) }, features: { github: !req.isMock } });
});
app.post('/api/projects', auth, async (req, res) => {
  if (!req.body?.name?.trim()) return res.status(400).json({ message: 'Project name is required.' });
  const project = await insertOwned('projects', req.ownerId, { name: req.body.name.trim(), description: req.body.description || '', status: 'active' }); res.status(201).json(project);
});
app.patch('/api/projects/:id', auth, async (req, res) => {
  const project = await updateOwned('projects', req.params.id, req.ownerId, { name: req.body.name, description: req.body.description });
  if (!project) return res.status(404).json({ message: 'Project not found in this account.' }); res.json(project);
});
app.delete('/api/projects/:id', auth, async (req, res) => { const removed = await deleteOwned('projects', req.params.id, req.ownerId); if (!removed) return res.status(404).json({ message: 'Project not found.' }); res.json({ ok: true }); });
app.get('/api/reports', auth, async (req, res) => res.json(await listOwned('reports', req.ownerId)));
app.get('/api/reports/:id', auth, async (req, res) => { const report = await findOwned('reports', req.params.id, req.ownerId); if (!report) return res.status(404).json({ message: 'Report not found.' }); res.json(report); });
app.patch('/api/reports/:id/approve', auth, async (req, res) => { const report = await updateOwned('reports', req.params.id, req.ownerId, { status: 'approved', reviewedBy: req.auth.name, reviewedAt: new Date().toISOString() }); if (!report) return res.status(404).json({ message: 'Report not found in this account.' }); res.json(report); });
app.get('/api/sources', auth, async (req, res) => res.json(await listOwned('sources', req.ownerId)));
app.post('/api/sources', auth, async (req, res) => { const { name, content } = req.body || {}; if (!name || !content) return res.status(400).json({ message: 'Source name and content are required.' }); const source = await insertOwned('sources', req.ownerId, { name, content: String(content).slice(0, 50000), summary: String(content).slice(0, 240), type: 'Text note' }); res.status(201).json(source); });
app.post('/api/risks/scan', auth, async (req, res) => {
  const [sources, projects, existing] = await Promise.all(['sources','projects','risks'].map(c => listOwned(c, req.ownerId)));
  const created = [];
  for (const project of projects) {
    if (!sources.some(s => s.projectId === project._id) && !existing.some(r => r.projectId === project._id && !r.resolved)) {
      created.push(await insertOwned('risks', req.ownerId, { projectId: project._id, title: `No source material connected: ${project.name}`, description: 'This project has no ingested knowledge source. Add authorised project documents or generate a repository pass-on report.', severity: 'medium', resolved: false }));
    }
  }
  res.json({ created: created.length, risks: await listOwned('risks', req.ownerId) });
});
app.post('/api/ai/ask', auth, async (req, res) => {
  const question = String(req.body?.question || '').trim(); if (!question) return res.status(400).json({ message: 'Enter a question.' });
  const [sources, reports] = await Promise.all([listOwned('sources', req.ownerId), listOwned('reports', req.ownerId)]);
  const terms = question.toLowerCase().split(/\W+/).filter(t => t.length > 2);
  const pool = [...sources.map(s => ({ label: s.name, text: s.content || s.summary || '' })), ...reports.map(r => ({ label: r.title, text: JSON.stringify(r.report || {}) }))];
  const evidence = pool.map(p => ({ ...p, score: terms.reduce((score,t) => score + (p.text.toLowerCase().includes(t) || p.label.toLowerCase().includes(t) ? 1 : 0), 0) })).sort((a,b) => b.score-a.score).filter(p=>p.score>0).slice(0,5);
  let answer = 'I could not find direct supporting evidence in this account yet. Connect a GitHub repository or add project documentation, then ask again.';
  if (process.env.OPENAI_API_KEY && evidence.length) {
    try {
      const assistantSchema = { type: 'object', additionalProperties: false, properties: { answer: { type: 'string' }, sources: { type: 'array', items: { type: 'string' } } }, required: ['answer','sources'] };
      const generated = await openaiJson('You are NEXORA, an evidence-first project knowledge assistant. Answer only from provided evidence. Clearly separate facts, unknowns and recommendations. Cite the provided source labels. Return a JSON object with answer and sources.', JSON.stringify({ question, evidence }), 'nexora_grounded_answer', assistantSchema);
      answer = generated.answer || answer; return res.json({ answer, sources: generated.sources || evidence.map(e=>e.label), grounded: true, provider: process.env.OPENAI_MODEL || 'gpt-4o-mini' });
    }
    catch (error) { console.error('AI Q&A failed:', error.message); }
  }
  if (evidence.length) answer = `${evidence.map(e => `From ${e.label}: ${e.text.slice(0, 900)}`).join('\n\n')}\n\nThis is a source excerpt, not a verified conclusion. ${process.env.OPENAI_API_KEY ? 'OpenAI was unavailable for this request.' : 'Add OPENAI_API_KEY to enable AI synthesis.'}`;
  res.json({ answer, sources: evidence.map(e=>e.label), grounded: evidence.length > 0, provider: 'Evidence retrieval fallback' });
});

app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ message: process.env.NODE_ENV === 'production' ? 'An unexpected server error occurred.' : error.message || 'Server error.' }); });

await initStore();
app.listen(port, () => console.log(`NEXORA API listening at http://localhost:${port} (${storageMode()})`));

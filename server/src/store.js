import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Resolve server/.env relative to this file, not process.cwd(). This keeps the
// MongoDB setting reliable whether NEXORA is launched from the repo root,
// VS Code, or a hosting provider's configured working directory.
const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(SERVER_DIR, '.env') });

const filePath = path.join(SERVER_DIR, 'data', 'nexora-db.json');
const mockFilePath = path.join(SERVER_DIR, 'data', 'nexora-mock-db.json');
let fileDb = null;
let mockDb = null;
let mongoReady = false;

const schemas = {
  User: new mongoose.Schema({
    name: String, email: { type: String, unique: true, sparse: true }, passwordHash: String,
    googleId: String, githubLogin: String, githubTokenEncrypted: String, githubConnectedAt: Date,
    authProviders: [String], role: { type: String, default: 'member' }
  }, { timestamps: true }),
  Project: new mongoose.Schema({ ownerId: { type: String, index: true }, name: String, description: String, status: String }, { timestamps: true }),
  Report: new mongoose.Schema({ ownerId: { type: String, index: true }, repoFullName: String, repoUrl: String, title: String, summary: String, report: mongoose.Schema.Types.Mixed, createdBy: String, status: { type: String, default: 'pending_review' }, reviewedBy: String, reviewedAt: Date }, { timestamps: true }),
  Source: new mongoose.Schema({ ownerId: { type: String, index: true }, projectId: String, name: String, type: String, summary: String, content: String, sourceUrl: String }, { timestamps: true }),
  Risk: new mongoose.Schema({ ownerId: { type: String, index: true }, projectId: String, title: String, description: String, severity: String, resolved: Boolean }, { timestamps: true })
};
const models = Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, mongoose.models[name] || mongoose.model(name, schema)]));

function demoSeed() {
  const now = new Date().toISOString();
  return {
    users: [],
    projects: [
      { _id: 'mock-project-nexora', ownerId: 'mock-workspace', name: 'NEXORA Knowledge Engine', description: 'An evidence-backed knowledge continuity workspace. This is demonstration content, not connected to GitHub.', status: 'active', createdAt: now },
      { _id: 'mock-project-platform', ownerId: 'mock-workspace', name: 'Platform Foundations', description: 'Sample architecture, onboarding and operational knowledge.', status: 'active', createdAt: now }
    ],
    reports: [
      { _id: 'mock-report-1', ownerId: 'mock-workspace', repoFullName: 'demo/nexora-sample', repoUrl: 'https://github.com/demo/nexora-sample', title: 'Sample repository pass-on report', summary: 'A demonstration handover report created from mock information.', status: 'pending_review', report: { executiveSummary: 'This is a simulated repository handover. No GitHub account or live repository was accessed.', projectPurpose: 'A sample service used to demonstrate how NEXORA preserves repository context for an incoming developer.', architectureAndTechnology: ['React frontend for the workspace experience.', 'Node.js and Express API for account-scoped operations.', 'MongoDB is an optional storage choice for real accounts; mock data remains separate.'], setup: ['Install the project dependencies.', 'Copy the example environment files and configure local secrets.', 'Start the development servers and verify the health endpoint.'], recentActivity: ['Mock fixture: initial workspace scaffolding was added.'], openWork: ['Confirm deployment ownership and environment variables.'], pullRequests: ['No live pull request information is available in mock mode.'], ownershipAndContributors: ['Maintainer ownership is intentionally marked as unknown in this fixture.'], decisionsAndConventions: ['Keep important technical claims linked to their source evidence.', 'Require a human review before sharing a pass-on report.'], risksAndKnowledgeGaps: ['Deployment ownership needs confirmation.', 'The sample fixture contains no live issue or commit history.'], recommendedNextSteps: ['Verify the production environment and operational runbook.', 'Review open work with the project maintainer.', 'Record unresolved decisions in project memory.'], sourceEvidence: [{ source: 'Mock fixture', detail: 'Sample data bundled with NEXORA. No GitHub account or repository was accessed.', url: 'https://github.com/' }], limitation: 'Demonstration-only report. It is not generated from a real repository.', aiProvider: 'NEXORA Mock Data' }, createdAt: now }
    ],
    sources: [],
    risks: [
      { _id: 'mock-risk-1', ownerId: 'mock-workspace', title: 'Deployment runbook needs verification', description: 'Sample risk: confirm environment variables, backup and recovery steps.', severity: 'medium', resolved: false, createdAt: now }
    ]
  };
}

async function persistTo(target, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const tempPath = `${destination}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(target, null, 2), 'utf8');
  await fs.rename(tempPath, destination);
}
async function persist() { return persistTo(fileDb, filePath); }
async function persistMock() { return persistTo(mockDb, mockFilePath); }
function isMockOwner(ownerId) { return String(ownerId) === 'mock-workspace'; }

export async function initStore() {
  const mongoUri = process.env.MONGO_URI?.trim();
  if (mongoUri) {
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 12000 });
      mongoReady = true;
      console.log(`NEXORA connected to MongoDB for real accounts (database: ${mongoose.connection.name})`);
    } catch (error) {
      mongoReady = false;
      console.error('NEXORA could not connect to MongoDB. Check server/.env, Atlas IP access, database user/password, and URI encoding.');
      throw new Error(`MongoDB connection failed: ${error.message}`);
    }
  } else {
    try { fileDb = JSON.parse(await fs.readFile(filePath, 'utf8')); }
    catch { fileDb = { users: [], projects: [], reports: [], sources: [], risks: [] }; await persist(); }
    for (const key of ['users', 'projects', 'reports', 'sources', 'risks']) fileDb[key] ||= [];
    console.log('NEXORA using persistent local JSON storage for real accounts');
  }
  // Keep demonstration data isolated from real account storage, even when MongoDB is enabled.
  try { mockDb = JSON.parse(await fs.readFile(mockFilePath, 'utf8')); }
  catch { mockDb = demoSeed(); await persistMock(); }
  for (const key of ['users', 'projects', 'reports', 'sources', 'risks']) mockDb[key] ||= [];
}

export function storageMode(ownerId = null) {
  if (isMockOwner(ownerId)) return 'mock-json';
  return mongoReady && mongoose.connection.readyState === 1 ? 'mongodb' : 'local-json';
}

export async function findUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (mongoReady) return models.User.findOne({ email: normalized }).lean();
  return fileDb.users.find(u => u.email?.toLowerCase() === normalized) || null;
}
export async function findUserByGoogleId(googleId) {
  if (mongoReady) return models.User.findOne({ googleId }).lean();
  return fileDb.users.find(u => u.googleId === googleId) || null;
}
export async function findUserById(id) {
  if (mongoReady) return models.User.findById(id).lean();
  return fileDb.users.find(u => u._id === id) || null;
}
export async function createUser(user) {
  if (mongoReady) return (await models.User.create(user)).toObject();
  const item = { _id: `user-${cryptoRandom()}`, createdAt: new Date().toISOString(), ...user };
  fileDb.users.push(item); await persist(); return item;
}
export async function updateUser(id, patch) {
  if (mongoReady) return models.User.findByIdAndUpdate(id, patch, { new: true }).lean();
  const item = fileDb.users.find(u => u._id === id); if (!item) return null;
  Object.assign(item, patch, { updatedAt: new Date().toISOString() }); await persist(); return item;
}
function cryptoRandom() { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`; }

const collectionModels = { projects: 'Project', reports: 'Report', sources: 'Source', risks: 'Risk' };
export async function listOwned(collection, ownerId) {
  const modelName = collectionModels[collection]; if (!modelName) throw new Error('Unknown collection');
  if (isMockOwner(ownerId)) return mockDb[collection].filter(item => item.ownerId === ownerId).sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  if (mongoReady) return models[modelName].find({ ownerId }).sort({ createdAt: -1 }).lean();
  return fileDb[collection].filter(item => item.ownerId === ownerId).sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}
export async function insertOwned(collection, ownerId, payload) {
  const modelName = collectionModels[collection]; if (!modelName) throw new Error('Unknown collection');
  const doc = { ...payload, ownerId };
  if (isMockOwner(ownerId)) {
    const item = { _id: `${collection.slice(0,-1)}-${cryptoRandom()}`, createdAt: new Date().toISOString(), ...doc };
    mockDb[collection].unshift(item); await persistMock(); return item;
  }
  if (mongoReady) return (await models[modelName].create(doc)).toObject();
  const item = { _id: `${collection.slice(0,-1)}-${cryptoRandom()}`, createdAt: new Date().toISOString(), ...doc };
  fileDb[collection].unshift(item); await persist(); return item;
}
export async function findOwned(collection, id, ownerId) {
  const modelName = collectionModels[collection]; if (!modelName) throw new Error('Unknown collection');
  if (isMockOwner(ownerId)) return mockDb[collection].find(item => item._id === id && item.ownerId === ownerId) || null;
  if (mongoReady) return models[modelName].findOne({ _id: id, ownerId }).lean();
  return fileDb[collection].find(item => item._id === id && item.ownerId === ownerId) || null;
}
export async function updateOwned(collection, id, ownerId, patch) {
  const modelName = collectionModels[collection]; if (!modelName) throw new Error('Unknown collection');
  const target = isMockOwner(ownerId) ? mockDb : fileDb;
  if (!isMockOwner(ownerId) && mongoReady) return models[modelName].findOneAndUpdate({ _id: id, ownerId }, patch, { new: true }).lean();
  const item = target[collection].find(x => x._id === id && x.ownerId === ownerId); if (!item) return null;
  Object.assign(item, patch, { updatedAt: new Date().toISOString() });
  if (isMockOwner(ownerId)) await persistMock(); else await persist();
  return item;
}
export async function deleteOwned(collection, id, ownerId) {
  const modelName = collectionModels[collection]; if (!modelName) throw new Error('Unknown collection');
  if (!isMockOwner(ownerId) && mongoReady) return models[modelName].findOneAndDelete({ _id: id, ownerId }).lean();
  const target = isMockOwner(ownerId) ? mockDb : fileDb;
  const index = target[collection].findIndex(x => x._id === id && x.ownerId === ownerId);
  if (index < 0) return null; const [removed] = target[collection].splice(index, 1);
  if (isMockOwner(ownerId)) await persistMock(); else await persist();
  return removed;
}

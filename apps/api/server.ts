import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';
import { resetDbForTesting, getDb } from '../../modules/common/db.js';
import { processUnprocessedOutboxEvents, emitOutboxEvent } from '../../modules/common/outbox.js';
import { generateQRCredential, verifyQRCredentialOffline, processCheckInSync, getServerPublicKeyPem } from '../../modules/attendance/index.js';
import { handleAssistantQuery } from '../../intelligence/assistant/index.js';
import { submitJudgeScore } from '../../modules/judging/index.js';
import { rebuildLeaderboardProjection, getLeaderboardSnapshot, getUserLeaderboardSnapshot } from '../../modules/ranking/index.js';
import { getAllVenues } from '../../modules/venues/index.js';
import { computeTeamCompatibility, computeSimulationOutcome } from '../../intelligence/rules/index.js';
import { realtimeServer } from '../../realtime/index.js';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {
  verifyFirebaseToken,
  linkFirebaseAccount,
  checkHandleAvailability,
  saveOnboardingStep,
  getFullProfile,
  filterProfileVisibility,
  validateAndStoreResume,
  parseResumeSuggestions,
  getStreakInfo,
  getUserPointsTotal,
  getUserBadges,
  getGlobalUserRank,
  syncUserProfile,
} from '../../modules/profile/index.js';
import {
  getPersonalizedFeed,
  searchOpportunities,
  checkRateLimit,
  getOpportunityById,
  registerForOpportunity,
  getUserRegistrationStatus,
} from '../../modules/discovery/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security & Middleware Configuration
app.use(helmet({
  contentSecurityPolicy: false, // Allowed for Vite dev & inline assets
}));
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

// Global API Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests from this IP, please try again later.' },
});

// Platform Lightweight Stats Endpoint
app.get('/api/stats', (req, res) => {
  try {
    const db = getDb();
    const usersCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any)?.count || 0;
    const oppsCount = (db.prepare('SELECT COUNT(*) as count FROM opportunities').get() as any)?.count || 0;
    const eventsCount = (db.prepare('SELECT COUNT(*) as count FROM events').get() as any)?.count || 0;

    res.json({
      total_users: usersCount,
      total_opportunities: oppsCount,
      active_events: eventsCount,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Single Opportunity Details
app.get('/api/opportunities/:id', (req, res) => {
  const opp = getOpportunityById(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
  res.json(opp);
});

// Register for Opportunity Endpoint
app.post('/api/opportunities/:id/register', requireAuth, (req: any, res) => {
  try {
    const userId = req.user.uid;
    const opportunityId = req.params.id;

    const opp = getOpportunityById(opportunityId);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });

    const result = registerForOpportunity(opportunityId, userId);

    // Emit real outbox audit event
    emitOutboxEvent('OPPORTUNITY_REGISTERED', {
      opportunity_id: opportunityId,
      opportunity_title: opp.title,
      user_id: userId,
      user_email: req.user.email,
      timestamp: new Date().toISOString(),
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Check Registration Status
app.get('/api/opportunities/:id/registration-status', (req, res) => {
  let userId = (req.query.userId as string) || '';
  const authHeader = req.headers.authorization;

  if (!userId && authHeader) {
    try {
      const clean = authHeader.replace(/^Bearer\s+/i, '').trim();
      const parts = clean.split('.');
      if (parts.length === 3) {
        const parsed = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        userId = parsed.sub || parsed.user_id || parsed.uid || '';
      } else {
        userId = clean;
      }
    } catch (e) {}
  }

  const isRegistered = getUserRegistrationStatus(req.params.id, userId);
  res.json({ registered: isRegistered });
});

// --------------------------------------------------------------------------
// DISCOVERY FEED & SEARCH (Personalized & Rate Limited)
// --------------------------------------------------------------------------
app.get('/api/discovery/feed', (req, res) => {
  try {
    const userId = (req.query.userId as string) || (req.headers['x-user-id'] as string) || '';
    const category = (req.query.category as string) || 'ALL';
    const feed = getPersonalizedFeed(userId, category);
    res.json(feed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/discovery/search', (req, res) => {
  try {
    const clientIdentifier = (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';
    const q = (req.query.q as string) || '';
    const category = (req.query.category as string) || 'ALL';
    const mode = (req.query.mode as string) || 'ALL';

    const results = searchOpportunities(clientIdentifier, q, category, mode);
    res.json(results);
  } catch (err: any) {
    res.status(err.message.includes('429') ? 429 : 500).json({ error: err.message });
  }
});

app.use('/api/', apiLimiter);

// Express Request Extension for Authenticated User Session
export interface AuthRequest extends express.Request {
  user?: {
    uid: string;
    email: string;
    email_verified: boolean;
    user_id: string;
    role: string;
    profile_completed: boolean;
  };
}

// Server Authentication Middleware
export async function requireAuth(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader) {
      return res.status(401).json({ error: '401 Unauthorized: Authorization Bearer token is required' });
    }
    const userSession = await verifyFirebaseToken(authHeader);
    req.user = userSession;
    next();
  } catch (err: any) {
    return res.status(401).json({ error: err.message || '401 Unauthorized' });
  }
}

// Initialize SQLite database only in non-production or for testing
if (process.env.NODE_ENV !== 'production') {
  resetDbForTesting();
}

// Health Endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', product: 'EVENTOS v4 — An Intelligent Operating System for Live Events', version: '4.0.0' });
});

// Event Discovery List
app.get('/api/events', (req, res) => {
  const db = getDb();
  const events = db.prepare(`
    SELECT e.*, o.name as org_name, o.verified as org_verified, o.logo_url as org_logo
    FROM events e
    JOIN organizations o ON o.id = e.org_id
    ORDER BY e.start_date ASC
  `).all();
  res.json(events);
});

// Event Details
app.get('/api/events/:slug', (req, res) => {
  const db = getDb();
  const event = db.prepare(`
    SELECT e.*, o.name as org_name, o.verified as org_verified, o.logo_url as org_logo
    FROM events e
    JOIN organizations o ON o.id = e.org_id
    WHERE e.slug = ? OR e.id = ?
  `).get(req.params.slug, req.params.slug) as any;

  if (!event) return res.status(404).json({ error: 'Event not found' });

  const challenges = db.prepare('SELECT * FROM challenges WHERE event_id = ?').all(event.id);
  const sessions = db.prepare('SELECT s.*, v.name as venue_name FROM sessions s JOIN venues v ON v.id = s.venue_id WHERE s.event_id = ?').all(event.id);
  const judges = db.prepare("SELECT id, name, skills_json FROM users WHERE role = 'JUDGE'").all();

  res.json({ event, challenges, sessions, judges });
});

// Organizations List
app.get('/api/organizations', (req, res) => {
  const db = getDb();
  const orgs = db.prepare('SELECT * FROM organizations ORDER BY name ASC').all();
  res.json(orgs);
});

// People Discovery List
app.get('/api/people', (req, res) => {
  const db = getDb();
  const people = db.prepare(`
    SELECT u.id, u.name, u.role, u.skills_json, p.username, p.college, p.academic_year, p.location, p.tagline
    FROM users u
    LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE u.role = 'PARTICIPANT'
  `).all();
  res.json(people);
});

// Developer Profile Endpoint (v1 backward compatible + v2 rich profile with server-side visibility filtering)
app.get('/api/profile/:username', async (req, res) => {
  try {
    const clientIp = req.ip || '127.0.0.1';
    checkRateLimit(clientIp, 60);

    const full = getFullProfile(req.params.username);
    if (!full) return res.status(404).json({ error: 'Profile not found' });

    let relationship: 'owner' | 'organizer' | 'public' = 'public';

    // Verify token if Authorization header is supplied
    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        const verified = await verifyFirebaseToken(authHeader);
        if (verified.uid === full.user_id) relationship = 'owner';
        else if (verified.role === 'ORGANIZER') relationship = 'organizer';
      } catch (e) {}
    }

    const visibleProfile = filterProfileVisibility(full, relationship);
    res.json(visibleProfile);
  } catch (err: any) {
    res.status(err.message.includes('429') ? 429 : 500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// AUTHENTICATION (Firebase Auth Server Verification & Sync)
// --------------------------------------------------------------------------
app.post('/api/auth/verify-token', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || req.body.idToken || '';
    const verified = await verifyFirebaseToken(authHeader);
    res.json(verified);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

app.post('/api/auth/sync-profile', requireAuth, (req: any, res) => {
  try {
    const user = req.user;
    const { name, photoUrl } = req.body;
    const sync = syncUserProfile(user.uid, user.email, name, photoUrl, user.role);
    res.json(sync);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/link-account', (req, res) => {
  try {
    const { email, newProvider } = req.body;
    const result = linkFirebaseAccount(email, newProvider);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// ONBOARDING WIZARD & HANDLE CHECK
// --------------------------------------------------------------------------
app.get('/api/onboarding/check-handle', (req, res) => {
  const handle = (req.query.handle as string) || '';
  const userId = (req.query.userId as string) || '';
  const available = checkHandleAvailability(handle, userId);
  res.json({ handle, available });
});

app.post('/api/onboarding/step', requireAuth, (req: any, res) => {
  try {
    const userId = req.user.uid;
    const { step, payload } = req.body;
    if (!step) return res.status(400).json({ error: 'Missing step parameter' });

    const result = saveOnboardingStep(userId, step, payload);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});


// --------------------------------------------------------------------------
// RESUME UPLOADS & SIGNED URLS
// --------------------------------------------------------------------------
app.post('/api/profile/resume', (req, res) => {
  try {
    const { userId, filename, fileType, sizeBytes } = req.body;
    const result = validateAndStoreResume(userId, filename || 'resume.pdf', fileType || 'application/pdf', sizeBytes || 1024 * 1024);
    const suggestions = parseResumeSuggestions(userId);
    res.json({ ...result, suggestions });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// DISCOVERY FEED & SEARCH (Personalized & Rate Limited)
// --------------------------------------------------------------------------
app.get('/api/discovery/feed', (req, res) => {
  try {
    const userId = (req.query.userId as string) || (req.headers['x-user-id'] as string) || '';
    const category = (req.query.category as string) || 'ALL';
    const feed = getPersonalizedFeed(userId, category);
    res.json(feed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/discovery/search', (req, res) => {
  try {
    const clientIdentifier = (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';
    const q = (req.query.q as string) || '';
    const category = (req.query.category as string) || 'ALL';
    const mode = (req.query.mode as string) || 'ALL';

    const results = searchOpportunities(clientIdentifier, q, category, mode);
    res.json(results);
  } catch (err: any) {
    res.status(err.message.includes('429') ? 429 : 500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// GAMIFICATION (Points Ledger, Streak, Badges & Rank)
// --------------------------------------------------------------------------
app.get('/api/gamification/leaderboard', (req, res) => {
  const leaderboard = getUserLeaderboardSnapshot();
  res.json(leaderboard);
});

app.get('/api/gamification/streak/:userId', (req, res) => {
  const streak = getStreakInfo(req.params.userId);
  const points = getUserPointsTotal(req.params.userId);
  const badges = getUserBadges(req.params.userId);
  const rank = getGlobalUserRank(req.params.userId);

  res.json({
    user_id: req.params.userId,
    points,
    global_rank: rank,
    streak,
    badges,
  });
});


// Intelligent Team Matchmaking Endpoint
app.post('/api/teams/matchmaking', (req, res) => {
  const { candidateSkills, teamSkills, challengeInterest } = req.body;
  const match = computeTeamCompatibility(
    candidateSkills || ['DevOps', 'Kubernetes', 'Cloud'],
    teamSkills || ['React', 'TypeScript', 'Node.js'],
    challengeInterest || 'Autonomous Agentic Operations'
  );
  res.json(match);
});

// Assistant Query Endpoint (User -> Auth -> Context Engine -> Decision Engine -> LLM Explanation)
app.post('/api/assistant/query', (req, res) => {
  try {
    const { userId, eventId, queryType } = req.body;
    if (!userId || !eventId || !queryType) {
      return res.status(400).json({ error: 'Missing required parameters: userId, eventId, queryType' });
    }

    const result = handleAssistantQuery(userId, eventId, queryType);
    res.json(result);
  } catch (err: any) {
    if (err.message.includes('403 Forbidden')) {
      return res.status(403).json({
        error: 'Forbidden',
        message: err.message,
        pipeline_trace: {
          auth_passed: false,
          policy_rejected: true,
          reason: 'Policy-First Authorization rejected request before Context Engine and LLM execution.',
        },
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// Anomaly Radar & Risks
app.get('/api/organizer/risks', (req, res) => {
  const db = getDb();
  const risks = db.prepare('SELECT * FROM risks WHERE event_id = ? ORDER BY created_at DESC').all('event_hack_2026');
  const actions = db.prepare('SELECT * FROM event_actions WHERE event_id = ? ORDER BY created_at DESC').all('event_hack_2026');
  res.json({ risks, actions });
});

// What-If Simulation Engine
app.post('/api/organizer/simulate', (req, res) => {
  const { scenarioType, paramValue } = req.body;
  const outcome = computeSimulationOutcome(scenarioType, paramValue);
  res.json(outcome);
});

// Action Center Approval & Execution
app.post('/api/organizer/actions/approve', (req, res) => {
  const { actionId, actorId } = req.body;
  const db = getDb();
  const now = new Date().toISOString();

  const action = db.prepare('SELECT * FROM event_actions WHERE id = ?').get(actionId) as any;
  if (!action) return res.status(404).json({ error: 'Action not found' });

  db.prepare(`
    UPDATE event_actions
    SET status = 'APPROVED', approved_by = ?, executed_at = ?
    WHERE id = ?
  `).run(actorId, now, actionId);

  // Write Audit Event
  const auditId = `aud_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO audit_events (id, event_id, actor_id, actor_name, action, target, details_json, created_at)
    VALUES (?, ?, ?, 'Marcus Vance (Organizer)', 'APPROVE_ACTION', ?, ?, ?)
  `).run(auditId, 'event_hack_2026', actorId, action.title, JSON.stringify({ action_id: actionId, status: 'APPROVED' }), now);

  emitOutboxEvent('ACTION_APPROVED', 'EventAction', actionId, actorId, {
    action_id: actionId,
    title: action.title,
    approved_by: actorId,
  });

  res.json({ success: true, message: `Action '${action.title}' approved and executed successfully. Audit event ${auditId} recorded.` });
});

// Targeted Announcement Dispatcher
app.post('/api/organizer/announcements', (req, res) => {
  const { title, body, audience, severity, actorId } = req.body;
  const db = getDb();
  const annId = `ann_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const count = audience === 'EVERYONE' ? 428 : 120;

  db.prepare(`
    INSERT INTO announcements (id, event_id, title, body, audience, severity, sent_by, recipient_count, sent_at)
    VALUES (?, 'event_hack_2026', ?, ?, ?, ?, ?, ?, ?)
  `).run(annId, title, body, audience, severity || 'IMPORTANT', actorId, count, now);

  // Write Audit Event
  const auditId = `aud_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO audit_events (id, event_id, actor_id, actor_name, action, target, details_json, created_at)
    VALUES (?, 'event_hack_2026', ?, 'Marcus Vance (Organizer)', 'DISPATCH_ANNOUNCEMENT', ?, ?, ?)
  `).run(auditId, actorId, title, JSON.stringify({ audience, recipient_count: count }), now);

  emitOutboxEvent('ANNOUNCEMENT_SENT', 'Announcement', annId, actorId, {
    title,
    audience,
    recipient_count: count,
  });

  res.json({ success: true, message: `Announcement dispatched to ${count} recipients.`, id: annId });
});

// Audit Log
app.get('/api/organizer/audit', (req, res) => {
  const db = getDb();
  const audit = db.prepare('SELECT * FROM audit_events WHERE event_id = ? ORDER BY created_at DESC').all('event_hack_2026');
  res.json(audit);
});

// QR Token Issuance
app.post('/api/qr/issue', (req, res) => {
  try {
    const { eventId, participantId, sessionId } = req.body;
    const cred = generateQRCredential(eventId, participantId, sessionId, 30);
    res.json(cred);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// QR Public Key
app.get('/api/qr/public-key', (req, res) => {
  res.json({ publicKeyPem: getServerPublicKeyPem() });
});

// QR Offline Verification Test
app.post('/api/qr/verify-offline', (req, res) => {
  try {
    const { signedCred } = req.body;
    const isValid = verifyQRCredentialOffline(signedCred);
    res.json({ valid: isValid });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// QR Synchronous Check-in
app.post('/api/qr/checkin', (req, res) => {
  try {
    const { signedCred, actorId } = req.body;
    const result = processCheckInSync(signedCred, actorId);
    if (!result.success) {
      return res.status(409).json(result);
    }
    
    const events = processUnprocessedOutboxEvents();
    for (const evt of events) {
      realtimeServer.broadcastToChannel(`event:${evt.payload.event_id}`, evt, evt.sequence_number);
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Judge Score Submission
app.post('/api/judging/score', (req, res) => {
  try {
    const { eventId, teamId, judgeUserId, criteriaScores, rawScore, actorId, strategy } = req.body;
    const result = submitJudgeScore(eventId, teamId, judgeUserId, criteriaScores, rawScore, actorId);
    if (!result.success) {
      return res.status(400).json(result);
    }

    const proj = rebuildLeaderboardProjection(eventId, actorId);
    realtimeServer.broadcastToChannel(`leaderboard:${eventId}`, proj.rankings, proj.sequence_number);

    res.json({ ...result, leaderboard: proj });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get Leaderboard Snapshot
app.get('/api/leaderboard/:eventId', (req, res) => {
  const snapshot = getLeaderboardSnapshot(req.params.eventId);
  res.json(snapshot);
});

// Get Venues & Congestion Metrics
app.get('/api/venues/:eventId', (req, res) => {
  const venues = getAllVenues(req.params.eventId);
  res.json(venues);
});

// Serve static production bundle from Vite build (apps/web/dist)
const distPath = path.join(__dirname, '../web/dist');
app.use(express.static(distPath));

// SPA Fallback for client-side routing
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// HTTP & WebSocket Server Setup
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
realtimeServer.init(wss);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  EVENTOS v4 — Operating System for Live Events`);
  console.log(`  Server running on port ${PORT}`);
  console.log(`  URL: http://localhost:${PORT}`);
  console.log(`====================================================`);
});

export { app, server };

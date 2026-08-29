import { getDb } from '../common/db.js';

export interface Opportunity {
  id: string;
  title: string;
  org_id: string;
  org_name: string;
  org_logo?: string;
  category: 'INTERNSHIP' | 'JOB' | 'COMPETITION' | 'MOCK_TEST' | 'MOCK_INTERVIEW' | 'HACKATHON' | 'MENTORSHIP';
  field_of_interest: string;
  work_mode: string;
  location: string;
  deadline: string;
  stipend_or_prize: string;
  description: string;
  tags: string[];
  eligibility: string[];
  responsibilities: string[];
  featured: boolean;
  relevance_score?: number;
  match_reasons?: string[];
  created_at: string;
}

// In-memory rate limiting tracker for search and profile views
const rateLimitTracker: Map<string, { count: number; resetAt: number }> = new Map();

/**
 * Checks rate limits (e.g. max 60 requests per minute per IP/userId)
 */
export function checkRateLimit(clientIpOrUserId: string, maxLimit = 60, windowMs = 60000): void {
  const now = Date.now();
  const entry = rateLimitTracker.get(clientIpOrUserId);

  if (!entry || now > entry.resetAt) {
    rateLimitTracker.set(clientIpOrUserId, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (entry.count >= maxLimit) {
    throw new Error('429 Too Many Requests: Rate limit exceeded to prevent bulk scraping.');
  }

  entry.count++;
}

/**
 * Fetch a single opportunity by ID
 */
export function getOpportunityById(id: string): Opportunity | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id) as any;
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    org_id: row.org_id,
    org_name: row.org_name,
    org_logo: row.org_logo,
    category: row.category,
    field_of_interest: row.field_of_interest,
    work_mode: row.work_mode,
    location: row.location,
    deadline: row.deadline,
    stipend_or_prize: row.stipend_or_prize,
    description: row.description,
    tags: JSON.parse(row.tags_json || '[]'),
    eligibility: JSON.parse(row.eligibility_json || '[]'),
    responsibilities: JSON.parse(row.responsibilities_json || '[]'),
    featured: Boolean(row.featured),
    created_at: row.created_at,
  };
}

/**
 * Server-side opportunity registration with duplicate safety
 */
export function registerForOpportunity(
  opportunityId: string,
  userId: string
): { success: boolean; alreadyRegistered: boolean; registration_id?: string } {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM opportunity_registrations WHERE opportunity_id = ? AND user_id = ?').get(opportunityId, userId) as any;
  if (existing) {
    return { success: true, alreadyRegistered: true, registration_id: existing.id };
  }

  const id = `reg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO opportunity_registrations (id, opportunity_id, user_id, status, created_at)
      VALUES (?, ?, ?, 'REGISTERED', ?)
    `).run(id, opportunityId, userId, now);

    return { success: true, alreadyRegistered: false, registration_id: id };
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return { success: true, alreadyRegistered: true };
    }
    throw err;
  }
}

/**
 * Check if a user is already registered for an opportunity
 */
export function getUserRegistrationStatus(opportunityId: string, userId: string): boolean {
  if (!opportunityId || !userId) return false;
  const db = getDb();
  const row = db.prepare('SELECT id FROM opportunity_registrations WHERE opportunity_id = ? AND user_id = ?').get(opportunityId, userId) as any;
  return Boolean(row);
}

/**
 * Returns personalized opportunity discovery feed ranked by user skills + goals relevance score
 */
export function getPersonalizedFeed(userId?: string, categoryFilter?: string): Opportunity[] {
  const db = getDb();
  let query = 'SELECT * FROM opportunities';
  const params: any[] = [];

  if (categoryFilter && categoryFilter !== 'ALL') {
    query += ' WHERE category = ?';
    params.push(categoryFilter.toUpperCase());
  }

  const rows = db.prepare(query).all(...params) as any[];

  // Fetch user profile signals for personalization
  let userInterest = '';
  let userSkillIds: string[] = [];

  if (userId) {
    const prof = db.prepare('SELECT career_goals_json FROM user_profiles_v2 WHERE user_id = ?').get(userId) as any;
    if (prof) {
      const goals = JSON.parse(prof.career_goals_json || '{}');
      userInterest = (goals.field_of_interest || '').toLowerCase();
    }

    const skills = db.prepare('SELECT canonical_id FROM user_canonical_skills WHERE user_id = ?').all(userId) as any[];
    userSkillIds = skills.map(s => s.canonical_id.toLowerCase());
  }

  const scored: Opportunity[] = rows.map(r => {
    const oppTags: string[] = JSON.parse(r.tags_json || '[]').map((t: string) => t.toLowerCase());
    const oppInterest = (r.field_of_interest || '').toLowerCase();

    let score = 0;
    const matchReasons: string[] = [];

    // 1. Goal / Field of Interest Match (+100 pts)
    if (userInterest && oppInterest && (userInterest.includes(oppInterest) || oppInterest.includes(userInterest))) {
      score += 100;
      matchReasons.push(`Matches your interest in ${r.field_of_interest}`);
    }

    // 2. Canonical Skill Tag Intersections (+50 pts per matching tag)
    let matchingSkillCount = 0;
    for (const skillId of userSkillIds) {
      if (oppTags.some(t => t.includes(skillId) || skillId.includes(t))) {
        matchingSkillCount++;
      }
    }

    if (matchingSkillCount > 0) {
      score += matchingSkillCount * 50;
      matchReasons.push(`Matches ${matchingSkillCount} of your verified skill tags`);
    }

    // 3. Featured Placement Bonus (+20 pts)
    if (r.featured) {
      score += 20;
    }

    return {
      id: r.id,
      title: r.title,
      org_id: r.org_id,
      org_name: r.org_name,
      org_logo: r.org_logo,
      category: r.category,
      field_of_interest: r.field_of_interest,
      work_mode: r.work_mode,
      location: r.location,
      deadline: r.deadline,
      stipend_or_prize: r.stipend_or_prize,
      description: r.description,
      tags: JSON.parse(r.tags_json || '[]'),
      eligibility: JSON.parse(r.eligibility_json || '[]'),
      responsibilities: JSON.parse(r.responsibilities_json || '[]'),
      featured: Boolean(r.featured),
      relevance_score: score,
      match_reasons: matchReasons.length > 0 ? matchReasons : ['Matching deadline and location criteria'],
      created_at: r.created_at,
    };
  });

  // Sort by relevance score DESC, featured DESC, created_at DESC
  scored.sort((a, b) => {
    if ((b.relevance_score || 0) !== (a.relevance_score || 0)) {
      return (b.relevance_score || 0) - (a.relevance_score || 0);
    }
    if (b.featured !== a.featured) {
      return b.featured ? 1 : -1;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return scored;
}

/**
 * Rate-limited full text search across title, org_name, description, tags
 */
export function searchOpportunities(
  clientIdentifier: string,
  searchTerm: string,
  categoryFilter?: string,
  workModeFilter?: string
): Opportunity[] {
  checkRateLimit(clientIdentifier, 60);

  const db = getDb();
  let query = 'SELECT * FROM opportunities WHERE 1=1';
  const params: any[] = [];

  if (searchTerm && searchTerm.trim() !== '') {
    const term = `%${searchTerm.trim().toLowerCase()}%`;
    query += ' AND (LOWER(title) LIKE ? OR LOWER(org_name) LIKE ? OR LOWER(description) LIKE ? OR LOWER(tags_json) LIKE ?)';
    params.push(term, term, term, term);
  }

  if (categoryFilter && categoryFilter !== 'ALL') {
    query += ' AND category = ?';
    params.push(categoryFilter.toUpperCase());
  }

  if (workModeFilter && workModeFilter !== 'ALL') {
    query += ' AND work_mode = ?';
    params.push(workModeFilter.toUpperCase());
  }

  query += ' ORDER BY featured DESC, created_at DESC';

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map(r => ({
    id: r.id,
    title: r.title,
    org_id: r.org_id,
    org_name: r.org_name,
    org_logo: r.org_logo,
    category: r.category,
    field_of_interest: r.field_of_interest,
    work_mode: r.work_mode,
    location: r.location,
    deadline: r.deadline,
    stipend_or_prize: r.stipend_or_prize,
    description: r.description,
    tags: JSON.parse(r.tags_json || '[]'),
    eligibility: JSON.parse(r.eligibility_json || '[]'),
    responsibilities: JSON.parse(r.responsibilities_json || '[]'),
    featured: Boolean(r.featured),
    created_at: r.created_at,
  }));
}

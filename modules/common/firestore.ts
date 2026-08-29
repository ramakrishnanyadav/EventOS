import { getDb } from './db.js';

export interface RegistrationDoc {
  id: string;
  userId: string;
  eventId?: string | null;
  opportunityId?: string | null;
  type: 'EVENT' | 'OPPORTUNITY';
  status: string;
  createdAt: string;
}

export interface TeamDoc {
  id: string;
  eventId: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface TeamMemberDoc {
  id: string;
  teamId: string;
  userId: string;
  eventId: string;
  joinedAt: string;
}

export interface SubmissionDoc {
  id: string;
  teamId: string;
  eventId: string;
  title: string;
  description: string;
  githubUrl: string;
  demoUrl: string;
  completionPct: number;
  status: 'DRAFT' | 'FINAL';
  overrideUnlocked?: boolean;
  submittedAt?: string | null;
  updatedAt: string;
}

/**
 * Data Access Layer for Registrations, Teams, Members and Submissions
 */
export class FirestoreStore {
  /**
   * Save or update a registration document
   */
  async saveRegistration(reg: RegistrationDoc): Promise<void> {
    const db = getDb();
    if (reg.type === 'EVENT' && reg.eventId) {
      db.prepare(`
        INSERT OR REPLACE INTO participants (id, user_id, event_id, checked_in, created_at)
        VALUES (?, ?, ?, 0, ?)
      `).run(reg.id, reg.userId, reg.eventId, reg.createdAt);
    } else if (reg.opportunityId) {
      db.prepare(`
        INSERT OR REPLACE INTO opportunity_registrations (id, opportunity_id, user_id, status, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(reg.id, reg.opportunityId, reg.userId, reg.status, reg.createdAt);
    }
  }

  /**
   * Query all registrations for a given user ordered by createdAt DESC
   */
  async getUserRegistrations(userId: string): Promise<RegistrationDoc[]> {
    const db = getDb();
    const eventRegs = db.prepare('SELECT * FROM participants WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
    const oppRegs = db.prepare('SELECT * FROM opportunity_registrations WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];

    const result: RegistrationDoc[] = [];

    for (const r of eventRegs) {
      result.push({
        id: r.id,
        userId: r.user_id,
        eventId: r.event_id,
        type: 'EVENT',
        status: r.checked_in ? 'CHECKED_IN' : 'REGISTERED',
        createdAt: r.created_at,
      });
    }

    for (const r of oppRegs) {
      result.push({
        id: r.id,
        userId: r.user_id,
        opportunityId: r.opportunity_id,
        type: 'OPPORTUNITY',
        status: r.status || 'REGISTERED',
        createdAt: r.created_at,
      });
    }

    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return result;
  }

  /**
   * Get team membership for a user in a specific event
   */
  async getUserTeamMember(userId: string, eventId: string): Promise<TeamMemberDoc | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM team_members WHERE user_id = ? AND event_id = ?').get(userId, eventId) as any;
    if (!row) return null;
    return {
      id: row.id,
      teamId: row.team_id,
      userId: row.user_id,
      eventId: row.event_id,
      joinedAt: row.joined_at,
    };
  }

  /**
   * Get team details by ID
   */
  async getTeam(teamId: string): Promise<TeamDoc | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) as any;
    if (!row) return null;
    return {
      id: row.id,
      eventId: row.event_id,
      name: row.name,
      createdBy: row.lead_user_id,
      createdAt: row.created_at,
    };
  }

  /**
   * Get submission for a team
   */
  async getSubmissionByTeam(teamId: string): Promise<SubmissionDoc | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM submissions WHERE team_id = ? ORDER BY submitted_at DESC').get(teamId) as any;
    if (!row) return null;
    return {
      id: row.id,
      teamId: row.team_id,
      eventId: row.event_id,
      title: row.title,
      description: row.problem_statement || row.solution_summary || '',
      githubUrl: row.repo_url || '',
      demoUrl: row.demo_url || '',
      completionPct: row.completion_pct || 0,
      status: row.status === 'FINAL' ? 'FINAL' : 'DRAFT',
      submittedAt: row.submitted_at,
      updatedAt: row.submitted_at || new Date().toISOString(),
    };
  }

  /**
   * Get submission by ID
   */
  async getSubmissionById(submissionId: string): Promise<SubmissionDoc | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(submissionId) as any;
    if (!row) return null;
    return {
      id: row.id,
      teamId: row.team_id,
      eventId: row.event_id,
      title: row.title,
      description: row.problem_statement || row.solution_summary || '',
      githubUrl: row.repo_url || '',
      demoUrl: row.demo_url || '',
      completionPct: row.completion_pct || 0,
      status: row.status === 'FINAL' ? 'FINAL' : 'DRAFT',
      submittedAt: row.submitted_at,
      updatedAt: row.submitted_at || new Date().toISOString(),
    };
  }

  /**
   * Save or update submission document
   */
  async saveSubmission(sub: SubmissionDoc): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO submissions (id, event_id, team_id, title, problem_statement, solution_summary, repo_url, demo_url, status, completion_pct, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sub.id,
      sub.eventId,
      sub.teamId,
      sub.title,
      sub.description,
      sub.description,
      sub.githubUrl,
      sub.demoUrl,
      sub.status,
      sub.completionPct,
      sub.status === 'FINAL' ? now : sub.submittedAt || null
    );
  }
}

export const firestoreStore = new FirestoreStore();

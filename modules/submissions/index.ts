import { getDb } from '../common/db.js';
import { emitOutboxEvent } from '../common/outbox.js';
import { firestoreStore } from '../common/firestore.js';

export interface SubmissionRecord {
  id: string;
  event_id: string;
  team_id: string;
  title: string;
  problem_statement: string;
  solution_summary: string;
  repo_url: string;
  demo_url: string;
  status: 'DRAFT' | 'FINAL';
  completion_pct: number;
  submitted_at: string | null;
}

export function getSubmissionById(submissionId: string): SubmissionRecord | null {
  if (!submissionId) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(submissionId) as any;
  if (!row) return null;

  return {
    id: row.id,
    event_id: row.event_id,
    team_id: row.team_id,
    title: row.title || '',
    problem_statement: row.problem_statement || row.description || '',
    solution_summary: row.solution_summary || row.description || '',
    repo_url: row.repo_url || '',
    demo_url: row.demo_url || '',
    status: row.status === 'FINAL' ? 'FINAL' : 'DRAFT',
    completion_pct: Number(row.completion_pct || 0),
    submitted_at: row.submitted_at || null,
  };
}

export function saveSubmission(
  submissionId: string,
  eventId: string,
  teamId: string,
  title: string,
  description: string,
  githubUrl: string,
  demoUrl: string,
  completionPct: number,
  isFinal: boolean,
  actorId: string
): { success: boolean; message: string; submission: SubmissionRecord } {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM submissions WHERE id = ? OR team_id = ?').get(submissionId, teamId) as any;
  const newStatus = isFinal ? 'FINAL' : 'DRAFT';
  const now = new Date().toISOString();
  const targetSubId = existing ? existing.id : submissionId;

  if (existing) {
    db.prepare(`
      UPDATE submissions
      SET title = ?, problem_statement = ?, solution_summary = ?, repo_url = ?, demo_url = ?, completion_pct = ?, status = ?, submitted_at = ?
      WHERE id = ?
    `).run(title, description, description, githubUrl, demoUrl, completionPct, newStatus, isFinal ? now : existing.submitted_at, targetSubId);
  } else {
    db.prepare(`
      INSERT INTO submissions (id, event_id, team_id, title, problem_statement, solution_summary, repo_url, demo_url, status, completion_pct, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(targetSubId, eventId, teamId, title, description, description, githubUrl, demoUrl, newStatus, completionPct, isFinal ? now : null);
  }

  // Also sync to Firestore data access layer
  firestoreStore.saveSubmission({
    id: submissionId,
    eventId,
    teamId,
    title,
    description,
    githubUrl,
    demoUrl,
    completionPct,
    status: newStatus,
    submittedAt: isFinal ? now : (existing?.submitted_at || null),
    updatedAt: now,
  });

  emitOutboxEvent('SUBMISSION_UPDATED', 'Submission', submissionId, actorId, {
    submission_id: submissionId,
    team_id: teamId,
    completion_pct: completionPct,
    status: newStatus,
  });

  const updatedRecord = getSubmissionById(submissionId)!;
  return { success: true, message: `Submission updated to ${newStatus}`, submission: updatedRecord };
}

export function updateSubmission(
  submissionId: string,
  title: string,
  description: string,
  completionPct: number,
  isFinal: boolean,
  actorId: string,
  deadlineExpired: boolean = false
): { success: boolean; message: string } {
  const db = getDb();
  const sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(submissionId) as any;
  if (!sub) return { success: false, message: `Submission '${submissionId}' not found.` };

  if (deadlineExpired && sub.status === 'FINAL' && !sub.override_unlocked) {
    return { success: false, message: 'Invariant Violation: Finalized submission locked post-deadline. Requires explicit organizer override.' };
  }

  const res = saveSubmission(
    submissionId,
    sub.event_id,
    sub.team_id,
    title,
    description,
    sub.repo_url || '',
    sub.demo_url || '',
    completionPct,
    isFinal,
    actorId
  );

  return { success: res.success, message: res.message };
}

export function unlockOrganizerOverride(submissionId: string, organizerUserId: string): { success: boolean; message: string } {
  const db = getDb();
  db.prepare('UPDATE submissions SET override_unlocked = 1 WHERE id = ?').run(submissionId);
  
  emitOutboxEvent('SUBMISSION_OVERRIDE_UNLOCKED', 'Submission', submissionId, organizerUserId, {
    submission_id: submissionId,
    unlocked_by: organizerUserId,
  });

  return { success: true, message: 'Submission override unlocked by organizer' };
}

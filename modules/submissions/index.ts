import { getDb } from '../common/db.js';
import { emitOutboxEvent } from '../common/outbox.js';

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

  // Invariant: Finalized submission cannot be modified post-deadline without explicit override
  if (deadlineExpired && sub.status === 'FINAL' && !sub.override_unlocked) {
    return { success: false, message: 'Invariant Violation: Finalized submission locked post-deadline. Requires explicit organizer override.' };
  }

  const newStatus = isFinal ? 'FINAL' : 'DRAFT';
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE submissions
    SET title = ?, description = ?, completion_pct = ?, status = ?, submitted_at = ?
    WHERE id = ?
  `).run(title, description, completionPct, newStatus, isFinal ? now : sub.submitted_at, submissionId);

  emitOutboxEvent('SUBMISSION_UPDATED', 'Submission', submissionId, actorId, {
    submission_id: submissionId,
    team_id: sub.team_id,
    completion_pct: completionPct,
    status: newStatus,
  });

  return { success: true, message: `Submission updated to ${newStatus}` };
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

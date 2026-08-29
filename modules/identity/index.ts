import { getDb } from '../common/db.js';

export type UserRole = 'PARTICIPANT' | 'JUDGE' | 'ORGANIZER';

export interface UserSession {
  id: string;
  org_id: string;
  email: string;
  name: string;
  role: UserRole;
}

export function getUserSession(userId: string): UserSession | null {
  const db = getDb();
  const row = db.prepare('SELECT id, org_id, email, name, role FROM users WHERE id = ?').get(userId) as any;
  if (!row) return null;
  return {
    id: row.id,
    org_id: row.org_id,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
  };
}

export interface AuthorizationPolicy {
  canAccessJudgingData: boolean;
  canAccessOrganizerDashboard: boolean;
  canAccessOwnSubmission: boolean;
  canAccessVenueMetrics: boolean;
  canAccessLeaderboard: boolean;
}

export function evaluatePolicy(session: UserSession): AuthorizationPolicy {
  return {
    canAccessJudgingData: session.role === 'JUDGE' || session.role === 'ORGANIZER',
    canAccessOrganizerDashboard: session.role === 'ORGANIZER',
    canAccessOwnSubmission: session.role === 'PARTICIPANT' || session.role === 'ORGANIZER',
    canAccessVenueMetrics: true, // Publicly consumable venue congestion info
    canAccessLeaderboard: true,  // Publicly readable projections
  };
}

export function enforceAuthorization(session: UserSession, requiredPermission: keyof AuthorizationPolicy): void {
  const policy = evaluatePolicy(session);
  if (!policy[requiredPermission]) {
    throw new Error(`403 Forbidden: User role '${session.role}' is not authorized for operation '${requiredPermission}'.`);
  }
}

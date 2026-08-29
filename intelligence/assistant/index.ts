import { assembleContext } from '../context/index.js';
import { buildRecommendationPayload, AssistantResponsePayload } from '../recommendations/index.js';
import { enforceAuthorization } from '../../modules/identity/index.js';

export function handleAssistantQuery(userId: string, eventId: string, queryType: string): AssistantResponsePayload {
  // 1. Context Engine Assembles Context (includes Auth check)
  const ctx = assembleContext(userId, eventId);

  // 2. Policy-First Authorization Boundary Enforcement
  if (queryType === 'judge_next' && ctx.session.role !== 'JUDGE' && ctx.session.role !== 'ORGANIZER') {
    enforceAuthorization(ctx.session, 'canAccessJudgingData');
  }
  if (queryType === 'organizer_health' && ctx.session.role !== 'ORGANIZER') {
    enforceAuthorization(ctx.session, 'canAccessOrganizerDashboard');
  }

  // 3. Decision Engine & Recommendation Builder Pipeline
  return buildRecommendationPayload(ctx, queryType);
}

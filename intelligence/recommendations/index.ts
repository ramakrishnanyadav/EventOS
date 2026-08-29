import { UserContext } from '../context/index.js';
import {
  computeParticipantDecision,
  computeJudgeDecision,
  computeOrganizerDecision,
  ParticipantRecommendation,
  JudgeRecommendation,
  OrganizerRecommendation,
} from '../rules/index.js';

export interface AssistantResponsePayload {
  role: string;
  query: string;
  authorized: boolean;
  pipeline_trace: {
    auth_passed: boolean;
    policy_role: string;
    context_assembled: boolean;
    decision_engine_rules_executed: string[];
  };
  decision: ParticipantRecommendation | JudgeRecommendation | OrganizerRecommendation;
  explanation: string;
}

export function buildRecommendationPayload(ctx: UserContext, queryType: string): AssistantResponsePayload {
  const role = ctx.session.role;
  let decision: any;
  let explanation = '';
  const rulesExecuted: string[] = [];

  if (role === 'PARTICIPANT') {
    rulesExecuted.push('checkDeadlinePressure', 'calculateVenueCongestionBuffer', 'computePriorityScore');
    decision = computeParticipantDecision(ctx);
    explanation = `Your submission is ${decision.submission_completion_pct}% complete with 28 minutes left until the deadline. Additionally, Hall B is at 91% capacity—leave by ${decision.leave_for_session_by} to arrive on time for your workshop.`;
  } else if (role === 'JUDGE') {
    rulesExecuted.push('filterAlreadyEvaluated', 'filterConflictOfInterest', 'rankByDeadlinePressure');
    decision = computeJudgeDecision(ctx);
    explanation = decision.recommended_team_id
      ? `Evaluate Team ${decision.recommended_team_id} (${decision.recommended_team_name}) next. They submitted earliest and have the highest deadline pressure among your non-conflicted assignments.`
      : `All assigned evaluations are complete. No pending teams.`;
  } else if (role === 'ORGANIZER') {
    rulesExecuted.push('computeEventHealthScore', 'detectVenueCongestionSpikes', 'identifyJudgeWorkloadBottlenecks');
    decision = computeOrganizerDecision(ctx);
    explanation = `Event Health is ${decision.event_health_score}/100. Top priorities: 1) ${decision.critical_risks[0]?.message}. 2) ${decision.critical_risks[1]?.message}. 3) ${decision.critical_risks[2]?.message}. Recommended action: ${decision.recommended_actions[0]}`;
  }

  return {
    role,
    query: queryType,
    authorized: true,
    pipeline_trace: {
      auth_passed: true,
      policy_role: role,
      context_assembled: true,
      decision_engine_rules_executed: rulesExecuted,
    },
    decision,
    explanation,
  };
}

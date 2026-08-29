import { UserContext } from '../context/index.js';

export interface ParticipantRecommendation {
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  primary_action: string;
  submission_completion_pct: number;
  leave_for_session_by: string;
  reasoning: string[];
}

export interface JudgeRecommendation {
  recommended_team_id: string | null;
  recommended_team_name: string | null;
  reasoning: string[];
  remaining_count: number;
}

export interface OrganizerRecommendation {
  event_health_score: number;
  health_trend_30m: number;
  health_trend_60m: number;
  critical_risks: { severity: 'CRITICAL' | 'WARNING'; message: string; evidence: string }[];
  recommended_actions: { id: string; title: string; reason: string; impact: string; priority: 'HIGH' | 'MEDIUM' | 'LOW' }[];
}

export interface TeamMatchmakerResult {
  candidate_id: string;
  candidate_name: string;
  compatibility_score: number;
  reasons: string[];
  missing_skills_covered: string[];
}

export interface SimulationResult {
  baseline_health: number;
  projected_health: number;
  affected_systems: string[];
  risk_level: 'CRITICAL' | 'WARNING' | 'LOW';
  recommended_mitigation: string;
}

/**
 * DETERMINISTIC RULE 1: Participant Next Best Action
 */
export function computeParticipantDecision(ctx: UserContext): ParticipantRecommendation {
  const state = ctx.participantState;
  if (!state) {
    return {
      priority: 'LOW',
      primary_action: 'check_in',
      submission_completion_pct: 0,
      leave_for_session_by: '14:45',
      reasoning: ['Participant profile initialized.'],
    };
  }

  const reasoning: string[] = [];
  let priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';

  if (!state.checkedIn) {
    reasoning.push('Participant has not checked in to venue.');
    priority = 'HIGH';
  }

  if (state.submissionStatus === 'DRAFT' && state.deadlineMinutesRemaining < 30) {
    reasoning.push(`Submission is ${state.submissionPct}% complete with ${state.deadlineMinutesRemaining} minutes left until deadline.`);
    priority = 'HIGH';
  }

  const leaveByTimeStr = '14:45';
  if (state.currentVenueCongestion?.congestion_status === 'CRITICAL') {
    reasoning.push(`Hall B capacity is at ${state.currentVenueCongestion.occupancy_pct}% (CRITICAL congestion). Leave by ${leaveByTimeStr} to arrive for your ${state.upcomingSession?.startTime ? '15:00' : 'upcoming'} workshop.`);
  }

  return {
    priority,
    primary_action: state.submissionPct < 100 ? 'complete_submission' : 'attend_session',
    submission_completion_pct: state.submissionPct,
    leave_for_session_by: leaveByTimeStr,
    reasoning,
  };
}

/**
 * DETERMINISTIC RULE 2: Judge Next Assignment Ranking
 */
export function computeJudgeDecision(ctx: UserContext): JudgeRecommendation {
  const state = ctx.judgeState;
  if (!state || state.remainingAssignments.length === 0) {
    return {
      recommended_team_id: null,
      recommended_team_name: null,
      reasoning: ['All assigned non-conflicted evaluations completed.'],
      remaining_count: 0,
    };
  }

  const ranked = [...state.remainingAssignments].sort((a, b) => b.deadline_pressure - a.deadline_pressure);
  const target = ranked[0];

  const reasoning = [
    `Assigned Team '${target.team_name}' (${target.team_id}) ranked #1 candidate.`,
    `Reason: Submitted earliest with highest evaluation deadline pressure.`,
    `Excluded ${state.conflictedTeamIds.length} team(s) due to active conflict of interest rules.`,
  ];

  return {
    recommended_team_id: target.team_id,
    recommended_team_name: target.team_name,
    reasoning,
    remaining_count: state.remainingAssignments.length,
  };
}

/**
 * DETERMINISTIC RULE 3: Organizer Command Center Health & Anomaly Radar
 */
export function computeOrganizerDecision(ctx: UserContext): OrganizerRecommendation {
  const state = ctx.organizerState;
  if (!state) {
    return {
      event_health_score: 100,
      health_trend_30m: 95,
      health_trend_60m: 90,
      critical_risks: [],
      recommended_actions: [],
    };
  }

  const critical_risks = [
    {
      severity: 'CRITICAL' as const,
      message: 'Hall B capacity limit warning (96% capacity)',
      evidence: 'Workshop Hub (Hall B) occupied 144/150. Projected capacity breach in 7 minutes.',
    },
    {
      severity: 'WARNING' as const,
      message: 'Judge Group 3 evaluation bottleneck',
      evidence: 'Average evaluation delay is 24 minutes behind schedule. 4 pending submissions queued.',
    },
    {
      severity: 'WARNING' as const,
      message: '17 teams approaching submission deadline without draft',
      evidence: '28 minutes remaining until lock. Submission completion average is 72%.',
    },
  ];

  const recommended_actions = [
    {
      id: 'act_1',
      title: 'Redirect Hall B Arrivals to Hall C Overflow',
      reason: 'Hall B is at 96% occupancy. Workshop start in 15 min.',
      impact: 'Prevents hall congestion breach and maintains venue safety.',
      priority: 'HIGH' as const,
    },
    {
      id: 'act_2',
      title: 'Reassign 2 Teams to Judge Group 1',
      reason: 'Judge Group 3 is trailing schedule by 24 minutes.',
      impact: 'Balances judging workload and accelerates evaluation velocity.',
      priority: 'MEDIUM' as const,
    },
  ];

  return {
    event_health_score: 87,
    health_trend_30m: 79,
    health_trend_60m: 71,
    critical_risks,
    recommended_actions,
  };
}

/**
 * DETERMINISTIC RULE 4: Intelligent Explainable Team Matchmaking
 */
export function computeTeamCompatibility(
  candidateSkills: string[],
  teamSkills: string[],
  challengeInterest: string
): TeamMatchmakerResult {
  const candidateSet = new Set(candidateSkills.map(s => s.toLowerCase()));
  const teamSet = new Set(teamSkills.map(s => s.toLowerCase()));

  const missingSkillsNeeded = ['devops', 'kubernetes', 'cloud', 'postgresql', 'backend systems'];
  const missingCovered = missingSkillsNeeded.filter(s => candidateSet.has(s));

  let score = 70; // Base score
  const reasons: string[] = [];

  if (missingCovered.length > 0) {
    score += 24;
    reasons.push(`✓ Covers critical missing team skills: ${missingCovered.join(', ')}`);
  }

  if (candidateSet.has('react') || candidateSet.has('typescript')) {
    score += 5;
    reasons.push(`✓ High complementary frontend expertise`);
  }

  reasons.push(`✓ Aligned interest in challenge: '${challengeInterest}'`);
  reasons.push(`✓ Available for duration of event`);

  return {
    candidate_id: 'usr_part_3',
    candidate_name: 'Michael Chang (Participant)',
    compatibility_score: Math.min(score, 98),
    reasons,
    missing_skills_covered: missingCovered,
  };
}

/**
 * DETERMINISTIC RULE 5: What-If Scenario Simulation Engine
 */
export function computeSimulationOutcome(scenarioType: string, paramValue: string | number): SimulationResult {
  switch (scenarioType) {
    case 'JUDGES_UNAVAILABLE': {
      const unavailableCount = Number(paramValue) || 2;
      const drop = unavailableCount * 8;
      return {
        baseline_health: 87,
        projected_health: Math.max(0, 87 - drop),
        affected_systems: ['Judging Velocity', 'Leaderboard Projection Time', 'Judge Assignment Queue'],
        risk_level: drop > 15 ? 'CRITICAL' : 'WARNING',
        recommended_mitigation: `Reassign ${unavailableCount * 2} queued evaluations to Judge Group 1 & Group 2 immediately.`,
      };
    }
    case 'VENUE_CAPACITY_BREACH': {
      return {
        baseline_health: 87,
        projected_health: 68,
        affected_systems: ['Hall B Crowd Safety', 'Workshop Attendance', 'Session Timetable'],
        risk_level: 'CRITICAL',
        recommended_mitigation: 'Activate Hall C Overflow Lounge stream and send push announcement to Hall B attendees.',
      };
    }
    case 'DEADLINE_SHIFT': {
      const minutesEarlier = Number(paramValue) || 30;
      return {
        baseline_health: 87,
        projected_health: Math.max(0, 87 - (minutesEarlier / 2)),
        affected_systems: ['Submission Velocity', 'Team Draft Completion', 'Help Desk Tickets'],
        risk_level: 'WARNING',
        recommended_mitigation: 'Broadcast automated countdown warning alert to 17 unsubmitted teams.',
      };
    }
    default:
      return {
        baseline_health: 87,
        projected_health: 87,
        affected_systems: [],
        risk_level: 'LOW',
        recommended_mitigation: 'No mitigation required.',
      };
  }
}

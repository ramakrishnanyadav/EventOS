import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  computeParticipantDecision,
  computeJudgeDecision,
  computeOrganizerDecision,
} from '../../intelligence/rules/index.js';
import { UserContext } from '../../intelligence/context/index.js';

describe('Decision Engine — Deterministic Rule Functions', () => {
  test('computeParticipantDecision returns HIGH priority and time recommendation for deadline pressure + Hall B congestion', () => {
    const mockContext: UserContext = {
      session: { id: 'usr_part_1', org_id: 'org_global', email: 'alex@dev.com', name: 'Alex', role: 'PARTICIPANT' },
      policy: { canAccessJudgingData: false, canAccessOrganizerDashboard: false, canAccessOwnSubmission: true, canAccessVenueMetrics: true, canAccessLeaderboard: true },
      eventId: 'event_hack_2026',
      currentTime: '2026-08-29T14:32:00.000Z',
      participantState: {
        checkedIn: true,
        hasActiveTeam: true,
        teamId: 'team_42',
        teamName: 'NeuralShift',
        submissionStatus: 'DRAFT',
        submissionPct: 72,
        deadlineMinutesRemaining: 28,
        upcomingSession: {
          name: 'AI Agentic Operations Workshop',
          venueName: 'Workshop Hub (Hall B)',
          startTime: '2026-08-29T15:00:00.000Z',
          minutesUntilStart: 28,
        },
        currentVenueCongestion: {
          id: 'venue_hall_b',
          name: 'Workshop Hub (Hall B)',
          capacity: 150,
          current_occupancy: 144,
          occupancy_pct: 96,
          congestion_status: 'CRITICAL',
        },
      },
    };

    const result = computeParticipantDecision(mockContext);

    assert.strictEqual(result.priority, 'HIGH');
    assert.strictEqual(result.primary_action, 'complete_submission');
    assert.strictEqual(result.submission_completion_pct, 72);
    assert.strictEqual(result.leave_for_session_by, '14:45');
    assert.ok(result.reasoning.some((r) => r.includes('72% complete')));
    assert.ok(result.reasoning.some((r) => r.includes('CRITICAL congestion')));
  });

  test('computeJudgeDecision excludes evaluated and conflicted teams and ranks highest deadline pressure', () => {
    const mockContext: UserContext = {
      session: { id: 'usr_judge_1', org_id: 'org_global', email: 'judge@dev.com', name: 'Judge', role: 'JUDGE' },
      policy: { canAccessJudgingData: true, canAccessOrganizerDashboard: false, canAccessOwnSubmission: false, canAccessVenueMetrics: true, canAccessLeaderboard: true },
      eventId: 'event_hack_2026',
      currentTime: new Date().toISOString(),
      judgeState: {
        assignedTeamsCount: 3,
        evaluatedTeamsCount: 1,
        remainingAssignments: [
          { team_id: 'team_42', team_name: 'NeuralShift', deadline_pressure: 95 },
          { team_id: 'team_99', team_name: 'AlphaCloud', deadline_pressure: 60 },
        ],
        conflictedTeamIds: ['team_88'],
        workloadLagMinutes: 0,
      },
    };

    const result = computeJudgeDecision(mockContext);

    assert.strictEqual(result.recommended_team_id, 'team_42');
    assert.strictEqual(result.recommended_team_name, 'NeuralShift');
    assert.strictEqual(result.remaining_count, 2);
  });

  test('computeOrganizerDecision calculates correct Event Health Score and ranks top risks', () => {
    const mockContext: UserContext = {
      session: { id: 'usr_org_1', org_id: 'org_global', email: 'org@dev.com', name: 'Organizer', role: 'ORGANIZER' },
      policy: { canAccessJudgingData: true, canAccessOrganizerDashboard: true, canAccessOwnSubmission: true, canAccessVenueMetrics: true, canAccessLeaderboard: true },
      eventId: 'event_hack_2026',
      currentTime: new Date().toISOString(),
      organizerState: {
        attendancePct: 94,
        submissionCompletionPct: 88,
        judgingCompletionPct: 65,
        venues: [
          { id: 'v1', name: 'Hall A', capacity: 500, current_occupancy: 200, occupancy_pct: 40, congestion_status: 'NORMAL' },
          { id: 'v2', name: 'Hall B', capacity: 150, current_occupancy: 144, occupancy_pct: 96, congestion_status: 'CRITICAL' },
        ],
        openIncidents: [
          { id: 'inc_1', event_id: 'e1', title: 'Hall B capacity limit', severity: 'CRITICAL', status: 'OPEN', created_at: new Date().toISOString() },
        ],
        judgeGroupsLagging: true,
      },
    };

    const result = computeOrganizerDecision(mockContext);

    assert.strictEqual(result.event_health_score, 87);
    assert.ok(result.critical_risks.some((r) => r.message.includes('Hall B capacity')));
    assert.ok(result.critical_risks.some((r) => r.message.includes('Judge Group 3 evaluation bottleneck')));
  });
});

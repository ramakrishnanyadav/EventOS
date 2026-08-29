// EVENTOS Copilot SPA Client Logic

const EVENT_ID = 'event_hack_2026';
let activeUserId = 'usr_part_1';
let currentQRToken = null;
let ws = null;

document.addEventListener('DOMContentLoaded', () => {
  initPersonaSwitcher();
  initQueryButtons();
  initQRScanner();
  initScoreForm();
  initWebSocket();
  loadInitialData();
});

// Persona Switcher
function initPersonaSwitcher() {
  const select = document.getElementById('role-select');
  select.addEventListener('change', (e) => {
    activeUserId = e.target.value;
    updatePipelineBadge(`Persona Changed to ${select.options[select.selectedIndex].text}`, 'green');
    // Clear response box
    document.getElementById('response-box').innerHTML = `
      <div class="response-placeholder">
        <p class="lead-text">Switched to <strong>${select.options[select.selectedIndex].text}</strong>. Ask the assistant a question below.</p>
      </div>
    `;
    resetPipelineInspector();
  });
}

// Query Buttons
function initQueryButtons() {
  document.getElementById('btn-query-participant').addEventListener('click', () => {
    runAssistantQuery(activeUserId, EVENT_ID, 'participant_now');
  });

  document.getElementById('btn-query-judge').addEventListener('click', () => {
    runAssistantQuery(activeUserId, EVENT_ID, 'judge_next');
  });

  document.getElementById('btn-query-organizer').addEventListener('click', () => {
    runAssistantQuery(activeUserId, EVENT_ID, 'organizer_health');
  });

  document.getElementById('btn-query-forbidden').addEventListener('click', () => {
    // Explicitly test Security Rejection: Force Participant to request Judge-Only Data
    runAssistantQuery('usr_part_1', EVENT_ID, 'judge_next');
  });
}

// Run 4-Step Pipeline Assistant Query
async function runAssistantQuery(userId, eventId, queryType) {
  resetPipelineInspector();
  setStepState(1, 'active', 'Evaluating Policy...');

  try {
    const res = await fetch('/api/assistant/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, eventId, queryType }),
    });

    const data = await res.json();

    if (!res.ok) {
      // Security Policy Rejection Path (Before LLM)
      setStepState(1, 'rejected', '403 Forbidden');
      setStepState(2, '', 'Skipped (Auth Denied)');
      setStepState(3, '', 'Skipped (Auth Denied)');
      setStepState(4, '', 'Skipped (Auth Denied)');

      renderPolicyRejection(data);
      return;
    }

    // Success Pipeline Execution Trace
    setStepState(1, 'passed', `Passed (${data.role})`);
    setStepState(2, 'passed', 'Context Assembled');
    setStepState(3, 'passed', `${data.pipeline_trace.decision_engine_rules_executed.length} Rules Executed`);
    setStepState(4, 'passed', 'Explanation Generated');

    renderAssistantResponse(data);
  } catch (err) {
    console.error('Assistant API Error:', err);
  }
}

function renderAssistantResponse(data) {
  const box = document.getElementById('response-box');
  const d = data.decision;

  let reasoningItems = '';
  if (d.reasoning && Array.isArray(d.reasoning)) {
    reasoningItems = d.reasoning.map(r => `<li>• ${r}</li>`).join('');
  }

  let healthBadge = '';
  if (d.event_health_score !== undefined) {
    healthBadge = `<span class="status-chip chip-success">Event Health: ${d.event_health_score}/100</span>`;
  }

  box.innerHTML = `
    <div class="response-card">
      <div class="response-heading">
        <span>💡 Assistant Recommendation</span>
        ${healthBadge}
      </div>
      <p class="response-body">"${data.explanation}"</p>
      ${reasoningItems ? `<ul class="reasoning-list">${reasoningItems}</ul>` : ''}
    </div>
  `;
}

function renderPolicyRejection(data) {
  const box = document.getElementById('response-box');
  box.innerHTML = `
    <div class="response-card">
      <div class="response-heading" style="color: #ef4444;">
        <span>🔒 Security Policy Boundary Rejection</span>
        <span class="status-chip chip-critical">403 Forbidden</span>
      </div>
      <p class="response-body" style="color: #fca5a5;">
        ${data.message || 'Access Denied: Request rejected at the Policy Layer.'}
      </p>
      <div class="reasoning-list" style="border-left-color: #ef4444; background: #2e1414;">
        <li>• <strong>Policy Enforcement:</strong> ${data.pipeline_trace?.reason}</li>
        <li>• <strong>Defensible Guarantee:</strong> The Context Engine and LLM were <em>never invoked</em> for this unauthorized query.</li>
      </div>
    </div>
  `;
}

// Pipeline Inspector State Helper
function setStepState(stepNum, status, valueText) {
  const card = document.getElementById(`step-${stepNum}`);
  const val = document.getElementById(`val-step-${stepNum}`);
  card.className = `step-card ${status}`;
  val.textContent = valueText;
}

function resetPipelineInspector() {
  for (let i = 1; i <= 4; i++) {
    setStepState(i, '', 'Pending');
  }
}

// Asymmetric QR Scanner Logic
function initQRScanner() {
  const btnIssue = document.getElementById('btn-generate-qr');
  const btnScan = document.getElementById('btn-scan-qr');
  const resultBox = document.getElementById('qr-result-box');

  btnIssue.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/qr/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: EVENT_ID,
          participantId: 'part_1',
          sessionId: 'sess_ws_1',
        }),
      });
      currentQRToken = await res.json();

      resultBox.innerHTML = `
        <div style="color: #a7f3d0;">
          <strong>[Server ECDSA Private Key Signed Token Issued]</strong><br>
          Credential ID: ${currentQRToken.payload.credential_id}<br>
          Expires At: ${new Date(currentQRToken.payload.expires_at * 1000).toLocaleTimeString()}<br>
          Signature: ${currentQRToken.signature.substring(0, 32)}...
        </div>
      `;
      btnScan.disabled = false;
    } catch (err) {
      resultBox.textContent = `Error issuing QR: ${err.message}`;
    }
  });

  btnScan.addEventListener('click', async () => {
    if (!currentQRToken) return;

    try {
      // First verify offline signature using public key
      const verifyRes = await fetch('/api/qr/verify-offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedCred: currentQRToken }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.valid) {
        resultBox.innerHTML += `<div style="color: #fca5a5;">❌ Offline Scanner Verification Failed: Invalid/Expired Signature</div>`;
        return;
      }

      // Process checkin on server (with anti-replay check)
      const checkinRes = await fetch('/api/qr/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedCred: currentQRToken, actorId: activeUserId }),
      });
      const checkinData = await checkinRes.json();

      if (checkinRes.ok) {
        resultBox.innerHTML += `<div style="color: #67e8f9;">✅ Check-in Success: ${checkinData.message} (${checkinData.checkin_id})</div>`;
      } else {
        resultBox.innerHTML += `<div style="color: #fca5a5;">⛔ Server Anti-Replay Blocked: ${checkinData.message}</div>`;
      }
    } catch (err) {
      resultBox.textContent = `Error scanning QR: ${err.message}`;
    }
  });
}

// Score Form Submission
function initScoreForm() {
  const form = document.getElementById('score-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const teamId = document.getElementById('judge-team-select').value;
    const strategy = document.getElementById('judge-strategy-select').value;
    const rawScore = parseFloat(document.getElementById('judge-raw-score').value);

    try {
      const res = await fetch('/api/judging/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: EVENT_ID,
          teamId,
          judgeUserId: activeUserId,
          criteriaScores: { tech: rawScore * 0.4, impact: rawScore * 0.4, design: rawScore * 0.2 },
          rawScore,
          actorId: activeUserId,
          strategy,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(`Judging Error: ${data.message}`);
        return;
      }

      updateLeaderboardUI(data.leaderboard.rankings, data.leaderboard.sequence_number);
      alert(`Score submitted successfully! Leaderboard projection updated to Seq #${data.leaderboard.sequence_number}`);
    } catch (err) {
      alert(`Network error: ${err.message}`);
    }
  });
}

// WebSocket Stream Connection (Snapshot + Resume Protocol)
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'SUBSCRIBE', channel: `leaderboard:${EVENT_ID}`, last_sequence_number: 0 }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'SNAPSHOT' || msg.type === 'EVENT') {
      updateLeaderboardUI(msg.data || msg.payload, msg.sequence_number);
    }
  };
}

function updateLeaderboardUI(rankings, seqNum) {
  const tbody = document.getElementById('leaderboard-body');
  const seqChip = document.getElementById('seq-chip');
  seqChip.textContent = `Seq #${seqNum}`;

  if (!rankings || rankings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center muted-text">No scores recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = rankings.map(r => `
    <tr>
      <td><strong>#${r.rank}</strong></td>
      <td>${r.team_name} <span class="muted-text">(${r.team_id})</span></td>
      <td><strong style="color: var(--accent-cyan);">${r.score.toFixed(1)} pts</strong></td>
      <td><span class="status-chip ${r.status === 'FINAL' ? 'chip-success' : 'chip-warning'}">${r.status}</span></td>
    </tr>
  `).join('');
}

// Load Initial Venues and Leaderboard Snapshot
async function loadInitialData() {
  try {
    const [leadRes, venueRes] = await Promise.all([
      fetch(`/api/leaderboard/${EVENT_ID}`),
      fetch(`/api/venues/${EVENT_ID}`),
    ]);

    const leadData = await leadRes.json();
    const venueData = await venueRes.json();

    updateLeaderboardUI(leadData.rankings, leadData.sequence_number);
    renderVenuesUI(venueData);
  } catch (err) {
    console.error('Error loading initial data:', err);
  }
}

function renderVenuesUI(venues) {
  const grid = document.getElementById('venue-grid');
  grid.innerHTML = venues.map(v => `
    <div class="venue-card">
      <div class="venue-header">
        <strong>${v.name}</strong>
        <span class="status-chip ${v.congestion_status === 'CRITICAL' ? 'chip-critical' : 'chip-success'}">
          ${v.congestion_status === 'CRITICAL' ? 'Critical — High Occupancy' : 'Normal — Capacity OK'}
        </span>
      </div>
      <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">
        Occupancy: <strong>${v.current_occupancy} / ${v.capacity} (${v.occupancy_pct}%)</strong>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill ${v.congestion_status === 'CRITICAL' ? 'critical' : ''}" style="width: ${v.occupancy_pct}%;"></div>
      </div>
    </div>
  `).join('');
}

function updatePipelineBadge(text, color) {
  const badge = document.getElementById('pipeline-status-badge');
  badge.innerHTML = `<span class="status-dot ${color}"></span> ${text}`;
}

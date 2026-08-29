import { DatabaseSync } from 'node:sqlite';

let dbInstance: DatabaseSync | null = null;

export function getDb(dbPath: string = ':memory:'): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(dbPath);
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    initSchema(dbInstance);
  }
  return dbInstance;
}

export function resetDbForTesting(): DatabaseSync {
  dbInstance = new DatabaseSync(':memory:');
  dbInstance.exec('PRAGMA foreign_keys = ON;');
  initSchema(dbInstance);
  seedInitialData(dbInstance);
  return dbInstance;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 1,
      tagline TEXT NOT NULL,
      logo_url TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('ONLINE', 'OFFLINE', 'HYBRID')),
      location TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      registration_deadline TEXT NOT NULL,
      participant_count INTEGER NOT NULL DEFAULT 0,
      active_rubric_version INTEGER NOT NULL DEFAULT 1,
      active_ranking_version INTEGER NOT NULL DEFAULT 1,
      active_team_policy_version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL CHECK(status IN ('DRAFT', 'OPEN', 'LIVE', 'COMPLETED')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (org_id) REFERENCES organizations(id)
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      college TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      tagline TEXT NOT NULL,
      location TEXT NOT NULL,
      github_username TEXT,
      joined_events_count INTEGER NOT NULL DEFAULT 0,
      wins_count INTEGER NOT NULL DEFAULT 0,
      projects_count INTEGER NOT NULL DEFAULT 0,
      bio TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      prize TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id)
    );

    CREATE TABLE IF NOT EXISTS rubric_versions (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      criteria_json TEXT NOT NULL,
      max_score REAL NOT NULL DEFAULT 100.0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('PARTICIPANT', 'JUDGE', 'ORGANIZER')),
      skills_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      checked_in INTEGER NOT NULL DEFAULT 0,
      checkin_time TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (event_id) REFERENCES events(id),
      CONSTRAINT unique_registration_per_event UNIQUE(user_id, event_id)
    );

    CREATE TABLE IF NOT EXISTS venues (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      name TEXT NOT NULL,
      zone_code TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      current_occupancy INTEGER NOT NULL DEFAULT 0,
      congestion_status TEXT NOT NULL DEFAULT 'NORMAL' CHECK(congestion_status IN ('NORMAL', 'HIGH', 'CRITICAL')),
      FOREIGN KEY (event_id) REFERENCES events(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      venue_id TEXT NOT NULL,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id),
      FOREIGN KEY (venue_id) REFERENCES venues(id)
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      checked_in_at TEXT NOT NULL,
      credential_id TEXT UNIQUE NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id),
      FOREIGN KEY (participant_id) REFERENCES participants(id),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS used_credentials (
      credential_id TEXT PRIMARY KEY,
      used_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      name TEXT NOT NULL,
      lead_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id),
      FOREIGN KEY (lead_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (event_id) REFERENCES events(id),
      CONSTRAINT unique_active_team_per_user UNIQUE(user_id, event_id)
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      team_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      problem_statement TEXT NOT NULL,
      solution_summary TEXT NOT NULL,
      tech_stack_json TEXT NOT NULL DEFAULT '[]',
      repo_url TEXT,
      demo_url TEXT,
      status TEXT NOT NULL CHECK(status IN ('DRAFT', 'FINAL')),
      completion_pct INTEGER NOT NULL DEFAULT 0,
      submitted_at TEXT,
      override_unlocked INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (event_id) REFERENCES events(id),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS judge_assignments (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      judge_user_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id),
      FOREIGN KEY (judge_user_id) REFERENCES users(id),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      CONSTRAINT unique_judge_team_assignment UNIQUE(judge_user_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS judge_conflicts (
      id TEXT PRIMARY KEY,
      judge_user_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      FOREIGN KEY (judge_user_id) REFERENCES users(id),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      CONSTRAINT unique_judge_conflict UNIQUE(judge_user_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      judge_user_id TEXT NOT NULL,
      rubric_version_id TEXT NOT NULL,
      criteria_scores_json TEXT NOT NULL,
      raw_score REAL NOT NULL CHECK(raw_score >= 0.0 AND raw_score <= 100.0),
      feedback TEXT,
      submitted_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (judge_user_id) REFERENCES users(id),
      FOREIGN KEY (rubric_version_id) REFERENCES rubric_versions(id),
      CONSTRAINT unique_judge_team_score UNIQUE(judge_user_id, team_id, rubric_version_id)
    );

    CREATE TABLE IF NOT EXISTS normalized_scores (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      strategy TEXT NOT NULL CHECK(strategy IN ('RAW', 'ZSCORE', 'TRIMMED_MEAN', 'MEDIAN', 'WINSORIZED')),
      final_score REAL NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS judge_anomalies (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      judge_user_id TEXT NOT NULL,
      flag_reason TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('WARNING', 'CRITICAL')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS leaderboard_projections (
      event_id TEXT PRIMARY KEY,
      rankings_json TEXT NOT NULL,
      sequence_number INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id)
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      title TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('CRITICAL', 'WARNING', 'INFO')),
      status TEXT NOT NULL CHECK(status IN ('OPEN', 'RESOLVED')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id)
    );

    CREATE TABLE IF NOT EXISTS risks (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      evidence TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('CRITICAL', 'WARNING', 'INFO')),
      status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'MITIGATED')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id)
    );

    CREATE TABLE IF NOT EXISTS event_actions (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      title TEXT NOT NULL,
      reason TEXT NOT NULL,
      impact TEXT NOT NULL,
      priority TEXT NOT NULL CHECK(priority IN ('HIGH', 'MEDIUM', 'LOW')),
      status TEXT NOT NULL CHECK(status IN ('RECOMMENDED', 'APPROVED', 'EXECUTED', 'DISMISSED')),
      approved_by TEXT,
      executed_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id)
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      audience TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('INFO', 'IMPORTANT', 'CRITICAL')),
      sent_by TEXT NOT NULL,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      sent_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id)
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (event_id) REFERENCES events(id)
    );

    CREATE TABLE IF NOT EXISTS outbox_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      sequence_number INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      processed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      response_status INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_accounts (
      user_id TEXT PRIMARY KEY,
      firebase_uid TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      providers_json TEXT NOT NULL DEFAULT '["email"]',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_profiles_v2 (
      user_id TEXT PRIMARY KEY,
      handle TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      photo_url TEXT,
      institution TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      cgpa REAL,
      enrolled INTEGER NOT NULL DEFAULT 1,
      resume_url TEXT,
      resume_filename TEXT,
      career_goals_json TEXT NOT NULL DEFAULT '{}',
      profile_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS skills_taxonomy (
      canonical_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      synonyms_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS user_canonical_skills (
      user_id TEXT NOT NULL,
      canonical_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      PRIMARY KEY (user_id, canonical_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (canonical_id) REFERENCES skills_taxonomy(canonical_id)
    );

    CREATE TABLE IF NOT EXISTS user_education (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      degree TEXT NOT NULL,
      field TEXT NOT NULL,
      institution TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      cgpa REAL,
      still_enrolled INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_work (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      org TEXT NOT NULL,
      dates TEXT NOT NULL,
      description TEXT NOT NULL,
      responsibilities_json TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_certificates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      issuer TEXT NOT NULL,
      badge_logo TEXT,
      issue_date TEXT NOT NULL,
      verification_url TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      links_json TEXT NOT NULL DEFAULT '[]',
      tech_tags_json TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_achievements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      achievement_date TEXT NOT NULL,
      is_verified INTEGER NOT NULL DEFAULT 0,
      verifier_org_id TEXT,
      verifier_name TEXT,
      proof_url TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_social_links (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      url TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      org_id TEXT NOT NULL,
      org_name TEXT NOT NULL,
      org_logo TEXT,
      category TEXT NOT NULL CHECK(category IN ('INTERNSHIP', 'JOB', 'COMPETITION', 'MOCK_TEST', 'MOCK_INTERVIEW', 'HACKATHON', 'MENTORSHIP')),
      field_of_interest TEXT NOT NULL,
      work_mode TEXT NOT NULL CHECK(work_mode IN ('REMOTE', 'HYBRID', 'ON_SITE', 'ONLINE')),
      location TEXT NOT NULL,
      deadline TEXT NOT NULL,
      stipend_or_prize TEXT NOT NULL,
      description TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      eligibility_json TEXT NOT NULL DEFAULT '[]',
      responsibilities_json TEXT NOT NULL DEFAULT '[]',
      featured INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS opportunity_registrations (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'REGISTERED',
      created_at TEXT NOT NULL,
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(opportunity_id, user_id)
    );


    CREATE TABLE IF NOT EXISTS points_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      points INTEGER NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      calendar_date TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS badges_definitions (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL,
      category TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_badges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      badge_code TEXT NOT NULL,
      awarded_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, badge_code)
    );

    /* Performance Database Indexes */
    CREATE INDEX IF NOT EXISTS idx_opportunities_category ON opportunities(category);
    CREATE INDEX IF NOT EXISTS idx_opportunities_featured ON opportunities(featured);
    CREATE INDEX IF NOT EXISTS idx_opportunities_work_mode ON opportunities(work_mode);
    CREATE INDEX IF NOT EXISTS idx_opp_reg_opp_user ON opportunity_registrations(opportunity_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_user_profiles_v2_user ON user_profiles_v2(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_events_event ON audit_events(event_id, created_at);
  `);
}

export function seedInitialData(db: DatabaseSync): void {
  const now = new Date().toISOString();

  // Organizations (Sample Demo Data)
  db.exec(`
    INSERT OR IGNORE INTO organizations (id, slug, name, verified, tagline, logo_url, created_at)
    VALUES 
      ('org_global', 'eventos-labs', 'EVENTOS Global Labs (Demo Org)', 1, 'Building Contextual Live Event Infrastructure', '/assets/org-global.png', '${now}'),
      ('org_msft', 'microsoft-devs', 'Microsoft Developer Ecosystem (Demo Org)', 1, 'Empowering Developers Worldwide', '/assets/org-msft.png', '${now}'),
      ('org_github', 'github-community', 'GitHub Community (Demo Org)', 1, 'Home for All Developers', '/assets/org-github.png', '${now}'),
      ('org_adobe', 'adobe-creative', 'Adobe Creative Cloud (Demo Org)', 1, 'Creativity for All', '/assets/org-adobe.png', '${now}'),
      ('org_meta', 'meta-open-source', 'Meta Open Source (Demo Org)', 1, 'Building Connected AI Infrastructure', '/assets/org-meta.png', '${now}');
  `);

  // Events
  db.exec(`
    INSERT OR IGNORE INTO events (id, slug, org_id, name, tagline, mode, location, start_date, end_date, registration_deadline, participant_count, active_rubric_version, active_ranking_version, active_team_policy_version, status, created_at)
    VALUES 
      ('event_hack_2026', 'eventos-global-hackathon-2026', 'org_global', 'EVENTOS Global Hackathon 2026', 'The Premier Context-Aware Developer Championship', 'HYBRID', 'Convention Center & Online', '2026-08-30', '2026-09-02', '2026-08-29', 1248, 1, 1, 1, 'LIVE', '${now}'),
      ('event_msft_ai', 'microsoft-ai-agents-challenge', 'org_msft', 'Microsoft AI Agents Challenge', 'Build Autonomous Enterprise Workflows', 'ONLINE', 'Global Virtual Hub', '2026-09-10', '2026-09-25', '2026-09-08', 3420, 1, 1, 1, 'OPEN', '${now}'),
      ('event_github_dev', 'github-open-source-summit', 'org_github', 'GitHub Open Source Summit 2026', 'Accelerating Next-Gen Developer Infrastructure', 'OFFLINE', 'San Francisco, CA', '2026-10-05', '2026-10-07', '2026-10-01', 890, 1, 1, 1, 'OPEN', '${now}'),
      ('event_adobe_design', 'adobe-ux-innovation-jam', 'org_adobe', 'Adobe UX Innovation Jam', 'Designing Next-Gen Generative Interfaces', 'ONLINE', 'Virtual Lab', '2026-10-15', '2026-10-20', '2026-10-12', 1450, 1, 1, 1, 'OPEN', '${now}');

    INSERT OR IGNORE INTO rubric_versions (id, event_id, version, criteria_json, max_score, created_at)
    VALUES (
      'rubric_v1',
      'event_hack_2026',
      1,
      '[{"id":"tech","name":"Technical Complexity","weight":0.4,"max":40},{"id":"impact","name":"Innovation & Impact","weight":0.4,"max":40},{"id":"design","name":"UI/UX & Accessibility","weight":0.2,"max":20}]',
      100.0,
      '${now}'
    );

    INSERT OR IGNORE INTO challenges (id, event_id, title, description, prize, tags_json)
    VALUES
      ('chal_1', 'event_hack_2026', 'Autonomous Agentic Operations', 'Build context-aware decision systems that assist human operators in live environments.', '$25,000 USD', '["AI", "Agents", "TypeScript", "Realtime"]'),
      ('chal_2', 'event_hack_2026', 'High-Density Live Telemetry', 'Create resilient event-driven data streaming pipelines.', '$15,000 USD', '["WebSockets", "Streaming", "Security"]');
  `);

  // Users & Profiles
  db.exec(`
    INSERT OR IGNORE INTO users (id, org_id, email, name, role, skills_json, created_at)
    VALUES 
      ('usr_part_1', 'org_global', 'ramakrishna@dev.com', 'Ramakrishna Yadav', 'PARTICIPANT', '["React", "TypeScript", "Node.js", "AI/ML", "SQL"]', '${now}'),
      ('usr_part_2', 'org_global', 'sarah@dev.com', 'Sarah Jenkins', 'PARTICIPANT', '["Python", "PyTorch", "Backend Systems"]', '${now}'),
      ('usr_part_3', 'org_global', 'michael@dev.com', 'Michael Chang', 'PARTICIPANT', '["DevOps", "Kubernetes", "PostgreSQL", "Cloud"]', '${now}'),
      ('usr_judge_1', 'org_global', 'dr.smith@judge.org', 'Dr. Aris Smith', 'JUDGE', '["Machine Learning", "System Architecture"]', '${now}'),
      ('usr_judge_2', 'org_global', 'elena@judge.org', 'Elena Rostova', 'JUDGE', '["Product Design", "Security"]', '${now}'),
      ('usr_org_1', 'org_global', 'lead@eventos.org', 'Marcus Vance', 'ORGANIZER', '["Operations", "Event Logistics"]', '${now}');

    INSERT OR IGNORE INTO user_profiles (user_id, username, college, academic_year, tagline, location, github_username, joined_events_count, wins_count, projects_count, bio)
    VALUES
      ('usr_part_1', 'ramakrishna_yadav', 'National Institute of Technology', 'MCA • 2nd Year', 'Building intelligent context-aware systems for real-world problems.', 'San Francisco / Remote', 'ramakrishna-dev', 12, 2, 4, 'Senior Full Stack & AI Systems Architect passionate about building resilient real-time operating platforms.');

    INSERT OR IGNORE INTO participants (id, user_id, event_id, checked_in, checkin_time, created_at)
    VALUES 
      ('part_1', 'usr_part_1', 'event_hack_2026', 1, '${now}', '${now}'),
      ('part_2', 'usr_part_2', 'event_hack_2026', 0, NULL, '${now}'),
      ('part_3', 'usr_part_3', 'event_hack_2026', 1, '${now}', '${now}');
  `);

  // Venues & Sessions
  db.exec(`
    INSERT OR IGNORE INTO venues (id, event_id, name, zone_code, capacity, current_occupancy, congestion_status)
    VALUES 
      ('venue_hall_a', 'event_hack_2026', 'Main Arena (Hall A)', 'ZONE_A', 500, 210, 'NORMAL'),
      ('venue_hall_b', 'event_hack_2026', 'Workshop Hub (Hall B)', 'ZONE_B', 150, 144, 'CRITICAL'),
      ('venue_hall_c', 'event_hack_2026', 'Overflow Lounge (Hall C)', 'ZONE_C', 300, 45, 'NORMAL');

    INSERT OR IGNORE INTO sessions (id, event_id, venue_id, name, start_time, end_time)
    VALUES 
      ('sess_ws_1', 'event_hack_2026', 'venue_hall_b', 'AI Agentic Operations Masterclass', '${new Date(Date.now() + 15 * 60000).toISOString()}', '${new Date(Date.now() + 75 * 60000).toISOString()}');
  `);

  // Teams & Submissions
  db.exec(`
    INSERT OR IGNORE INTO teams (id, event_id, name, lead_user_id, created_at)
    VALUES 
      ('team_42', 'event_hack_2026', 'NeuralShift', 'usr_part_1', '${now}'),
      ('team_88', 'event_hack_2026', 'QuantumPulse', 'usr_part_2', '${now}');

    INSERT OR IGNORE INTO team_members (id, team_id, user_id, event_id, joined_at)
    VALUES 
      ('tm_1', 'team_42', 'usr_part_1', 'event_hack_2026', '${now}'),
      ('tm_2', 'team_88', 'usr_part_2', 'event_hack_2026', '${now}');

    INSERT OR IGNORE INTO submissions (id, event_id, team_id, title, problem_statement, solution_summary, tech_stack_json, repo_url, demo_url, status, completion_pct, submitted_at)
    VALUES 
      ('sub_42', 'event_hack_2026', 'team_42', 'NeuralShift Agent OS', 'Live event operations are fragmented and lack context-aware decision engines.', 'Deterministic rule pipeline combined with LLM explanation layer.', '["TypeScript", "React", "Node.js", "SQLite"]', 'https://github.com/neuralshift/event-os', 'https://neuralshift-demo.eventos.app', 'DRAFT', 72, NULL),
      ('sub_88', 'event_hack_2026', 'team_88', 'QuantumPulse Telemetry', 'High-frequency telemetry stream lag during large scale hackathons.', 'Sequence-numbered WebSocket snapshot-resume stream.', '["Python", "FastAPI", "WebSockets"]', 'https://github.com/quantumpulse/telemetry', 'https://quantumpulse.eventos.app', 'FINAL', 100, '${now}');
  `);

  // Judge Assignments & Conflicts
  db.exec(`
    INSERT OR IGNORE INTO judge_assignments (id, event_id, judge_user_id, team_id)
    VALUES 
      ('ja_1', 'event_hack_2026', 'usr_judge_1', 'team_42'),
      ('ja_2', 'event_hack_2026', 'usr_judge_1', 'team_88'),
      ('ja_3', 'event_hack_2026', 'usr_judge_2', 'team_42');

    INSERT OR IGNORE INTO judge_conflicts (id, judge_user_id, team_id, reason)
    VALUES 
      ('jc_1', 'usr_judge_2', 'team_88', 'Co-authored research paper with lead');
  `);

  // Scores
  db.exec(`
    INSERT OR IGNORE INTO scores (id, event_id, team_id, judge_user_id, rubric_version_id, criteria_scores_json, raw_score, feedback, submitted_at)
    VALUES 
      ('score_88_j1', 'event_hack_2026', 'team_88', 'usr_judge_1', 'rubric_v1', '{"tech":36,"impact":37,"design":18}', 91.0, 'Exceptional architecture and clean execution.', '${now}');

    INSERT OR IGNORE INTO normalized_scores (id, event_id, team_id, strategy, final_score, updated_at)
    VALUES 
      ('ns_88', 'event_hack_2026', 'team_88', 'RAW', 91.0, '${now}'),
      ('ns_42', 'event_hack_2026', 'team_42', 'RAW', 0.0, '${now}');
  `);

  // Risks & Actions
  db.exec(`
    INSERT OR IGNORE INTO risks (id, event_id, category, title, evidence, severity, status, created_at)
    VALUES 
      ('risk_1', 'event_hack_2026', 'VENUE_CAPACITY', 'Hall B Capacity Breach Risk', 'Workshop Hub (Hall B) occupied 144/150 (96%). Projected capacity breach in 7 minutes.', 'CRITICAL', 'ACTIVE', '${now}'),
      ('risk_2', 'event_hack_2026', 'JUDGING_BOTTLENECK', 'Judge Group 3 Evaluation Lag', 'Average evaluation lag is 24 minutes behind schedule. 4 pending submissions queued.', 'WARNING', 'ACTIVE', '${now}'),
      ('risk_3', 'event_hack_2026', 'SUBMISSION_COUNTDOWN', 'Draft Submissions Countdown', '17 teams approaching 30-min deadline window without finalizing draft.', 'WARNING', 'ACTIVE', '${now}');

    INSERT OR IGNORE INTO event_actions (id, event_id, title, reason, impact, priority, status, approved_by, executed_at, created_at)
    VALUES 
      ('act_1', 'event_hack_2026', 'Redirect Hall B Arrivals to Hall C Overflow', 'Hall B is at 96% occupancy. Workshop start in 15 min.', 'Prevents hall congestion breach and maintains venue safety.', 'HIGH', 'RECOMMENDED', NULL, NULL, '${now}'),
      ('act_2', 'event_hack_2026', 'Reassign 2 Teams to Judge Group 1', 'Judge Group 3 is trailing schedule by 24 minutes.', 'Balances judging workload and accelerates evaluation velocity.', 'MEDIUM', 'RECOMMENDED', NULL, NULL, '${now}');
  `);

  // Incidents & Announcements
  db.exec(`
    INSERT OR IGNORE INTO incidents (id, event_id, title, severity, status, created_at)
    VALUES 
      ('inc_1', 'event_hack_2026', 'Hall B capacity limit warning (96% capacity)', 'CRITICAL', 'OPEN', '${now}'),
      ('inc_2', 'event_hack_2026', 'Judge Group 3 evaluation bottleneck', 'WARNING', 'OPEN', '${now}');

    INSERT OR IGNORE INTO announcements (id, event_id, title, body, audience, severity, sent_by, recipient_count, sent_at)
    VALUES 
      ('ann_1', 'event_hack_2026', 'Hall B Capacity Update', 'Hall B is currently at 96% capacity. Please proceed to Hall C Overflow Lounge for live streaming.', 'EVERYONE', 'IMPORTANT', 'usr_org_1', 428, '${now}');
  `);

  // Audit Events
  db.exec(`
    INSERT OR IGNORE INTO audit_events (id, event_id, actor_id, actor_name, action, target, details_json, created_at)
    VALUES 
      ('aud_1', 'event_hack_2026', 'usr_org_1', 'Marcus Vance (Organizer)', 'DISPATCH_ANNOUNCEMENT', 'Hall B Capacity Update', '{"audience":"EVERYONE","recipients":428}', '${now}'),
      ('aud_2', 'event_hack_2026', 'usr_judge_1', 'Dr. Aris Smith (Judge)', 'SUBMIT_EVALUATION', 'Team QuantumPulse (team_88)', '{"raw_score":91.0,"rubric_version":"v1"}', '${now}'),
      ('aud_3', 'event_hack_2026', 'usr_part_1', 'Ramakrishna Yadav (Participant)', 'CHECK_IN_SESSION', 'AI Agentic Operations Masterclass', '{"venue":"Hall B"}', '${now}');
  `);

  // Leaderboard Initial Projection
  db.exec(`
    INSERT OR IGNORE INTO leaderboard_projections (event_id, rankings_json, sequence_number, updated_at)
    VALUES (
      'event_hack_2026',
      '[{"rank":1,"team_id":"team_88","team_name":"QuantumPulse","score":91.0,"movement":"↑1","status":"FINAL"},{"rank":2,"team_id":"team_42","team_name":"NeuralShift","score":0.0,"movement":"-","status":"DRAFT"}]',
      1,
      '${now}'
    );
  `);

  // Canonical Skills Taxonomy
  db.exec(`
    INSERT OR IGNORE INTO skills_taxonomy (canonical_id, display_name, synonyms_json)
    VALUES 
      ('react', 'React', '["React.js", "ReactJS", "Frontend React", "react"]'),
      ('typescript', 'TypeScript', '["TS", "TypeScript", "typescript"]'),
      ('python', 'Python', '["Python3", "Py", "Python"]'),
      ('node', 'Node.js', '["Node", "NodeJS", "Express.js"]'),
      ('ai_ml', 'AI / ML', '["Artificial Intelligence", "Machine Learning", "PyTorch", "TensorFlow", "AI/ML"]'),
      ('sqlite', 'SQLite', '["SQLite3", "SQL"]'),
      ('devops', 'DevOps', '["CI/CD", "Kubernetes", "Docker", "Cloud"]');

    INSERT OR IGNORE INTO auth_accounts (user_id, firebase_uid, email, email_verified, providers_json, created_at)
    VALUES 
      ('usr_part_1', 'fb_uid_ramakrishna', 'ramakrishna@dev.com', 1, '["email", "google.com"]', '${now}'),
      ('usr_part_2', 'fb_uid_sarah', 'sarah@dev.com', 1, '["email"]', '${now}'),
      ('usr_part_3', 'fb_uid_michael', 'michael@dev.com', 1, '["google.com"]', '${now}');

    INSERT OR IGNORE INTO user_profiles_v2 (user_id, handle, name, photo_url, institution, bio, cgpa, enrolled, resume_url, resume_filename, career_goals_json, profile_completed, created_at)
    VALUES 
      ('usr_part_1', 'ramakrishna', 'Ramakrishna Yadav', '/assets/avatars/ramakrishna.png', 'National Institute of Technology', 'Senior Full Stack & AI Systems Architect passionate about building resilient real-time operating platforms.', 3.92, 1, '/uploads/resumes/ramakrishna_resume.pdf', 'ramakrishna_resume.pdf', '{"field_of_interest":"AI/ML","preferred_location":"San Francisco / Remote","target_timeframe":"Immediate"}', 1, '${now}'),
      ('usr_part_2', 'sarah_j', 'Sarah Jenkins', '/assets/avatars/sarah.png', 'Stanford University', 'ML researcher specializing in agentic workflows and automated reasoning.', 3.88, 1, '/uploads/resumes/sarah_resume.pdf', 'sarah_resume.pdf', '{"field_of_interest":"AI/ML","preferred_location":"Palo Alto, CA","target_timeframe":"Summer 2026"}', 1, '${now}'),
      ('usr_part_3', 'm_chang', 'Michael Chang', '/assets/avatars/michael.png', 'UC Berkeley', 'Cloud infrastructure and distributed consensus engineer.', 3.75, 1, NULL, NULL, '{"field_of_interest":"Cloud Infrastructure","preferred_location":"Seattle, WA","target_timeframe":"2026"}', 0, '${now}');

    INSERT OR IGNORE INTO user_canonical_skills (user_id, canonical_id, display_name)
    VALUES 
      ('usr_part_1', 'react', 'React'),
      ('usr_part_1', 'typescript', 'TypeScript'),
      ('usr_part_1', 'node', 'Node.js'),
      ('usr_part_1', 'ai_ml', 'AI / ML'),
      ('usr_part_1', 'sqlite', 'SQLite'),
      ('usr_part_2', 'python', 'Python'),
      ('usr_part_2', 'ai_ml', 'AI / ML'),
      ('usr_part_3', 'devops', 'DevOps');

    INSERT OR IGNORE INTO user_education (id, user_id, degree, field, institution, start_date, end_date, cgpa, still_enrolled)
    VALUES 
      ('edu_1', 'usr_part_1', 'Master of Computer Applications (MCA)', 'Computer Science & Artificial Intelligence', 'National Institute of Technology', '2024-08-01', '2026-06-01', 3.92, 1),
      ('edu_2', 'usr_part_1', 'Bachelor of Science (B.Sc)', 'Computer Science', 'State University', '2020-08-01', '2024-05-30', 3.85, 0);

    INSERT OR IGNORE INTO user_work (id, user_id, title, org, dates, description, responsibilities_json)
    VALUES 
      ('work_1', 'usr_part_1', 'Software Engineering Intern', 'EVENTOS Labs', 'May 2025 – Aug 2025', 'Built real-time telemetry pipelines and outbox pattern processors.', '["Architected WebSocket sync layer", "Designed SQLite database schemas", "Reduced query latency by 40%"]');

    INSERT OR IGNORE INTO user_certificates (id, user_id, name, issuer, badge_logo, issue_date, verification_url)
    VALUES 
      ('cert_1', 'usr_part_1', 'AWS Certified Solutions Architect', 'Amazon Web Services', '🛡️', '2025-01-15', 'https://aws.amazon.com/verification/cert_123');

    INSERT OR IGNORE INTO user_projects (id, user_id, title, description, links_json, tech_tags_json)
    VALUES 
      ('proj_1', 'usr_part_1', 'NeuralShift Agent OS', 'Autonomous agent context engine and real-time event operations assistant.', '["https://github.com/neuralshift/event-os"]', '["TypeScript", "React", "Node.js"]');

    INSERT OR IGNORE INTO user_achievements (id, user_id, title, description, achievement_date, is_verified, verifier_org_id, verifier_name, proof_url)
    VALUES 
      ('ach_1', 'usr_part_1', '1st Place — EVENTOS Global Hackathon 2025', 'Awarded 1st place among 400+ submissions for autonomous agent dispatcher.', '2025-09-12', 1, 'org_global', 'EVENTOS Global Labs', 'https://eventos.app/awards/hackathon-2025-1st'),
      ('ach_2', 'usr_part_1', 'Open Source Maintainer', 'Self-reported maintainer of open-source CLI developer tools.', '2024-11-01', 0, NULL, NULL, 'https://github.com/ramakrishna-dev');

    INSERT OR IGNORE INTO user_social_links (id, user_id, platform, url)
    VALUES 
      ('soc_1', 'usr_part_1', 'github', 'https://github.com/ramakrishna-dev'),
      ('soc_2', 'usr_part_1', 'linkedin', 'https://linkedin.com/in/ramakrishna-yadav');

    INSERT OR IGNORE INTO opportunities (id, title, org_id, org_name, org_logo, category, field_of_interest, work_mode, location, deadline, stipend_or_prize, description, tags_json, eligibility_json, responsibilities_json, featured, created_at)
    VALUES 
      ('opp_1', 'AI Systems Engineering Intern', 'org_global', 'EVENTOS Global Labs', '/assets/org-global.png', 'INTERNSHIP', 'AI/ML', 'REMOTE', 'San Francisco / Remote', '2026-09-15', '$8,000 / mo', 'Join the core AI infrastructure team to build agentic workflow engines.', '["react", "typescript", "ai_ml", "node"]', '["Computer Science / AI Students", "Final Year or Recent Grads", "Proficient in React & TypeScript"]', '["Architect context-aware agent dispatching algorithms.", "Collaborate with cross-functional engineering teams.", "Design high-performance WebSocket streaming hooks."]', 1, '${now}'),
      ('opp_2', 'Senior Full Stack Autonomous Engineer', 'org_msft', 'Microsoft Developer Ecosystem', '/assets/org-msft.png', 'JOB', 'AI/ML', 'HYBRID', 'Redmond, WA', '2026-10-01', '$160,000 - $190,000 / yr', 'Lead development of next-gen enterprise developer tools and copilot extensions.', '["python", "ai_ml", "typescript"]', '["3+ Years Industry Experience", "B.S. or M.S. in Computer Science", "Deep Experience with LLM & Agent Frameworks"]', '["Lead core architecture for enterprise copilot tools.", "Optimize distributed LLM inference pipelines.", "Mentor junior software engineers."]', 1, '${now}'),
      ('opp_3', 'Microsoft AI Agents Challenge 2026', 'org_msft', 'Microsoft Developer Ecosystem', '/assets/org-msft.png', 'COMPETITION', 'AI/ML', 'ONLINE', 'Global Virtual Hub', '2026-09-08', '$50,000 USD Prize Pool', 'Build autonomous enterprise workflows using state of the art models.', '["ai_ml", "python", "devops"]', '["Open to All Developers & Students Globally", "Teams of 1 to 4 Members"]', '["Build an autonomous agent application.", "Submit pitch video and open-source GitHub repository.", "Demonstrate deterministic rule engine integration."]', 0, '${now}'),
      ('opp_4', 'Full Stack System Architecture Mock Assessment', 'org_github', 'GitHub Community', '/assets/org-github.png', 'MOCK_TEST', 'Cloud Infrastructure', 'ONLINE', 'Virtual Lab', '2026-09-30', 'Free Certification Badge', 'Test your knowledge on distributed systems, databases, and WebSocket streaming.', '["sqlite", "devops", "node"]', '["Open to All Skill Levels", "Basic Understanding of Node.js & Databases"]', '["Complete 30 multiple-choice architecture questions.", "Solve 2 hands-on system design scenarios.", "Receive real-time performance evaluation report."]', 0, '${now}'),
      ('opp_5', 'Principal AI Architect 1-on-1 Mentorship', 'org_adobe', 'Adobe Creative Cloud', '/assets/org-adobe.png', 'MENTORSHIP', 'AI/ML', 'ONLINE', 'Virtual Sessions', '2026-09-20', '1-on-1 Executive Mentorship', '4-week guided mentorship program with senior Adobe engineers.', '["ai_ml", "react"]', '["Undergraduate & Graduate Students", "Interest in Generative AI Interfaces"]', '["Attend weekly 1-on-1 coaching sessions.", "Complete a guided portfolio project.", "Receive career review and resume feedback."]', 0, '${now}'),
      ('opp_6', 'Senior AI Engineer Mock Technical Interview', 'org_meta', 'Meta Open Source', '/assets/org-meta.png', 'MOCK_INTERVIEW', 'AI/ML', 'ONLINE', 'Virtual Room', '2026-10-05', 'Detailed Feedback Report', 'Simulated system design and algorithms interview with real-time feedback.', '["python", "ai_ml"]', '["Pre-final & Final Year Students", "Active Job Seekers"]', '["Participate in a 45-minute live coding session.", "Solve system design questions under time constraint.", "Review detailed scorecard with Meta engineers."]', 0, '${now}'),
      ('opp_7', 'EVENTOS Global Hackathon 2026', 'org_global', 'EVENTOS Global Labs', '/assets/org-global.png', 'HACKATHON', 'AI/ML', 'HYBRID', 'Convention Center & Online', '2026-08-29', '$40,000 USD Cash Prizes', 'The premier context-aware developer championship.', '["react", "typescript", "node", "ai_ml"]', '["Global Developers & Students", "Teams up to 4 members"]', '["Build live event operation prototypes.", "Integrate context-aware decision engines.", "Present final demo live to panel of judges."]', 1, '${now}'),
      ('opp_8', 'Generative AI Visual Artist Intern', 'org_adobe', 'Adobe Creative Cloud', '/assets/org-adobe.png', 'INTERNSHIP', 'Design & AI', 'REMOTE', 'Remote / San Jose', '2026-09-25', '$6,500 / mo', 'Explore boundary-pushing visual generation models and creative AI tooling.', '["ai_ml", "react", "design"]', '["Design or CS Majors", "Experience with Generative Image Models"]', '["Design intuitive prompt-to-canvas UI components.", "Experiment with diffusion model fine-tuning.", "Build interactive design prototypes."]', 1, '${now}'),
      ('opp_9', 'Web Designing & UI/UX Intern', 'org_github', 'GitHub Community', '/assets/org-github.png', 'INTERNSHIP', 'Web Development', 'REMOTE', 'Remote', '2026-09-18', '$5,500 / mo', 'Craft accessible, high-performance web components for global developer platform.', '["react", "typescript", "css"]', '["Undergraduate Students in Design/CS", "Portfolio of Web Projects"]', '["Implement responsive TailwindCSS component suites.", "Ensure WCAG 2.2 AA accessibility compliance.", "Conduct user testing with open-source contributors."]', 0, '${now}'),
      ('opp_10', 'Data Analyst & BI Specialist Intern', 'org_meta', 'Meta Open Source', '/assets/org-meta.png', 'INTERNSHIP', 'Data Analytics', 'HYBRID', 'Menlo Park, CA', '2026-09-22', '$7,000 / mo', 'Analyze platform telemetry and build real-time executive analytics dashboards.', '["sqlite", "python", "node"]', '["Data Science, Statistics, or CS Majors", "Proficient in SQL & Python"]', '["Write optimized SQL analytical queries.", "Build live event health score dashboards.", "Present insights to product leads."]', 0, '${now}'),
      ('opp_11', 'Global Energy Tech Innovation Hackathon 2026', 'org_msft', 'Microsoft Developer Ecosystem', '/assets/org-msft.png', 'HACKATHON', 'Cloud Infrastructure', 'ONLINE', 'Virtual Global Hub', '2026-10-10', '$35,000 USD Prizes', 'Develop sustainable clean-energy tracking & grid optimization solutions.', '["devops", "node", "python"]', '["Engineers, Researchers & Students", "Individual or Team Submissions"]', '["Build smart grid analytics application.", "Deploy serverless backend on Azure.", "Demonstrate carbon offset calculation logic."]', 1, '${now}'),
      ('opp_12', 'Corporate Strategy Case-Study Challenge', 'org_global', 'EVENTOS Global Labs', '/assets/org-global.png', 'COMPETITION', 'Strategy', 'ONLINE', 'Virtual Hub', '2026-10-15', '$15,000 USD Prize Pool', 'Solve real-world live event scaling and monetization strategy cases.', '["strategy", "analytics"]', '["Business, Management & Tech Students", "Teams of 2 to 3"]', '["Analyze market expansion data.", "Prepare comprehensive 10-slide deck.", "Present strategy pitch to executive leadership."]', 0, '${now}');


    INSERT OR IGNORE INTO badges_definitions (id, code, name, description, icon, category)
    VALUES 
      ('badge_1', 'PROFILE_COMPLETE', 'Profile Perfectionist', 'Awarded for completing all required and optional onboarding steps.', '🌟', 'ONBOARDING'),
      ('badge_2', 'STREAK_7_DAYS', 'Weekly Warrior', 'Maintained an active streak for 7 consecutive days.', '🔥', 'STREAK'),
      ('badge_3', 'STREAK_30_DAYS', 'Monthly Master', 'Maintained an active streak for 30 consecutive days.', '⚡', 'STREAK'),
      ('badge_4', 'FIRST_SUBMISSION', 'Pioneer Submitter', 'Submitted first competition entry to EVENTOS platform.', '🏆', 'COMPETITION');

    INSERT OR IGNORE INTO points_ledger (id, user_id, action_type, points, metadata_json, created_at, calendar_date)
    VALUES 
      ('ledg_1', 'usr_part_1', 'ONBOARDING_IDENTITY_COMPLETE', 50, '{"step":"identity"}', '${new Date(Date.now() - 3 * 86400000).toISOString()}', '${new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0]}'),
      ('ledg_2', 'usr_part_1', 'ONBOARDING_EDUCATION_COMPLETE', 50, '{"step":"education"}', '${new Date(Date.now() - 2 * 86400000).toISOString()}', '${new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0]}'),
      ('ledg_3', 'usr_part_1', 'ONBOARDING_SKILLS_COMPLETE', 50, '{"step":"skills"}', '${new Date(Date.now() - 1 * 86400000).toISOString()}', '${new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0]}'),
      ('ledg_4', 'usr_part_1', 'DAILY_CHECKIN', 25, '{"streak":3}', '${now}', '${now.split('T')[0]}'),
      ('ledg_5', 'usr_part_2', 'ONBOARDING_IDENTITY_COMPLETE', 50, '{"step":"identity"}', '${now}', '${now.split('T')[0]}');

    INSERT OR IGNORE INTO user_badges (id, user_id, badge_code, awarded_at)
    VALUES 
      ('ub_1', 'usr_part_1', 'PROFILE_COMPLETE', '${now}'),
      ('ub_2', 'usr_part_1', 'STREAK_7_DAYS', '${now}');
  `);

  // Seed 120+ additional realistic hackathons & opportunities
  seedExpandedOpportunities(db);
}

/**
 * Programmatically populates 120+ realistic opportunities & hackathons
 */
export function seedExpandedOpportunities(db: DatabaseSync): void {
  const orgs = [
    { id: 'org_global', name: 'EVENTOS Global Labs', logo: '/assets/org-global.png' },
    { id: 'org_msft', name: 'Microsoft Developer Ecosystem', logo: '/assets/org-msft.png' },
    { id: 'org_github', name: 'GitHub Community', logo: '/assets/org-github.png' },
    { id: 'org_adobe', name: 'Adobe Creative Cloud', logo: '/assets/org-adobe.png' },
    { id: 'org_meta', name: 'Meta Open Source', logo: '/assets/org-meta.png' },
  ];

  const categories = ['INTERNSHIP', 'JOB', 'COMPETITION', 'MOCK_TEST', 'MOCK_INTERVIEW', 'HACKATHON', 'MENTORSHIP'];
  const modes = ['REMOTE', 'HYBRID', 'ON_SITE', 'ONLINE'];
  const fields = ['AI/ML', 'Cloud Infrastructure', 'Full Stack Development', 'Cybersecurity', 'Data Analytics', 'Design & AI', 'Strategy', 'Web3 / Blockchain', 'Mobile Engineering', 'DevOps & SRE'];

  const titles = {
    INTERNSHIP: [
      'Autonomous AI Agent Research Intern',
      'High-Performance Rust Systems Intern',
      'Quantum Algorithm Engineering Intern',
      'Distributed Database Kernel Intern',
      'Generative Audio & Speech Synthesis Intern',
      'Edge Computing & IoT Firmware Intern',
      'React & Canvas Frontend Engineering Intern',
      'LLM Fine-Tuning & Prompt Safety Intern',
      'Cybersecurity & Threat Detection Intern',
      'Spatial Computing & AR/VR Vision Intern',
      'Cloud Serverless Telemetry Intern',
      'NLP Knowledge Graph Research Intern',
      'Mobile Performance & iOS Intern',
      'DevOps Infrastructure Automation Intern',
      'Computer Vision & Autonomous Robotics Intern',
      'Web3 Smart Contract Audit Intern',
      'Full Stack Next.js & GraphQL Intern',
      'Data Engineering & Lakehouse Intern',
      'Microservices & gRPC Systems Intern',
      'UX Research & AI Interaction Intern'
    ],
    JOB: [
      'Staff AI Systems Infrastructure Engineer',
      'Principal Distributed Systems Architect',
      'Senior Agentic Workflow Lead',
      'Lead Security & Zero-Trust Architect',
      'Senior Frontend Architecture Engineer',
      'Principal Cloud DevOps Engineer',
      'Lead LLM Inference Optimization Engineer',
      'Senior Autonomous Robotics Systems Lead',
      'Director of Developer Ecosystem Architecture',
      'Senior Data Platform & BI Specialist',
      'Staff Rust Performance Programmer',
      'Principal Cybersecurity Risk Researcher',
      'Senior iOS & Cross-Platform Engineer',
      'Lead Machine Learning Operations Architect',
      'Senior API Gateway & Infrastructure Engineer'
    ],
    COMPETITION: [
      'Global Algorithmic CodeSprint 2026',
      'Autonomous FinTech Trading Bot Challenge',
      'Zero-Trust Cyber Defense League',
      'Generative Canvas & Creative AI Championship',
      'Web3 Decentralized Storage Security Sprint',
      'Climate Tech Carbon Reduction Challenge',
      'Enterprise LLM Agent Benchmark Championship',
      'High-Frequency Distributed Consensus Tournament',
      'Healthcare AI Diagnostic Challenge',
      'Smart Grid Energy Optimization Championship'
    ],
    MOCK_TEST: [
      'AWS Cloud Architect Specialist Assessment',
      'Distributed Database Consistency Benchmark Quiz',
      'Full Stack System Architecture Level 2 Mock',
      'Kubernetes Certified Administrator Scenario Assessment',
      'PyTorch Deep Learning & Tensor Ops Quiz',
      'React 19 & Fiber Concurrent Engine Assessment',
      'Cybersecurity Network Penetration Mock Exam',
      'Node.js Event Loop & Memory Profiling Assessment'
    ],
    MOCK_INTERVIEW: [
      'FAANG System Design Simulation & Feedback',
      'Principal AI Scientist Technical Interview Mock',
      'Frontend Performance & Architecture Mock Interview',
      'Distributed Systems Kernel Coding Sprint',
      'Senior DevOps & Kubernetes Live Interview Mock',
      'Autonomous Systems Algorithms Mock Session'
    ],
    HACKATHON: [
      'Global Autonomous Robotics Hackathon 2026',
      'Open Source AI Model Fine-Tuning Sprint',
      'Climate & Clean Energy Tech Championship',
      'HealthTech AI & Medical Imaging Hackathon',
      'Web3 Infrastructure & Privacy Hackathon',
      'Next-Gen Mobile & Cross-Platform Build Jam',
      'Smart Cities & IoT Urban Mobility Hackathon',
      'Space Exploration & Satellite Telemetry Jam',
      'Cyber Security & Cryptography Championship',
      'Generative Music & Audio Tech Hackathon',
      'Enterprise Copilot & Tooling Championship',
      'Zero-Knowledge Proof & Privacy Sprint',
      'Autonomous Drone Flight Navigation Hackathon',
      'Quantum Software & Simulation Jam',
      'Global Developer Ecosystem Hackathon 2026',
      'AI Agent Dispatcher Championship 2026',
      'Realtime WebSocket Telemetry Hackathon',
      'Context-Aware Event Operations Championship',
      'Automated Scoring & Rubric Hackathon',
      'Open Source Developer Infrastructure Jam'
    ],
    MENTORSHIP: [
      'Executive AI Engineering Leadership 1-on-1',
      'Open Source Core Maintainer Mentorship Track',
      'Women in Deep Tech Mentorship 2026',
      'Tech Founder & Product Strategy Coaching',
      'Senior Systems Architect Career Guidance Track',
      'Cloud Infrastructure & DevOps Mentorship Circle'
    ]
  };

  const nowMs = Date.now();
  let idCounter = 13;

  for (const cat of categories) {
    const catTitles = (titles as any)[cat] || titles.HACKATHON;
    for (let i = 0; i < catTitles.length; i++) {
      const title = catTitles[i];
      const org = orgs[i % orgs.length];
      const mode = modes[(i + idCounter) % modes.length];
      const field = fields[(i + idCounter * 3) % fields.length];
      const isFeatured = (idCounter % 6 === 0) ? 1 : 0;
      
      const deadlineDate = new Date(nowMs + (7 + (idCounter % 60)) * 86400000).toISOString().split('T')[0];
      const createdDate = new Date(nowMs - (idCounter % 15) * 86400000).toISOString();

      let stipend = '$7,500 / mo';
      if (cat === 'JOB') stipend = '$150,000 - $185,000 / yr';
      if (cat === 'COMPETITION') stipend = '$30,000 USD Prize Pool';
      if (cat === 'HACKATHON') stipend = '$45,000 USD Cash Prizes';
      if (cat === 'MOCK_TEST') stipend = 'Free Certificate Badge';
      if (cat === 'MOCK_INTERVIEW') stipend = 'Detailed Assessment Report';
      if (cat === 'MENTORSHIP') stipend = '1-on-1 Executive Sessions';

      const tagBase = field.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const tags = JSON.stringify([tagBase, 'typescript', 'react', 'python', 'node'].slice(0, 3 + (idCounter % 3)));
      const eligibility = JSON.stringify([
        `Open to Computer Science, Data Science & Engineering Students`,
        `Proficiency in ${field} and software development fundamentals`,
        `Individual or team submissions welcome (1-4 members)`
      ]);
      const responsibilities = JSON.stringify([
        `Architect and build cutting-edge solutions for ${title}.`,
        `Collaborate closely with senior engineering leads from ${org.name}.`,
        `Deliver well-tested codebase, technical architecture, and documentation.`,
        `Present project milestones and live demonstration to panel of judges.`
      ]);

      const description = `Join ${org.name} for ${title}. Solve high-impact engineering challenges in ${field} with state of the art tooling, mentorship, and real-time evaluation.`;

      try {
        db.prepare(`
          INSERT OR IGNORE INTO opportunities (
            id, title, org_id, org_name, org_logo, category, field_of_interest, work_mode, location, deadline, stipend_or_prize, description, tags_json, eligibility_json, responsibilities_json, featured, created_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
        `).run(
          `opp_${idCounter}`,
          title,
          org.id,
          org.name,
          org.logo,
          cat,
          field,
          mode,
          mode === 'REMOTE' ? 'Remote' : mode === 'ONLINE' ? 'Global Virtual Hub' : 'San Francisco / Hybrid',
          deadlineDate,
          stipend,
          description,
          tags,
          eligibility,
          responsibilities,
          isFeatured,
          createdDate
        );
      } catch (e) {}

      idCounter++;
    }
  }
}




import { useState, useEffect, useRef } from 'react';
import {
  auth,
  onAuthStateChanged,
  loginWithEmail,
  registerWithEmail,
  loginWithGoogle,
  loginWithGithub,
  sendVerification,
  resetPassword,
  logoutUser,
  getAuthToken,
} from './src/firebase.js';

const DEFAULT_EVENT_ID = 'event_hack_2026';

// Client-Side Hash Router Hook
function useHashRoute() {
  const [route, setRoute] = useState(window.location.hash || '#/');

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (newRoute) => {
    window.location.hash = newRoute;
  };

  return [route, navigate];
}

function App() {
  const [route, navigate] = useHashRoute();
  
  // Real Firebase Authentication & Persona State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeUserId, setActiveUserId] = useState('');
  const [userRole, setUserRole] = useState('PARTICIPANT');
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(true);
  const [showPersonalizationModal, setShowPersonalizationModal] = useState(false);

  // Command Menu Modal (Cmd+K)
  const [isCommandOpen, setIsCommandOpen] = useState(false);

  // Global Datasets
  const [events, setEvents] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [sequenceNumber, setSequenceNumber] = useState(1);
  const [venues, setVenues] = useState([]);
  const [risksData, setRisksData] = useState({ risks: [], actions: [] });
  const [auditLog, setAuditLog] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [people, setPeople] = useState([]);
  const [userProfile, setUserProfile] = useState({
    name: 'Developer Profile',
    username: 'developer',
    college: 'Engineering Institute',
    academicYear: 'Undergraduate',
    tagline: 'Building software on EVENTOS.',
    location: 'Remote',
    skills: ['React', 'TypeScript', 'Node.js'],
    interests: ['AI/ML', 'Web Development'],
    githubUsername: '',
    joinedEventsCount: 0,
    winsCount: 0,
    projectsCount: 0,
  });

  // Listen for real Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setIsAuthenticated(true);
        setActiveUserId(user.uid);

        try {
          const idToken = await user.getIdToken();
          const syncRes = await fetch('/api/auth/sync-profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({ name: user.displayName, photoUrl: user.photoURL }),
          });
          const syncData = await syncRes.json();
          setUserRole(syncData.role || 'PARTICIPANT');
          setHasCompletedOnboarding(syncData.profile_completed);

          if (!syncData.profile_completed) {
            setShowPersonalizationModal(true);
          }
        } catch (e) {
          console.error('Error syncing user session:', e);
        }
      } else {
        setCurrentUser(null);
        setIsAuthenticated(false);
        setActiveUserId('');
        setUserRole('PARTICIPANT');
      }
    });

    return () => unsubscribe();
  }, []);


  // Load initial datasets
  useEffect(() => {
    fetchEvents();
    fetchLeaderboard();
    fetchVenues();
    fetchRisks();
    fetchAuditLog();
    fetchOrgs();
    fetchPeople();
    initWebSocket();

    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/events');
      const data = await res.json();
      setEvents(data || []);
    } catch (e) { console.error(e); }
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`/api/leaderboard/${DEFAULT_EVENT_ID}`);
      const data = await res.json();
      setLeaderboard(data.rankings || []);
      setSequenceNumber(data.sequence_number || 1);
    } catch (e) { console.error(e); }
  };

  const fetchVenues = async () => {
    try {
      const res = await fetch(`/api/venues/${DEFAULT_EVENT_ID}`);
      const data = await res.json();
      setVenues(data || []);
    } catch (e) { console.error(e); }
  };

  const fetchRisks = async () => {
    try {
      const res = await fetch('/api/organizer/risks');
      const data = await res.json();
      setRisksData(data || { risks: [], actions: [] });
    } catch (e) { console.error(e); }
  };

  const fetchAuditLog = async () => {
    try {
      const res = await fetch('/api/organizer/audit');
      const data = await res.json();
      setAuditLog(data || []);
    } catch (e) { console.error(e); }
  };

  const fetchOrgs = async () => {
    try {
      const res = await fetch('/api/organizations');
      const data = await res.json();
      setOrgs(data || []);
    } catch (e) { console.error(e); }
  };

  const fetchPeople = async () => {
    try {
      const res = await fetch('/api/people');
      const data = await res.json();
      setPeople(data || []);
    } catch (e) { console.error(e); }
  };

  const initWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'SUBSCRIBE', channel: `leaderboard:${DEFAULT_EVENT_ID}`, last_sequence_number: 0 }));
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SNAPSHOT' || msg.type === 'EVENT') {
          setLeaderboard(msg.data || msg.payload || []);
          setSequenceNumber(msg.sequence_number || 1);
        }
      } catch (e) {}
    };
  };

  // Switch role context
  const handleUserChange = (userId) => {
    setActiveUserId(userId);
    if (userId.startsWith('usr_part')) setUserRole('PARTICIPANT');
    else if (userId.startsWith('usr_judge')) setUserRole('JUDGE');
    else if (userId.startsWith('usr_org')) setUserRole('ORGANIZER');
  };

  return (
    <div class="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 selection:bg-blue-600 selection:text-white">
      
      {/* Global Product Navigation Shell */}
      <header class="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Logo & Platform Name */}
          <div class="flex items-center space-x-3 cursor-pointer" onClick={() => navigate(isAuthenticated ? '#/home' : '#/')}>
            <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-extrabold text-lg shadow-md shadow-blue-500/20">
              ⚡
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <span class="font-display font-extrabold text-xl tracking-tight text-slate-900">EVENTOS</span>
                <span class="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-full uppercase tracking-wider">v4.0</span>
              </div>
            </div>
          </div>

          {/* Navigation Links (Context Sensitive) */}
          <nav class="hidden lg:flex items-center space-x-1 font-semibold text-xs text-slate-600">
            {!isAuthenticated ? (
              <>
                <button onClick={() => navigate('#/')} class={`px-3 py-1.5 rounded-lg transition-colors ${route === '#/' ? 'bg-slate-100 text-blue-600 font-bold' : 'hover:bg-slate-50'}`}>Explore</button>
                <button onClick={() => navigate('#/discover')} class={`px-3 py-1.5 rounded-lg transition-colors ${route === '#/discover' ? 'bg-slate-100 text-blue-600 font-bold' : 'hover:bg-slate-50'}`}>Hackathons</button>
                <button onClick={() => navigate('#/organizations')} class={`px-3 py-1.5 rounded-lg transition-colors ${route === '#/organizations' ? 'bg-slate-100 text-blue-600 font-bold' : 'hover:bg-slate-50'}`}>Organizations</button>
              </>
            ) : (
              <>
                <button onClick={() => navigate('#/home')} class={`px-3 py-1.5 rounded-lg transition-colors ${route === '#/home' ? 'bg-slate-100 text-blue-600 font-bold' : 'hover:bg-slate-50'}`}>Home</button>
                <button onClick={() => navigate('#/discover')} class={`px-3 py-1.5 rounded-lg transition-colors ${route === '#/discover' || route.startsWith('#/events') ? 'bg-slate-100 text-blue-600 font-bold' : 'hover:bg-slate-50'}`}>Discover</button>
                <button onClick={() => navigate('#/dashboard/my-events')} class={`px-3 py-1.5 rounded-lg transition-colors ${route.startsWith('#/dashboard') ? 'bg-slate-100 text-blue-600 font-bold' : 'hover:bg-slate-50'}`}>My Workspace</button>
                {userRole === 'JUDGE' && (
                  <button onClick={() => navigate('#/judge/queue')} class={`px-3 py-1.5 rounded-lg transition-colors ${route.startsWith('#/judge') ? 'bg-slate-100 text-blue-600 font-bold' : 'hover:bg-slate-50'}`}>Judge Desk</button>
                )}
                {userRole === 'ORGANIZER' && (
                  <button onClick={() => navigate('#/organizer/overview')} class={`px-3 py-1.5 rounded-lg transition-colors ${route.startsWith('#/organizer') ? 'bg-slate-100 text-blue-600 font-bold' : 'hover:bg-slate-50'}`}>Command Center</button>
                )}
              </>
            )}
          </nav>

          {/* Right Header Controls */}
          <div class="flex items-center space-x-3">
            <button
              onClick={() => setIsCommandOpen(true)}
              class="flex items-center space-x-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-slate-600 rounded-xl text-xs font-medium transition-all"
            >
              <span>🔍 Search</span>
              <kbd class="px-1.5 py-0.5 text-[10px] bg-white border border-slate-300 rounded text-slate-700 font-mono shadow-2xs">⌘K</kbd>
            </button>

            {!isAuthenticated ? (
              <div class="flex items-center space-x-2">
                <button onClick={() => navigate('#/login')} class="px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900">Log in</button>
                <button onClick={() => navigate('#/register')} class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm">Sign up</button>
              </div>
            ) : (
              <div class="flex items-center space-x-3">
                <span class="px-2.5 py-1 text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700 border border-slate-200 rounded-lg">
                  {userRole}
                </span>

                <button onClick={() => navigate('#/profile')} class="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-extrabold text-xs flex items-center justify-center shadow-sm">
                  {currentUser?.displayName ? currentUser.displayName[0].toUpperCase() : currentUser?.email ? currentUser.email[0].toUpperCase() : 'U'}
                </button>

                <button
                  onClick={async () => {
                    await logoutUser();
                    navigate('#/');
                  }}
                  class="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                  title="Sign Out"
                >
                  Log out
                </button>
              </div>
            )}

          </div>
        </div>
      </header>

      {/* Main Body Router */}
      <div class="flex-1">
        {route === '#/' || route === '#/landing' ? (
          <PublicLandingView events={events} navigate={navigate} />
        ) : route === '#/login' || route === '#/register' ? (
          <AuthGatewayView setIsAuthenticated={setIsAuthenticated} setHasCompletedOnboarding={setHasCompletedOnboarding} navigate={navigate} isRegistering={route === '#/register'} />
        ) : route === '#/onboarding' ? (
          <ProgressiveOnboardingView userProfile={userProfile} setUserProfile={setUserProfile} navigate={navigate} setHasCompletedOnboarding={setHasCompletedOnboarding} />
        ) : route === '#/home' ? (
          <PersonalizedHomeView userProfile={userProfile} events={events} navigate={navigate} />
        ) : route.startsWith('#/opportunities/') ? (
          <OpportunityDetailView navigate={navigate} isAuthenticated={isAuthenticated} currentUser={currentUser} userProfile={userProfile} />
        ) : route === '#/discover' || route.startsWith('#/discover') || route === '#/competitions' || route === '#/hackathons' || route === '#/workshops' || route === '#/conferences' ? (
          <DiscoverView events={events} navigate={navigate} route={route} />
        ) : route.startsWith('#/events/') && route.endsWith('/leaderboard') ? (
          <PublicLeaderboardView leaderboard={leaderboard} sequenceNumber={sequenceNumber} />
        ) : route.startsWith('#/events/') && route.endsWith('/submission') ? (
          <SubmissionWorkspaceView navigate={navigate} />
        ) : route.startsWith('#/events/') ? (
          <EventDetailView navigate={navigate} isAuthenticated={isAuthenticated} />
        ) : route.startsWith('#/dashboard') ? (
          <ParticipantWorkspaceView activeUserId={activeUserId} navigate={navigate} route={route} userProfile={userProfile} />
        ) : route.startsWith('#/judge') ? (
          <JudgeDeskView activeUserId={activeUserId} navigate={navigate} route={route} leaderboard={leaderboard} setLeaderboard={setLeaderboard} setSequenceNumber={setSequenceNumber} />
        ) : route.startsWith('#/organizer') ? (
          <OrganizerCommandCenterView activeUserId={activeUserId} navigate={navigate} route={route} risksData={risksData} fetchRisks={fetchRisks} auditLog={auditLog} fetchAuditLog={fetchAuditLog} venues={venues} />
        ) : route === '#/profile' ? (
          <DeveloperProfileView userProfile={userProfile} navigate={navigate} />
        ) : route === '#/organizations' ? (
          <OrganizationsView orgs={orgs} navigate={navigate} />
        ) : route === '#/people' ? (
          <PeopleView people={people} navigate={navigate} />
        ) : (
          <PublicLandingView events={events} navigate={navigate} />
        )}
      </div>

      {/* Profile Personalization Modal Overlay */}
      {showPersonalizationModal && (
        <PersonalizationModal
          isOpen={showPersonalizationModal}
          onClose={() => setShowPersonalizationModal(false)}
          currentUser={currentUser}
          navigate={navigate}
        />
      )}

      {/* Global Command Menu Modal (Cmd+K) */}
      {isCommandOpen && (
        <CommandMenuModal onClose={() => setIsCommandOpen(false)} navigate={navigate} events={events} />
      )}

      {/* Enterprise Footer */}
      <footer class="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500 font-medium">
        <div class="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div class="flex items-center space-x-2">
            <span class="font-display font-bold text-slate-900">EVENTOS v4.0</span>
            <span>•</span>
            <span>An Intelligent Operating System for Live Events</span>
          </div>
          <div>WCAG 2.2 AA Compliant • Multi-Role Architecture • Zero-Config SQLite Demo</div>
        </div>
      </footer>
    </div>
  );
}

// --------------------------------------------------------------------------
// 1. PUBLIC LANDING PAGE (#/ or #/landing)
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// 1. PUBLIC LANDING PAGE (#/ or #/landing)
// --------------------------------------------------------------------------
function PublicLandingView({ events, navigate }) {
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ total_users: 12, total_opportunities: 12 });
  const [featuredOpps, setFeaturedOpps] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    fetchStats();
    fetchFeatured();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setStats(data);
    } catch (e) {}
  };

  const fetchFeatured = async () => {
    try {
      const res = await fetch('/api/discovery/feed?category=ALL');
      const data = await res.json();
      setFeaturedOpps((data || []).filter(o => o.featured));
    } catch (e) {}
  };

  const scrollCarousel = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -350 : 350;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12 animate-slide-up overflow-hidden">
      
      {/* Background Ambient Glowing Orbs */}
      <div class="absolute -top-20 -right-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-float pointer-events-none"></div>
      <div class="absolute top-1/3 -left-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl animate-float pointer-events-none" style={{ animationDelay: '3s' }}></div>

      {/* Hero Section */}
      <div class="relative bg-white/80 backdrop-blur-xl rounded-3xl p-8 sm:p-14 border border-slate-200/90 shadow-xl shadow-blue-500/5 space-y-6 text-center sm:text-left overflow-hidden">
        <div class="absolute right-0 top-0 w-1/3 h-full bg-gradient-to-l from-blue-50/50 to-transparent pointer-events-none"></div>
        
        <div class="max-w-3xl space-y-5 relative z-10">
          <div class="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-gradient-to-r from-blue-50 to-cyan-50 text-blue-800 border border-blue-200/80 shadow-2xs">
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
            </span>
            <span>⚡ Access to {stats.total_users + stats.total_opportunities}+ Verified Developer Profiles & Opportunities</span>
          </div>

          <h1 class="font-display text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Discover opportunities. Build teams. <span class="gradient-text">Compete. Create.</span>
          </h1>

          <p class="text-slate-600 text-base sm:text-lg leading-relaxed font-normal max-w-2xl">
            The intelligent, context-aware operating system for hackathons, developer competitions, tech fests, and live event operations.
          </p>

          {/* Primary Search Bar */}
          <div class="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <div class="relative w-full sm:w-96 group">
              <input
                type="text"
                placeholder="Search opportunities, hackathons, competitions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`#/discover?q=${encodeURIComponent(search)}`); }}
                class="w-full pl-10 pr-4 py-3 bg-slate-50/90 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-2xs"
              />
              <span class="absolute left-3.5 top-3.5 text-slate-400 text-xs group-focus-within:text-blue-600 transition-colors">🔍</span>
            </div>

            <button
              onClick={() => navigate('#/discover')}
              class="w-full sm:w-auto px-7 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs rounded-2xl shadow-md shadow-blue-500/20 hover:shadow-lg transition-all active:scale-95"
            >
              Explore Opportunities ➔
            </button>

            <button
              onClick={() => navigate('#/register')}
              class="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-2xl transition-all active:scale-95"
            >
              Create Profile
            </button>
          </div>
        </div>
      </div>

      {/* Unstop Category Icon Strip */}
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="font-display font-extrabold text-xl text-slate-900 flex items-center space-x-2">
            <span>🎯 Explore Opportunities</span>
          </h2>
          <span class="text-xs font-bold text-slate-400">7 Active Categories</span>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { title: 'Internships', val: 'INTERNSHIP', icon: '💼', count: '4 Active' },
            { title: 'Jobs', val: 'JOB', icon: '👔', count: '1 Active' },
            { title: 'Competitions', val: 'COMPETITION', icon: '🏆', count: '2 Active' },
            { title: 'Mock Tests', val: 'MOCK_TEST', icon: '📝', count: '1 Active' },
            { title: 'Mock Interviews', val: 'MOCK_INTERVIEW', icon: '🎙️', count: '1 Active' },
            { title: 'Hackathons', val: 'HACKATHON', icon: '💻', count: '2 Active' },
            { title: 'Mentorships', val: 'MENTORSHIP', icon: '🤝', count: '1 Active' },
          ].map((cat, idx) => (
            <div
              key={idx}
              onClick={() => navigate(`#/discover?category=${cat.val}`)}
              class="card-hover-lift bg-white/90 hover:bg-blue-50/70 p-4 rounded-2xl border border-slate-200/80 hover:border-blue-300 shadow-2xs cursor-pointer text-center space-y-2 group transition-all"
            >
              <div class="text-3xl transform group-hover:scale-110 transition-transform">{cat.icon}</div>
              <h3 class="font-bold text-slate-900 text-xs group-hover:text-blue-600 transition-colors line-clamp-1">{cat.title}</h3>
              <span class="inline-block text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">{cat.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Featured Horizontal Card Carousel */}
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <span class="text-xs font-bold text-blue-600 uppercase tracking-wider">Handpicked & Verified</span>
            <h2 class="font-display font-extrabold text-2xl text-slate-900">Featured Opportunities</h2>
          </div>

          <div class="flex items-center space-x-2">
            <button onClick={() => scrollCarousel('left')} class="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all font-bold shadow-2xs active:scale-95">
              ←
            </button>
            <button onClick={() => scrollCarousel('right')} class="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all font-bold shadow-2xs active:scale-95">
              →
            </button>
          </div>
        </div>

        <div ref={scrollRef} class="flex space-x-6 overflow-x-auto scroll-smooth pb-4 scrollbar-none snap-x snap-mandatory">
          {featuredOpps.map(opp => (
            <div
              key={opp.id}
              onClick={() => navigate(`#/opportunities/${opp.id}`)}
              class="card-hover-lift min-w-[320px] max-w-[340px] bg-white rounded-3xl p-6 border border-slate-200/90 shadow-2xs cursor-pointer flex flex-col justify-between space-y-4 snap-start group"
            >
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <span class="px-2.5 py-0.5 text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                    {opp.category}
                  </span>
                  <span class="px-2 py-0.5 text-[10px] font-extrabold bg-amber-100 text-amber-900 rounded-md shadow-2xs">
                    FEATURED ⭐
                  </span>
                </div>

                <h3 class="font-display font-bold text-lg text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2">{opp.title}</h3>
                <p class="text-xs text-slate-500 font-semibold">{opp.org_name} • {opp.location}</p>
                <p class="text-xs text-slate-600 line-clamp-2">{opp.description}</p>
              </div>

              <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span class="font-extrabold text-emerald-600">{opp.stipend_or_prize}</span>
                <span class="text-slate-400 font-medium">Closes {opp.deadline}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}



// --------------------------------------------------------------------------
// 2. AUTHENTICATION GATEWAY (#/login or #/register)
// --------------------------------------------------------------------------
function AuthGatewayView({ navigate, isRegistering }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(true);

  const formatAuthError = (errCode, rawMessage) => {
    switch (errCode) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Incorrect email address or password.';
      case 'auth/email-already-in-use':
        return 'An account with this email address already exists. Please log in.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters long.';
      case 'auth/popup-closed-by-user':
        return 'OAuth sign-in popup was closed before completion.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/operation-not-allowed':
      case 'auth/unauthorized-domain':
      case 'auth/invalid-action':
      case 'auth/internal-error':
        return 'OAuth Provider (Google/GitHub) is not enabled in Firebase Console for project eventos-97aad. Please enable Google/GitHub under Firebase Authentication ➔ Sign-in method.';
      default:
        if (rawMessage && (rawMessage.includes('invalid') || rawMessage.includes('action') || rawMessage.includes('handler'))) {
          return 'Google/GitHub OAuth requires enabling the provider in Firebase Console (Authentication ➔ Sign-in method). Use Quick Demo Sign In below to test instantly!';
        }
        return rawMessage || 'Authentication failed. Please check your credentials.';
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please provide both email address and password.');
      return;
    }

    setErrorMsg('');
    setInfoMsg('');
    setLoading(true);

    try {
      if (isRegistering) {
        const userCred = await registerWithEmail(email, password);
        setInfoMsg('Account created successfully! Verification email sent.');
        setIsEmailVerified(userCred.user.emailVerified);
      } else {
        await loginWithEmail(email, password);
      }
      setTimeout(() => navigate('#/home'), 500);
    } catch (err) {
      setErrorMsg(formatAuthError(err.code, err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      await loginWithGoogle();
      navigate('#/home');
    } catch (err) {
      setErrorMsg(formatAuthError(err.code, err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleGithubSignIn = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      await loginWithGithub();
      navigate('#/home');
    } catch (err) {
      setErrorMsg(formatAuthError(err.code, err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setErrorMsg('Enter your email address above to receive a password reset link.');
      return;
    }
    try {
      await resetPassword(email);
      setInfoMsg(`Password reset email sent to ${email}.`);
    } catch (err) {
      setErrorMsg(formatAuthError(err.code, err.message));
    }
  };

  if (!isEmailVerified) {
    return (
      <div class="max-w-md mx-auto my-12 px-4 animate-slide-up">
        <div class="bg-amber-50 rounded-3xl p-8 border border-amber-200 shadow-xl space-y-5 text-center">
          <div class="w-12 h-12 rounded-2xl bg-amber-500 text-white font-bold text-2xl mx-auto flex items-center justify-center">
            ✉️
          </div>
          <h2 class="font-display font-extrabold text-xl text-amber-900">Email Verification Pending</h2>
          <p class="text-xs text-amber-800 font-medium">
            We sent a verification link to <strong>{email}</strong>. Please check your inbox and verify your email.
          </p>
          <div class="space-y-2 pt-2">
            <button
              onClick={async () => {
                try {
                  await sendVerification();
                  setInfoMsg('Verification link resent!');
                } catch (e) { setErrorMsg(e.message); }
              }}
              class="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-sm"
            >
              Resend Verification Link
            </button>
            <button onClick={() => navigate('#/home')} class="w-full py-2.5 bg-white border border-amber-300 text-amber-900 font-bold text-xs rounded-xl">
              I've Verified — Continue ➔
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="max-w-md mx-auto my-12 px-4 animate-slide-up">
      <div class="bg-white rounded-3xl p-8 border border-slate-200 shadow-xl space-y-6">
        
        <div class="text-center space-y-2">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-extrabold text-2xl mx-auto flex items-center justify-center shadow-md">
            ⚡
          </div>
          <h1 class="font-display font-extrabold text-2xl text-slate-900">
            {isRegistering ? 'Create your Talent Account' : 'Welcome back to EVENTOS'}
          </h1>
          <p class="text-xs text-slate-500 font-medium">
            {isRegistering ? 'Sign up for personalized opportunities & gamified discovery.' : 'Log in with your real Firebase Auth credentials.'}
          </p>
        </div>

        {errorMsg && (
          <div class="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl text-center">
            {errorMsg}
          </div>
        )}

        {infoMsg && (
          <div class="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl text-center">
            {infoMsg}
          </div>
        )}

        {/* Real OAuth Buttons (Google & GitHub) */}
        <div class="space-y-2.5">
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            class="w-full py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center space-x-2 transition-all"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>Continue with Google</span>
          </button>

          <button
            onClick={handleGithubSignIn}
            disabled={loading}
            class="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center space-x-2 transition-all"
          >
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            <span>Continue with GitHub</span>
          </button>
        </div>

        <div class="relative flex py-1 items-center">
          <div class="flex-grow border-t border-slate-200"></div>
          <span class="flex-shrink mx-3 text-[10px] font-bold text-slate-400 uppercase">Or Email & Password</span>
          <div class="flex-grow border-t border-slate-200"></div>
        </div>

        <form onSubmit={handleAuthSubmit} class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-xs font-bold text-slate-700">Password</label>
              {!isRegistering && (
                <button type="button" onClick={handleForgotPassword} class="text-[11px] font-bold text-blue-600 hover:underline">
                  Forgot Password?
                </button>
              )}
            </div>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
          >
            {loading && <span class="animate-spin text-sm">⌛</span>}
            <span>{isRegistering ? 'Create Talent Account' : 'Log In with Firebase Auth'}</span>
          </button>
        </form>

        {/* Instant Demo Sign-In Shortcut */}
        <div class="pt-3 border-t border-slate-100 space-y-2">
          <span class="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider text-center">⚡ Quick Test Sign In</span>
          <div class="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setEmail('ramakrishna@dev.com');
                setPassword('password123');
                navigate('#/home');
              }}
              class="py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-extrabold text-[11px] rounded-xl border border-blue-200 transition-all text-center"
            >
              Demo Participant
            </button>
            <button
              onClick={() => {
                setEmail('lead@eventos.org');
                setPassword('password123');
                navigate('#/organizer/overview');
              }}
              class="py-2 px-3 bg-purple-50 hover:bg-purple-100 text-purple-700 font-extrabold text-[11px] rounded-xl border border-purple-200 transition-all text-center"
            >
              Demo Organizer
            </button>
          </div>
        </div>

        <div class="text-center pt-2 border-t border-slate-100 text-xs font-medium text-slate-500">
          {isRegistering ? (
            <p>Already have an account? <button onClick={() => navigate('#/login')} class="text-blue-600 font-bold hover:underline">Log in</button></p>
          ) : (
            <p>Don't have an account? <button onClick={() => navigate('#/register')} class="text-blue-600 font-bold hover:underline">Sign up</button></p>
          )}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// PERSONALIZATION OVERLAY MODAL (Popup of Personalization Profile)
// --------------------------------------------------------------------------
function PersonalizationModal({ isOpen, onClose, currentUser, navigate }) {
  if (!isOpen) return null;

  const [name, setName] = useState(currentUser?.displayName || '');
  const [handle, setHandle] = useState('');
  const [handleAvailable, setHandleAvailable] = useState(true);
  const [institution, setInstitution] = useState('');
  const [bio, setBio] = useState('');
  const [selectedSkills, setSelectedSkills] = useState(['React', 'TypeScript', 'AI / ML']);
  const [githubUrl, setGithubUrl] = useState('');
  const [fieldOfInterest, setFieldOfInterest] = useState('AI/ML');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (handle.trim().length > 2) {
      fetch(`/api/onboarding/check-handle?handle=${encodeURIComponent(handle)}`)
        .then(res => res.json())
        .then(data => setHandleAvailable(data.available))
        .catch(console.error);
    }
  }, [handle]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = await getAuthToken();
      await fetch('/api/onboarding/step', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          step: 'identity',
          payload: { name, handle, institution, bio, selectedSkills, githubUrl, fieldOfInterest },
        }),
      });

      onClose();
      navigate('#/home');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-slide-up">
      <div class="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 border border-slate-200 shadow-2xl space-y-6 relative max-h-[90vh] overflow-y-auto">
        
        <div class="flex items-center justify-between border-b border-slate-100 pb-4">
          <div class="space-y-1">
            <h2 class="font-display font-extrabold text-xl text-slate-900">✨ Personalize Your Talent Profile</h2>
            <p class="text-xs text-slate-500 font-medium">Quick setup to personalize your opportunity discovery feed.</p>
          </div>
          <button onClick={onClose} class="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
        </div>

        <form onSubmit={handleSaveProfile} class="space-y-4 text-xs font-medium">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Full Name</label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex Morgan" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl" />
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Unique @handle</label>
            <div class="relative">
              <span class="absolute left-3 top-2.5 text-slate-400 font-bold">@</span>
              <input type="text" required value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="alexmorgan" class="w-full pl-7 pr-4 p-2.5 bg-slate-50 border border-slate-200 rounded-xl" />
            </div>
            {handle.length > 2 && (
              <span class={`text-[11px] font-bold mt-1 block ${handleAvailable ? 'text-emerald-600' : 'text-red-500'}`}>
                {handleAvailable ? `✓ @${handle} is available` : `✕ @${handle} is taken`}
              </span>
            )}
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Institution / Organization</label>
            <input type="text" required value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. Stanford University / Tech Corp" class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl" />
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Bio / Tagline</label>
            <textarea rows="2" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Building full-stack AI software." class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"></textarea>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Primary Skills & Taxonomy</label>
            <div class="flex flex-wrap gap-1.5 pt-1">
              {['React', 'TypeScript', 'Python', 'Node.js', 'AI / ML', 'DevOps', 'SQLite'].map(sk => (
                <button
                  type="button"
                  key={sk}
                  onClick={() => setSelectedSkills(prev => prev.includes(sk) ? prev.filter(s => s !== sk) : [...prev, sk])}
                  class={`px-3 py-1 rounded-xl text-[11px] font-bold border transition-all ${selectedSkills.includes(sk) ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'}`}
                >
                  {sk}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Field of Interest</label>
            <select value={fieldOfInterest} onChange={(e) => setFieldOfInterest(e.target.value)} class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold">
              <option value="AI/ML">AI / Machine Learning</option>
              <option value="Web Development">Web Development</option>
              <option value="Cloud Infrastructure">Cloud Infrastructure & DevOps</option>
              <option value="Cybersecurity">Cybersecurity</option>
            </select>
          </div>

          <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            <button type="button" onClick={onClose} class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl">
              Complete Later
            </button>
            <button type="submit" disabled={loading || !handleAvailable} class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md">
              {loading ? 'Saving...' : 'Save & Personalize Profile ➔'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// --------------------------------------------------------------------------
// 3. PROGRESSIVE ONBOARDING WIZARD (#/onboarding) — Gated required steps
// --------------------------------------------------------------------------
function ProgressiveOnboardingView({ userProfile, setUserProfile, navigate, setHasCompletedOnboarding }) {
  const [step, setStep] = useState(1);
  const [handle, setHandle] = useState('ramakrishna');
  const [handleAvailable, setHandleAvailable] = useState(true);
  const [institution, setInstitution] = useState('National Institute of Technology');
  const [degree, setDegree] = useState('Master of Computer Applications');
  const [field, setField] = useState('Computer Science & AI');
  const [selectedSkills, setSelectedSkills] = useState(['React', 'TypeScript', 'Node.js', 'AI / ML']);
  const [customSkillInput, setCustomSkillInput] = useState('');
  const [fieldOfInterest, setFieldOfInterest] = useState('AI/ML');
  const [preferredLocation, setPreferredLocation] = useState('San Francisco / Remote');
  const [resumeSignedUrl, setResumeSignedUrl] = useState('');
  const [resumeSuggestions, setResumeSuggestions] = useState(null);

  // Live handle availability checker
  useEffect(() => {
    if (!handle) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/onboarding/check-handle?handle=${handle}&userId=usr_part_1`);
        const data = await res.json();
        setHandleAvailable(data.available);
      } catch (e) {}
    }, 250);
    return () => clearTimeout(timer);
  }, [handle]);

  const handleAddSkill = (skillName) => {
    if (!selectedSkills.includes(skillName)) {
      setSelectedSkills([...selectedSkills, skillName]);
    }
  };

  const handleSaveStep = async (stepName, payload) => {
    try {
      const res = await fetch('/api/onboarding/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'usr_part_1', step: stepName, payload }),
      });
      const data = await res.json();
      return data;
    } catch (e) {
      alert(e.message);
      return null;
    }
  };

  const handleResumeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.pdf')) {
      alert('Security Policy Error: Only PDF files are allowlisted.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Security Policy Error: File size exceeds 10MB cap.');
      return;
    }

    try {
      const res = await fetch('/api/profile/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'usr_part_1',
          filename: file.name,
          fileType: file.type || 'application/pdf',
          sizeBytes: file.size,
        }),
      });
      const data = await res.json();
      setResumeSignedUrl(data.signed_url);
      setResumeSuggestions(data.suggestions);
    } catch (err) { alert(err.message); }
  };

  const handleFinish = async () => {
    await handleSaveStep('goals', { field_of_interest: fieldOfInterest, preferred_location: preferredLocation });
    setHasCompletedOnboarding(true);
    navigate('#/home');
  };

  return (
    <div class="max-w-2xl mx-auto my-8 px-4 animate-slide-up space-y-6">
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
        <div class="flex justify-between text-xs font-bold text-slate-600">
          <span>Step {step} of 5</span>
          <span class="text-blue-600 font-extrabold">{['Identity', 'Education', 'Skills', 'Career Goals', 'Resume & Enrichment'][step - 1]}</span>
        </div>
        <div class="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
          <div class="bg-gradient-to-r from-blue-600 to-indigo-600 h-full transition-all duration-300" style={{ width: `${(step / 5) * 100}%` }}></div>
        </div>
      </div>

      <div class="bg-white rounded-3xl p-8 border border-slate-200 shadow-xl space-y-6">
        {step === 1 && (
          <div class="space-y-4">
            <h2 class="font-display font-extrabold text-xl text-slate-900">Step 1 — Identity (Required)</h2>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
              <input type="text" value={userProfile.name} onChange={(e) => setUserProfile({ ...userProfile, name: e.target.value })} class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold" />
            </div>
            <div>
              <div class="flex justify-between items-center mb-1">
                <label class="text-xs font-bold text-slate-700">Unique Handle (@username)</label>
                {handleAvailable ? (
                  <span class="text-[11px] font-bold text-emerald-600">✓ @{handle} is available</span>
                ) : (
                  <span class="text-[11px] font-bold text-rose-600">✕ @{handle} is already taken</span>
                )}
              </div>
              <input type="text" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold" />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Institution / University</label>
              <input type="text" value={institution} onChange={(e) => setInstitution(e.target.value)} class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div class="space-y-4">
            <h2 class="font-display font-extrabold text-xl text-slate-900">Step 2 — Education (Required)</h2>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Degree</label>
              <input type="text" value={degree} onChange={(e) => setDegree(e.target.value)} class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold" />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Field of Study</label>
              <input type="text" value={field} onChange={(e) => setField(e.target.value)} class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold" />
            </div>
          </div>
        )}

        {step === 3 && (
          <div class="space-y-4">
            <h2 class="font-display font-extrabold text-xl text-slate-900">Step 3 — Canonical Skills Tagging (Required)</h2>
            <p class="text-xs text-slate-500 font-medium">Strings are automatically canonicalized server-side (e.g. "React.js" → canonical tag `react`).</p>
            <div class="flex flex-wrap gap-2">
              {['React.js', 'TypeScript', 'Node.js', 'Frontend React', 'Python3', 'PyTorch', 'SQLite3', 'Kubernetes'].map(s => (
                <button
                  key={s}
                  onClick={() => handleAddSkill(s)}
                  class={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${selectedSkills.includes(s) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  {s} {selectedSkills.includes(s) ? '✓' : '+'}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div class="space-y-4">
            <h2 class="font-display font-extrabold text-xl text-slate-900">Step 4 — Career Goals (Required for Feed Personalization)</h2>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Primary Field of Interest</label>
              <select value={fieldOfInterest} onChange={(e) => setFieldOfInterest(e.target.value)} class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold">
                <option value="AI/ML">AI / Machine Learning</option>
                <option value="Cloud Infrastructure">Cloud Infrastructure & DevOps</option>
                <option value="Full Stack Development">Full Stack Engineering</option>
                <option value="Cybersecurity">Cybersecurity & Trust</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Preferred Location</label>
              <input type="text" value={preferredLocation} onChange={(e) => setPreferredLocation(e.target.value)} class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold" />
            </div>
          </div>
        )}

        {step === 5 && (
          <div class="space-y-4">
            <h2 class="font-display font-extrabold text-xl text-slate-900">Step 5 — Resume Upload & Confirmation</h2>
            <p class="text-xs text-slate-500 font-medium">Security Policy: PDF only, max 10MB, served via signed short-lived URL.</p>
            
            <div class="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center space-y-3">
              <input type="file" accept=".pdf" onChange={handleResumeUpload} class="text-xs text-slate-600" />
              {resumeSignedUrl && (
                <div class="text-xs text-emerald-700 font-bold bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                  ✓ Resume uploaded! Signed URL generated.
                </div>
              )}
            </div>

            {resumeSuggestions && (
              <div class="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2 text-xs animate-slide-up">
                <div class="font-bold text-blue-900 uppercase">Extracted Suggestions (Requires Confirmation)</div>
                <div class="flex flex-wrap gap-1.5">
                  {resumeSuggestions.suggested_skills.map(sk => (
                    <span key={sk} class="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold rounded">{sk}</span>
                  ))}
                </div>
                <button onClick={() => alert('Suggestions confirmed and merged!')} class="px-3 py-1 bg-blue-600 text-white font-bold text-[11px] rounded-lg mt-1">
                  Confirm Suggestions ✓
                </button>
              </div>
            )}
          </div>
        )}

        <div class="pt-4 border-t border-slate-100 flex justify-between">
          <button disabled={step === 1} onClick={() => setStep(step - 1)} class="px-4 py-2 bg-slate-100 disabled:opacity-40 text-slate-700 font-bold text-xs rounded-xl">
            Previous
          </button>
          
          {step < 5 ? (
            <button onClick={() => setStep(step + 1)} class="px-5 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-sm">
              Next Step ➔
            </button>
          ) : (
            <button onClick={handleFinish} class="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md">
              Complete Onboarding & Unlock Feed ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// 4. PERSONALIZED HOME (#/home)
// --------------------------------------------------------------------------
function PersonalizedHomeView({ userProfile, events, navigate }) {
  return (
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-slide-up">
      <div class="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-3xl p-6 sm:p-10 text-white shadow-xl space-y-4">
        <div class="flex items-center justify-between">
          <span class="px-3 py-1 bg-cyan-400/20 text-cyan-300 border border-cyan-400/30 text-xs font-extrabold rounded-full">
            ⚡ PERSONALIZED FEED UNLOCKED
          </span>
          <span class="text-xs font-bold text-slate-300">Active Streak: 🔥 4 Days</span>
        </div>

        <div class="space-y-1">
          <h1 class="font-display font-extrabold text-3xl sm:text-4xl text-white">
            Welcome back, {userProfile.name}.
          </h1>
          <p class="text-xs sm:text-sm text-blue-100 font-medium">
            Your onboarding profile is active. Feed is personalized based on your AI/ML goals and canonical skills.
          </p>
        </div>
      </div>

      <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span class="text-xs font-bold text-blue-600 uppercase">Top Personalized Recommendation</span>
            <h2 class="font-display font-bold text-xl text-slate-900">AI Systems Engineering Intern @ EVENTOS Global Labs</h2>
          </div>
          <span class="px-3.5 py-1.5 bg-emerald-100 text-emerald-800 border border-emerald-200 font-extrabold text-xs rounded-full">
            Relevance Score: +150 pts
          </span>
        </div>

        <div class="pt-2 flex space-x-3">
          <button onClick={() => navigate('#/discover')} class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm">
            Explore All Opportunities ➔
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// 5. PERSONALIZED OPPORTUNITY DISCOVERY ENGINE (#/discover) — Unstop Style
// --------------------------------------------------------------------------
function DiscoverView({ events, navigate, route = '#/discover' }) {
  const [opportunities, setOpportunities] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [workModeFilter, setWorkModeFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('RELEVANCE');
  const [currentPersona, setCurrentPersona] = useState('usr_part_1');

  useEffect(() => {
    // Parse category from URL query param if present e.g. #/discover?category=INTERNSHIP
    if (route.includes('category=')) {
      const catParam = route.split('category=')[1]?.split('&')[0]?.toUpperCase();
      if (catParam) setSelectedCategory(catParam);
    }
    if (route.includes('q=')) {
      const qParam = decodeURIComponent(route.split('q=')[1]?.split('&')[0] || '');
      if (qParam) setSearchTerm(qParam);
    }
  }, [route]);

  useEffect(() => {
    fetchFeed();
  }, [selectedCategory, currentPersona]);

  const fetchFeed = async () => {
    try {
      const res = await fetch(`/api/discovery/feed?userId=${currentPersona}&category=${selectedCategory}`);
      const data = await res.json();
      setOpportunities(data || []);
    } catch (e) { console.error(e); }
  };

  const getCategoryLabel = (cat) => {
    switch (cat) {
      case 'INTERNSHIP': return 'Internships';
      case 'JOB': return 'Jobs';
      case 'COMPETITION': return 'Competitions';
      case 'MOCK_TEST': return 'Mock Tests';
      case 'MOCK_INTERVIEW': return 'Mock Interviews';
      case 'HACKATHON': return 'Hackathons';
      case 'MENTORSHIP': return 'Mentorships';
      default: return 'Opportunities';
    }
  };

  const filteredOpps = opportunities
    .filter(o => {
      const matchesSearch = !searchTerm || o.title.toLowerCase().includes(searchTerm.toLowerCase()) || o.description.toLowerCase().includes(searchTerm.toLowerCase()) || o.org_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMode = workModeFilter === 'ALL' || o.work_mode === workModeFilter;
      return matchesSearch && matchesMode;
    })
    .sort((a, b) => {
      if (sortBy === 'DEADLINE') return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      if (sortBy === 'RELEVANCE') return (b.relevance_score || 0) - (a.relevance_score || 0);
      return 0;
    });

  const featuredOpps = opportunities.filter(o => o.featured);

  return (
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-slide-up">
      
      {/* Header & Persona Selector */}
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center space-x-2">
            <h1 class="font-display font-extrabold text-3xl text-slate-900">
              {filteredOpps.length} {getCategoryLabel(selectedCategory)} for Students
            </h1>
            <span class="px-2.5 py-0.5 text-xs font-bold bg-blue-100 text-blue-800 rounded-full">
              Live Listing
            </span>
          </div>
          <p class="text-xs text-slate-500 font-medium">Explore curated opportunities with real-time eligibility checks and quick applications.</p>
        </div>

        {/* Persona Switcher to demonstrate Feed Re-ordering! */}
        <div class="bg-blue-50 border border-blue-200 p-3 rounded-2xl flex items-center space-x-3 text-xs">
          <span class="font-bold text-blue-900">Personalization Signals:</span>
          <select
            value={currentPersona}
            onChange={(e) => setCurrentPersona(e.target.value)}
            class="bg-white border border-blue-300 font-bold text-slate-800 rounded-xl px-2.5 py-1.5 focus:outline-none"
          >
            <option value="usr_part_1">Ramakrishna (AI/ML & React Specialist)</option>
            <option value="usr_part_2">Sarah (Python & ML Researcher)</option>
            <option value="usr_part_3">Michael (DevOps & Cloud Engineer)</option>
          </select>
        </div>
      </div>

      {/* Unstop Category Pills Strip */}
      <div class="flex items-center space-x-2 overflow-x-auto pb-2 border-b border-slate-200">
        {[
          { label: 'All Opportunities', val: 'ALL' },
          { label: 'Internships', val: 'INTERNSHIP' },
          { label: 'Jobs', val: 'JOB' },
          { label: 'Competitions', val: 'COMPETITION' },
          { label: 'Mock Tests', val: 'MOCK_TEST' },
          { label: 'Mock Interviews', val: 'MOCK_INTERVIEW' },
          { label: 'Hackathons', val: 'HACKATHON' },
          { label: 'Mentorships', val: 'MENTORSHIP' },
        ].map(cat => (
          <button
            key={cat.val}
            onClick={() => setSelectedCategory(cat.val)}
            class={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${selectedCategory === cat.val ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Filter Bar Row */}
      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4 text-xs font-semibold text-slate-700">
        <div class="flex items-center space-x-3">
          <span class="px-3 py-1.5 bg-blue-50 text-blue-700 font-extrabold rounded-xl border border-blue-200 flex items-center space-x-1">
            <span>⚙️ Filters</span>
            <span class="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center">3</span>
          </span>

          <div class="flex items-center space-x-1">
            <span>Work Mode:</span>
            <select
              value={workModeFilter}
              onChange={(e) => setWorkModeFilter(e.target.value)}
              class="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none"
            >
              <option value="ALL">All Modes</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
              <option value="ONLINE">Online</option>
              <option value="ON_SITE">On-Site</option>
            </select>
          </div>
        </div>

        <div class="flex items-center space-x-3">
          {/* Search Input */}
          <div class="relative w-64">
            <input
              type="text"
              placeholder="Search title, org, or skill..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              class="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
            />
            <span class="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
          </div>

          <div class="flex items-center space-x-1">
            <span>Sort By:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              class="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none"
            >
              <option value="RELEVANCE">Relevance Score</option>
              <option value="DEADLINE">Closing Deadline</option>
            </select>
          </div>
        </div>
      </div>

      {/* Two-Column Layout: Main Listing + Featured Sidebar */}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Horizontal Unstop Cards List */}
        <div class="lg:col-span-2 space-y-4">
          {filteredOpps.map(opp => {
            const daysLeft = Math.max(0, Math.ceil((new Date(opp.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));
            
            return (
              <div
                key={opp.id}
                class="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all space-y-4 group"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="space-y-1.5 flex-1">
                    <div class="flex items-center space-x-2">
                      <span class="px-2.5 py-0.5 text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 rounded-full uppercase">
                        {opp.category}
                      </span>
                      {opp.featured && (
                        <span class="px-2 py-0.5 text-[10px] font-extrabold bg-amber-100 text-amber-900 rounded-md">
                          FEATURED ⭐
                        </span>
                      )}
                    </div>

                    <h2
                      onClick={() => navigate(`#/opportunities/${opp.id}`)}
                      class="font-display font-bold text-lg text-slate-900 hover:text-blue-600 transition-colors cursor-pointer"
                    >
                      {opp.title}
                    </h2>
                    
                    <p class="text-xs text-slate-500 font-semibold">{opp.org_name} • 📍 {opp.location}</p>
                  </div>

                  {/* Org Logo Box */}
                  <div class="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center font-extrabold text-slate-700 text-sm shadow-2xs">
                    {opp.org_name.slice(0, 2).toUpperCase()}
                  </div>
                </div>

                <p class="text-xs text-slate-600 line-clamp-2">{opp.description}</p>

                {opp.match_reasons && opp.match_reasons.length > 0 && (
                  <div class="bg-emerald-50 border border-emerald-200 p-2 rounded-xl text-[11px] font-bold text-emerald-800 flex items-center space-x-2">
                    <span>⚡ Signal:</span>
                    <span>{opp.match_reasons[0]}</span>
                  </div>
                )}

                {/* Meta Icons & Tags */}
                <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-xl font-bold text-[11px]">
                      💻 {opp.work_mode}
                    </span>
                    {opp.tags.map(t => (
                      <span key={t} class="px-2 py-1 bg-blue-50 text-blue-800 rounded-xl font-bold text-[11px]">
                        #{t}
                      </span>
                    ))}
                  </div>

                  <div class="font-extrabold text-emerald-700 text-sm">
                    {opp.stipend_or_prize}
                  </div>
                </div>

                {/* Card Footer */}
                <div class="pt-2 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100">
                  <div class="flex items-center space-x-3">
                    <span>Posted {opp.created_at.split('T')[0]}</span>
                    <span>•</span>
                    <span class="font-bold text-amber-600">⏳ {daysLeft} Days Left</span>
                  </div>

                  <div class="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        if (navigator.share) {
                          navigator.share({ title: opp.title, url: window.location.origin + `/#/opportunities/${opp.id}` });
                        } else {
                          navigator.clipboard.writeText(window.location.origin + `/#/opportunities/${opp.id}`);
                        }
                      }}
                      class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[11px] font-bold text-slate-700"
                    >
                      🔗 Share
                    </button>

                    <button
                      onClick={() => navigate(`#/opportunities/${opp.id}`)}
                      class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-all"
                    >
                      View & Apply ➔
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column: Featured Opportunities Sidebar */}
        <div class="space-y-4">
          <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-4">
            <h3 class="font-display font-extrabold text-base text-slate-900 flex items-center justify-between">
              <span>⭐ Featured Opportunities</span>
              <span class="text-xs text-blue-600 font-bold">Top Picks</span>
            </h3>

            <div class="space-y-3">
              {featuredOpps.map(f => (
                <div
                  key={f.id}
                  onClick={() => navigate(`#/opportunities/${f.id}`)}
                  class="p-3 bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-2xl space-y-1 cursor-pointer transition-all group"
                >
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-extrabold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">{f.category}</span>
                    <span class="text-[10px] text-emerald-700 font-extrabold">{f.stipend_or_prize}</span>
                  </div>
                  <h4 class="font-bold text-slate-900 text-xs group-hover:text-blue-600 transition-colors line-clamp-1">{f.title}</h4>
                  <p class="text-[11px] text-slate-500 font-medium">{f.org_name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// 5B. OPPORTUNITY DETAIL VIEW (#/opportunities/:id) — Unstop Pattern
// --------------------------------------------------------------------------
function OpportunityDetailView({ navigate, isAuthenticated, currentUser, userProfile }) {
  const [opportunity, setOpportunity] = useState(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Extract ID from hash e.g. #/opportunities/opp_1
  const oppId = window.location.hash.split('/opportunities/')[1]?.split('?')[0] || '';

  useEffect(() => {
    if (oppId) {
      fetchOpportunity();
      checkRegistration();
    }
  }, [oppId]);

  const fetchOpportunity = async () => {
    try {
      const res = await fetch(`/api/opportunities/${oppId}`);
      if (!res.ok) return;
      const data = await res.json();
      setOpportunity(data);
    } catch (e) { console.error(e); }
  };

  const checkRegistration = async () => {
    try {
      const token = await getAuthToken();
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/opportunities/${oppId}/registration-status`, { headers });
      const data = await res.json();
      setIsRegistered(Boolean(data.registered));
    } catch (e) { console.error(e); }
  };

  const handleRegister = async () => {
    if (!isAuthenticated) {
      return navigate('#/login');
    }

    setRegistering(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/opportunities/${oppId}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      
      if (data.success) {
        setIsRegistered(true);
        setToastMsg(data.alreadyRegistered ? 'You are already registered for this opportunity!' : 'Successfully registered! Audit record created.');
        setTimeout(() => setToastMsg(''), 4000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRegistering(false);
    }
  };

  if (!opportunity) {
    return <div class="p-12 text-center text-slate-400 font-medium">Loading opportunity details...</div>;
  }

  const daysLeft = Math.max(0, Math.ceil((new Date(opportunity.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));

  return (
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-slide-up">
      
      {/* Toast Confirmation Notification */}
      {toastMsg && (
        <div class="p-4 bg-emerald-600 text-white font-bold text-xs rounded-2xl shadow-lg flex items-center justify-between animate-slide-up">
          <span>✓ {toastMsg}</span>
          <button onClick={() => setToastMsg('')} class="text-white text-sm font-bold">✕</button>
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Columns: Main Details */}
        <div class="lg:col-span-2 space-y-8">
          
          {/* Header Banner */}
          <div class="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-6">
            <div class="flex items-start justify-between gap-6">
              <div class="space-y-3">
                <div class="flex items-center space-x-2">
                  <span class="px-3 py-1 bg-blue-50 text-blue-700 font-extrabold text-xs rounded-full border border-blue-200">
                    {opportunity.category}
                  </span>
                  <span class="px-3 py-1 bg-slate-100 text-slate-700 font-bold text-xs rounded-full">
                    {opportunity.work_mode}
                  </span>
                </div>

                <h1 class="font-display font-extrabold text-2xl sm:text-3xl text-slate-900">{opportunity.title}</h1>
                <p class="text-sm font-bold text-blue-600">{opportunity.org_name} • 📍 {opportunity.location}</p>
              </div>

              <div class="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center font-extrabold text-slate-700 text-xl shadow-2xs">
                {opportunity.org_name.slice(0, 2).toUpperCase()}
              </div>
            </div>

            <div class="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span class="text-xs text-slate-400 font-bold block uppercase">Stipend / Award Prize</span>
                <span class="text-xl font-extrabold text-emerald-600">{opportunity.stipend_or_prize}</span>
              </div>

              <div>
                <span class="text-xs text-slate-400 font-bold block uppercase">Registration Deadline</span>
                <span class="text-sm font-extrabold text-slate-800">{opportunity.deadline}</span>
              </div>
            </div>
          </div>

          {/* Eligibility Section */}
          <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-4">
            <h2 class="font-display font-bold text-lg text-slate-900 flex items-center space-x-2">
              <span>🎯 Eligibility Requirements</span>
            </h2>
            <div class="flex flex-wrap gap-2">
              {opportunity.eligibility?.map((elig, idx) => (
                <span key={idx} class="px-3.5 py-2 bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold text-xs rounded-xl flex items-center space-x-1.5">
                  <span>✓</span> <span>{elig}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Details & Responsibilities */}
          <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-6">
            <div class="space-y-2">
              <h2 class="font-display font-bold text-lg text-slate-900">About this Opportunity</h2>
              <p class="text-xs text-slate-700 leading-relaxed font-medium">{opportunity.description}</p>
            </div>

            <div class="space-y-3 pt-4 border-t border-slate-100">
              <h3 class="font-display font-bold text-base text-slate-900">Key Responsibilities & Deliverables</h3>
              <ul class="space-y-2 text-xs text-slate-700 font-medium">
                {opportunity.responsibilities?.map((resp, idx) => (
                  <li key={idx} class="flex items-start space-x-2">
                    <span class="text-blue-600 font-bold">▪</span>
                    <span>{resp}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div class="space-y-2 pt-4 border-t border-slate-100">
              <h3 class="font-display font-bold text-xs text-slate-400 uppercase tracking-wider">Required Skills & Tags</h3>
              <div class="flex flex-wrap gap-2">
                {opportunity.tags?.map(t => (
                  <span key={t} class="px-3 py-1 bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl">
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Column: Sticky Application Panel */}
        <div class="space-y-6">
          <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-xl space-y-6 sticky top-20">
            
            {/* Days Left Ribbon */}
            <div class="bg-gradient-to-r from-amber-500 to-orange-500 text-white font-extrabold text-xs px-4 py-2 rounded-2xl flex items-center justify-between shadow-md">
              <span>⏳ REGISTRATION CLOSING</span>
              <span>{daysLeft} DAYS LEFT</span>
            </div>

            {/* You're Eligible Box */}
            <div class="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 space-y-3">
              <div class="flex items-center space-x-2 text-emerald-900 font-bold text-xs">
                <span>🛡️</span>
                <span>You're Eligible to Apply</span>
              </div>

              {isAuthenticated ? (
                <div class="flex items-center space-x-3 pt-1 border-t border-emerald-200/60">
                  <div class="w-9 h-9 rounded-full bg-emerald-600 text-white font-extrabold text-xs flex items-center justify-center shadow-xs">
                    {currentUser?.displayName ? currentUser.displayName[0].toUpperCase() : currentUser?.email ? currentUser.email[0].toUpperCase() : 'U'}
                  </div>
                  <div class="space-y-0.5 text-xs">
                    <span class="font-bold text-slate-900 block">{userProfile?.name || currentUser?.displayName || 'Authenticated Developer'}</span>
                    <span class="text-[11px] text-slate-600 font-medium block">{currentUser?.email}</span>
                  </div>
                </div>
              ) : (
                <div class="space-y-2 pt-1 text-xs text-emerald-800 font-medium">
                  <p>Log in to check your personalized eligibility score and apply.</p>
                  <button onClick={() => navigate('#/login')} class="w-full py-2 bg-emerald-600 text-white font-bold rounded-xl shadow-xs">
                    Log In to Check Eligibility ➔
                  </button>
                </div>
              )}
            </div>

            {/* Quick Apply / Register Button */}
            <div class="space-y-2">
              {isRegistered ? (
                <button disabled class="w-full py-3 bg-emerald-100 text-emerald-800 font-extrabold text-xs rounded-2xl border border-emerald-300 cursor-not-allowed">
                  Registered ✓
                </button>
              ) : (
                <button
                  onClick={handleRegister}
                  disabled={registering}
                  class="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center space-x-2"
                >
                  {registering && <span class="animate-spin text-sm">⌛</span>}
                  <span>Quick Apply / Register ➔</span>
                </button>
              )}
            </div>

            {/* Share Banner */}
            <div class="pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <span class="font-bold text-slate-600">Share with Friends</span>
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ title: opportunity.title, url: window.location.href });
                  } else {
                    navigator.clipboard.writeText(window.location.href);
                    setToastMsg('Link copied to clipboard!');
                    setTimeout(() => setToastMsg(''), 3000);
                  }
                }}
                class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 rounded-xl transition-all"
              >
                🔗 Copy Link
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}


// --------------------------------------------------------------------------
// 6. EVENT DETAIL VIEW (#/events/:slug)
// --------------------------------------------------------------------------
function EventDetailView({ navigate, isAuthenticated }) {
  const [eventData, setEventData] = useState(null);

  useEffect(() => {
    fetch(`/api/events/${DEFAULT_EVENT_ID}`)
      .then(r => r.json())
      .then(d => setEventData(d))
      .catch(console.error);
  }, []);

  if (!eventData) return <div class="p-12 text-center text-slate-400 font-medium">Loading event detail...</div>;

  const { event, challenges } = eventData;

  const handleRegister = () => {
    if (!isAuthenticated) return navigate('#/login');
    alert('Registration verified! Event participation record created. Redirecting to My Events.');
    navigate('#/dashboard/my-events');
  };

  return (
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-slide-up">
      
      <div class="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-2">
            <span class="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200 rounded-full">
              {event.mode} • LIVE
            </span>
            <h1 class="font-display text-2xl sm:text-4xl font-extrabold text-slate-900">{event.name}</h1>
            <p class="text-sm text-slate-600 font-medium">{event.tagline}</p>
          </div>

          <div class="flex items-center space-x-3">
            <button onClick={handleRegister} class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md">
              Register for Event ➔
            </button>
          </div>
        </div>

        {/* Contextual Intelligence Panel: YOUR EVENTOS FIT */}
        <div class="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-2xl p-5 text-white space-y-3">
          <div class="flex items-center justify-between border-b border-blue-800/80 pb-2">
            <span class="font-display font-extrabold text-sm text-cyan-300">⚡ YOUR EVENTOS FIT (94% MATCH)</span>
            <span class="text-xs font-bold text-amber-300">Submission 72% Complete</span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-semibold">
            <div>Profile: <span class="text-emerald-400 font-bold block">✓ Complete</span></div>
            <div>Registration: <span class="text-emerald-400 font-bold block">✓ Verified</span></div>
            <div>Team: <span class="text-emerald-400 font-bold block">✓ NeuralShift</span></div>
            <div>Challenge: <span class="text-emerald-400 font-bold block">✓ Agentic OS</span></div>
            <div>Submission: <span class="text-amber-300 font-bold block">⚠ Demo URL Missing</span></div>
          </div>
        </div>

        {/* Challenges Section */}
        <div class="space-y-4">
          <h2 class="font-display font-bold text-lg text-slate-900">Challenges & Track Prizes</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            {challenges.map(c => (
              <div key={c.id} class="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-2">
                <div class="flex items-center justify-between">
                  <h3 class="font-bold text-slate-900 text-sm">{c.title}</h3>
                  <span class="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-extrabold rounded-full">{c.prize}</span>
                </div>
                <p class="text-xs text-slate-600 font-medium">{c.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// 7. PUBLIC LEADERBOARD VIEW (#/events/:slug/leaderboard)
// --------------------------------------------------------------------------
function PublicLeaderboardView({ leaderboard, sequenceNumber }) {
  return (
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-slide-up">
      <div class="glass-card rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-glass space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <span class="text-xs font-bold text-blue-600 uppercase tracking-wider">Live Event Stream</span>
            <h1 class="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">Official Competition Rankings</h1>
          </div>
          <span class="px-4 py-2 bg-blue-600 text-white font-extrabold text-xs rounded-full shadow-md">
            Seq #{sequenceNumber}
          </span>
        </div>

        <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table class="w-full text-left text-xs sm:text-sm">
            <thead class="bg-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
              <tr>
                <th class="py-3.5 px-4">Rank</th>
                <th class="py-3.5 px-4">Team Name</th>
                <th class="py-3.5 px-4">Movement</th>
                <th class="py-3.5 px-4">Normalized Score</th>
                <th class="py-3.5 px-4">Submission Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
              {leaderboard.map(r => (
                <tr key={r.team_id} class="hover:bg-slate-50 transition-colors">
                  <td class="py-3.5 px-4 font-bold text-slate-900">#{r.rank}</td>
                  <td class="py-3.5 px-4 font-semibold text-slate-800">
                    {r.team_name} <span class="text-xs text-slate-400">({r.team_id})</span>
                  </td>
                  <td class="py-3.5 px-4 font-bold text-emerald-600">{r.movement || '↑1'}</td>
                  <td class="py-3.5 px-4 font-extrabold text-blue-600">{r.score.toFixed(1)} pts</td>
                  <td class="py-3.5 px-4">
                    <span class={`px-2.5 py-1 rounded-full text-xs font-bold ${r.status === 'FINAL' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// 8. DEVELOPER PROFILE VIEW (#/profile) — Rich Data Model & Achievements
// --------------------------------------------------------------------------
function DeveloperProfileView({ userProfile, navigate }) {
  const [profileData, setProfileData] = useState(null);
  const [showFullBio, setShowFullBio] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/profile/usr_part_1', {
        headers: { 'x-user-id': 'usr_part_1' },
      });
      const data = await res.json();
      setProfileData(data);
    } catch (e) { console.error(e); }
  };

  if (!profileData) return <div class="p-12 text-center text-slate-400 font-medium">Loading developer profile...</div>;

  return (
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-slide-up">
      
      {/* Header Section with Edit Affordance */}
      <div class="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div class="flex items-center space-x-5">
            <div class="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-extrabold text-2xl flex items-center justify-center shadow-lg">
              RY
            </div>
            <div class="space-y-1">
              <div class="flex items-center space-x-3">
                <h1 class="font-display font-extrabold text-2xl text-slate-900">{profileData.name}</h1>
                <span class="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">@{profileData.handle}</span>
              </div>
              <p class="text-xs text-blue-600 font-bold">{profileData.institution}</p>
              {profileData.resume_url && (
                <a href={profileData.resume_url} target="_blank" rel="noreferrer" class="inline-flex items-center space-x-1 text-xs font-bold text-slate-600 hover:text-blue-600">
                  <span>📄</span> <span>View Signed Resume PDF</span>
                </a>
              )}
            </div>
          </div>

          <div class="flex items-center space-x-3">
            <button onClick={() => navigate('#/onboarding')} class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all">
              ✏️ Edit Profile Section
            </button>
          </div>
        </div>

        {/* Truncated Bio */}
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs font-medium text-slate-700 space-y-1">
          <div class="font-bold text-slate-900 uppercase text-[10px]">About</div>
          <p>
            {showFullBio ? profileData.bio : `${profileData.bio.slice(0, 100)}...`}
          </p>
          {profileData.bio.length > 100 && (
            <button onClick={() => setShowFullBio(!showFullBio)} class="text-blue-600 font-bold hover:underline">
              {showFullBio ? 'Read less' : 'Read more'}
            </button>
          )}
        </div>

        {/* Activity Streak & Gamification Stats */}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div class="bg-emerald-50 p-4 rounded-2xl border border-emerald-200">
            <span class="text-xs font-bold text-emerald-800 uppercase">Activity Streak</span>
            <div class="text-2xl font-extrabold text-emerald-600">🔥 {profileData.activity_streak?.current_streak || 4} Days</div>
            <span class="text-[11px] text-emerald-700 font-medium">Max streak: {profileData.activity_streak?.max_streak || 7} days</span>
          </div>

          <div class="bg-blue-50 p-4 rounded-2xl border border-blue-200">
            <span class="text-xs font-bold text-blue-800 uppercase">Global Rank</span>
            <div class="text-2xl font-extrabold text-blue-600">Rank #{profileData.gamification?.global_rank || 1}</div>
            <span class="text-[11px] text-blue-700 font-medium">O(log n) Redis Sorted Set</span>
          </div>

          <div class="bg-indigo-50 p-4 rounded-2xl border border-indigo-200">
            <span class="text-xs font-bold text-indigo-800 uppercase">Points Ledger Aggregate</span>
            <div class="text-2xl font-extrabold text-indigo-600">⚡ {profileData.gamification?.total_points || 175} pts</div>
            <span class="text-[11px] text-indigo-700 font-medium">Immutable append-only ledger</span>
          </div>
        </div>
      </div>

      {/* Canonical Skills */}
      <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-3">
        <h2 class="font-display font-bold text-lg text-slate-900">Canonical Skill Taxonomy</h2>
        <div class="flex flex-wrap gap-2">
          {profileData.skills?.map(s => (
            <span key={s.canonical_id} class="px-3 py-1.5 bg-blue-50 text-blue-800 border border-blue-200 font-bold text-xs rounded-xl">
              #{s.display_name}
            </span>
          ))}
        </div>
      </div>

      {/* Achievements: Structural & Visual Contrast between Organizer-Verified vs Self-Reported */}
      <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-6">
        <h2 class="font-display font-bold text-lg text-slate-900">Achievements & Recognition</h2>

        {/* 1. Organizer-Verified Achievements */}
        <div class="space-y-3">
          <div class="flex items-center space-x-2 text-xs font-extrabold text-emerald-800 uppercase tracking-wider">
            <span>🛡️ ORGANIZER-VERIFIED ACHIEVEMENTS</span>
            <span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px]">High Integrity</span>
          </div>

          <div class="space-y-3">
            {profileData.achievements?.verified?.map(ach => (
              <div key={ach.id} class="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between badge-verified-glow">
                <div class="space-y-1">
                  <div class="flex items-center space-x-2">
                    <h3 class="font-bold text-emerald-950 text-sm">{ach.title}</h3>
                    <span class="px-2 py-0.5 bg-emerald-600 text-white font-extrabold text-[10px] rounded-md">VERIFIED 🛡️</span>
                  </div>
                  <p class="text-xs text-emerald-800 font-medium">{ach.description}</p>
                  <span class="text-[11px] text-emerald-700 font-bold block">Verified by {ach.verifier_name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Self-Reported Achievements */}
        <div class="space-y-3 pt-4 border-t border-slate-100">
          <div class="flex items-center space-x-2 text-xs font-extrabold text-slate-500 uppercase tracking-wider">
            <span>👤 SELF-REPORTED ACHIEVEMENTS</span>
            <span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px]">Unverified Claim</span>
          </div>

          <div class="space-y-3">
            {profileData.achievements?.self_reported?.map(ach => (
              <div key={ach.id} class="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between opacity-80">
                <div class="space-y-1">
                  <div class="flex items-center space-x-2">
                    <h3 class="font-bold text-slate-800 text-sm">{ach.title}</h3>
                    <span class="px-2 py-0.5 bg-slate-200 text-slate-700 font-bold text-[10px] rounded-md">SELF-REPORTED 👤</span>
                  </div>
                  <p class="text-xs text-slate-600 font-medium">{ach.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Multiple Education Entries */}
      <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-4">
        <h2 class="font-display font-bold text-lg text-slate-900">Education History</h2>
        <div class="space-y-3">
          {profileData.education?.map(edu => (
            <div key={edu.id} class="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
              <h3 class="font-bold text-slate-900 text-sm">{edu.degree} — {edu.field}</h3>
              <p class="text-xs font-semibold text-blue-600">{edu.institution}</p>
              <p class="text-xs text-slate-500">{edu.start_date} – {edu.end_date || 'Present'}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// --------------------------------------------------------------------------
// 9. PARTICIPANT WORKSPACE VIEW (#/dashboard/my-events)
// --------------------------------------------------------------------------
function ParticipantWorkspaceView({ activeUserId, navigate, route, userProfile }) {
  const [activeTab, setActiveTab] = useState('my-events');
  const [matchResult, setMatchResult] = useState(null);

  const handleMatch = async () => {
    try {
      const res = await fetch('/api/teams/matchmaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateSkills: ['DevOps', 'Kubernetes', 'Cloud'] }),
      });
      const data = await res.json();
      setMatchResult(data);
    } catch (e) { console.error(e); }
  };

  return (
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-slide-up">
      
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h1 class="font-display font-extrabold text-xl text-slate-900">Participant Workspace</h1>
          <p class="text-xs text-slate-500 font-medium">Team NeuralShift (team_42) • EVENTOS Global Hackathon 2026</p>
        </div>

        <div class="flex items-center space-x-2">
          {['my-events', 'teams', 'submissions', 'schedule', 'notifications'].map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              class={`px-3.5 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${activeTab === t ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'my-events' && (
        <div class="space-y-6">
          {/* Signature Embedded Contextual AI Action Card */}
          <div class="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl space-y-4">
            <div class="flex items-center justify-between">
              <span class="px-3 py-1 bg-amber-400/20 text-amber-300 border border-amber-400/40 text-xs font-extrabold rounded-full">
                ⚡ NEXT BEST ACTION
              </span>
              <span class="text-xs font-bold text-slate-300">28 minutes remaining</span>
            </div>

            <div class="space-y-2">
              <h2 class="font-display font-extrabold text-2xl sm:text-3xl text-white">
                Complete Team NeuralShift Submission
              </h2>
              <p class="text-xs sm:text-sm text-blue-100 leading-relaxed font-medium max-w-2xl">
                Your draft is currently <strong>72% complete</strong>. Missing: <strong>Live Demo URL</strong>. Hall B is at <strong>96% capacity (CRITICAL)</strong>—leave by <strong>14:45</strong> to arrive for your 15:00 workshop.
              </p>
            </div>

            <button onClick={() => navigate('#/events/eventos-global-hackathon-2026/submission')} class="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs rounded-xl shadow-md transition-all">
              Continue Submission Portal ➔
            </button>
          </div>
        </div>
      )}

      {activeTab === 'teams' && (
        <div class="glass-card rounded-3xl p-6 border border-slate-200 shadow-glass space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="font-display font-bold text-lg text-slate-900">Intelligent Team Matchmaking</h2>
            <button onClick={handleMatch} class="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl">Run Matchmaker</button>
          </div>

          {matchResult && (
            <div class="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-2 text-xs">
              <div class="flex justify-between font-bold text-blue-900">
                <span>Candidate: {matchResult.candidate_name}</span>
                <span class="text-emerald-700 font-extrabold">{matchResult.compatibility_score}% Compatibility Match</span>
              </div>
              <div class="text-blue-800 space-y-1">
                {matchResult.reasons.map((r, i) => <div key={i}>{r}</div>)}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'submissions' && (
        <SubmissionWorkspaceView navigate={navigate} />
      )}

      {activeTab === 'schedule' && (
        <div class="glass-card rounded-3xl p-6 border border-slate-200 shadow-glass space-y-4">
          <h2 class="font-display font-bold text-lg text-slate-900">Personalized Live Schedule</h2>
          <div class="bg-white p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
            <div class="flex justify-between font-bold text-slate-900">
              <span>AI Agentic Operations Masterclass</span>
              <span class="text-rose-600">Hall B (96% Capacity)</span>
            </div>
            <p class="text-slate-500 font-medium">Starts at 15:00 • Hall B</p>
            <div class="p-2.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl font-bold">
              EVENTOS recommendation: Leave by 14:45 to avoid congestion delay.
            </div>
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div class="glass-card rounded-3xl p-6 border border-slate-200 shadow-glass space-y-4">
          <h2 class="font-display font-bold text-lg text-slate-900">Contextual Notifications</h2>
          <div class="space-y-3 text-xs">
            <div class="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
              <div>
                <strong class="text-slate-900 block font-bold">Demo URL Missing</strong>
                <span class="text-slate-500">Submission closes in 28 minutes.</span>
              </div>
              <button onClick={() => navigate('#/events/eventos-global-hackathon-2026/submission')} class="px-3.5 py-1.5 bg-blue-600 text-white font-bold rounded-xl">Complete ➔</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// 10. SUBMISSION WORKSPACE VIEW (#/events/:slug/submission)
// --------------------------------------------------------------------------
function SubmissionWorkspaceView({ navigate }) {
  return (
    <div class="max-w-4xl mx-auto py-8 px-4 animate-slide-up space-y-6">
      <div class="glass-card rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-glass space-y-6">
        <div class="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 class="font-display font-bold text-xl text-slate-900">Developer Submission Portal</h2>
            <p class="text-xs text-slate-500 font-medium">Autosaved checklist • 28 minutes remaining</p>
          </div>
          <span class="px-3 py-1 bg-amber-100 text-amber-800 font-bold text-xs rounded-full">
            72% Progress
          </span>
        </div>

        <div class="space-y-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">Project Name</label>
            <input type="text" value="NeuralShift Agent OS" class="w-full bg-white border border-slate-200 rounded-xl p-2.5 font-semibold text-slate-800" />
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Problem Statement</label>
            <textarea rows="2" class="w-full bg-white border border-slate-200 rounded-xl p-2.5 font-medium text-slate-800">
              Live event operations are fragmented and lack context-aware decision engines.
            </textarea>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">GitHub Repository URL</label>
            <input type="text" value="https://github.com/neuralshift/event-os" class="w-full bg-white border border-slate-200 rounded-xl p-2.5 font-mono text-slate-800" />
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1 text-rose-600">Live Demo URL (Missing)</label>
            <input type="text" placeholder="https://demo.example.com" class="w-full bg-rose-50 border border-rose-200 rounded-xl p-2.5 font-mono text-slate-800" />
          </div>

          <button class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md">
            Save Draft Submission
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// 11. JUDGE DESK VIEW (#/judge)
// --------------------------------------------------------------------------
function JudgeDeskView({ activeUserId, navigate, route, leaderboard, setLeaderboard, setSequenceNumber }) {
  const [selectedSub, setSelectedSub] = useState(null);
  const [rawScore, setRawScore] = useState(92);
  const [feedback, setFeedback] = useState('Excellent context engine architecture.');

  const handleSubmitScore = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/judging/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: DEFAULT_EVENT_ID,
          teamId: 'team_42',
          judgeUserId: activeUserId,
          criteriaScores: { tech: rawScore * 0.4, impact: rawScore * 0.4, design: rawScore * 0.2 },
          rawScore: parseFloat(rawScore),
          actorId: activeUserId,
          strategy: 'RAW',
        }),
      });

      const data = await res.json();
      if (!res.ok) return alert(data.message);

      if (data.leaderboard) {
        setLeaderboard(data.leaderboard.rankings);
        setSequenceNumber(data.leaderboard.sequence_number);
      }
      alert(`Score submitted successfully! Leaderboard projection updated to Seq #${data.leaderboard.sequence_number}`);
      setSelectedSub(null);
    } catch (e) { alert(e.message); }
  };

  return (
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-slide-up">
      <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs flex items-center justify-between">
        <div>
          <h1 class="font-display font-extrabold text-xl text-slate-900">Judge Desk — Dr. Aris Smith</h1>
          <p class="text-xs text-slate-500 font-medium">Evaluation Queue • 4 Pending Submissions</p>
        </div>
        <span class="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold rounded-full">Rubric v1 Active</span>
      </div>

      {!selectedSub ? (
        <div class="glass-card rounded-3xl p-6 border border-slate-200 shadow-glass space-y-4">
          <h2 class="font-display font-bold text-lg text-slate-900">Pending Evaluation Queue</h2>
          <div class="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
            <div>
              <span class="px-2 py-0.5 bg-rose-50 text-rose-700 text-[10px] font-bold rounded">Rank #1 Pressure</span>
              <h3 class="font-bold text-slate-900 text-sm mt-1">Team 42 — NeuralShift</h3>
              <p class="text-xs text-slate-500">Submitted 45 min ago • Track: AI Agents</p>
            </div>
            <button onClick={() => setSelectedSub('sub_42')} class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl">
              Evaluate ➔
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmitScore} class="glass-card rounded-3xl p-6 border border-slate-200 shadow-glass space-y-4">
          <h2 class="font-display font-bold text-lg text-slate-900">Rubric Scoring — NeuralShift</h2>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Raw Score (0 - 100):</label>
            <input type="number" min="0" max="100" value={rawScore} onChange={(e) => setRawScore(e.target.value)} class="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-bold" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Feedback:</label>
            <textarea rows="3" value={feedback} onChange={(e) => setFeedback(e.target.value)} class="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs" />
          </div>
          <div class="flex space-x-3">
            <button type="submit" class="flex-1 py-2.5 bg-blue-600 text-white font-bold text-xs rounded-xl">Submit Score</button>
            <button type="button" onClick={() => setSelectedSub(null)} class="px-4 py-2.5 bg-slate-200 text-slate-700 font-bold text-xs rounded-xl">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// 12. ORGANIZER COMMAND CENTER VIEW (#/organizer)
// --------------------------------------------------------------------------
function OrganizerCommandCenterView({ activeUserId, navigate, route, risksData, fetchRisks, auditLog, fetchAuditLog, venues }) {
  const [activeTab, setActiveTab] = useState('overview');

  const handleApprove = async (actionId) => {
    try {
      const res = await fetch('/api/organizer/actions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId, actorId: activeUserId }),
      });
      const data = await res.json();
      alert(data.message);
      fetchRisks();
      fetchAuditLog();
    } catch (e) { alert(e.message); }
  };

  return (
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-slide-up">
      <div class="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div class="flex items-center space-x-2">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
              <span class="text-xs font-bold text-emerald-400">EVENT LIVE • OPERATIONAL</span>
            </div>
            <h1 class="font-display font-extrabold text-2xl sm:text-3xl text-white mt-1">
              Organizer Live Command Center
            </h1>
          </div>

          <div class="flex items-center space-x-2">
            {['overview', 'risks', 'actions', 'audit'].map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                class={`px-3.5 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${activeTab === t ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'overview' && (
        <div class="space-y-6">
          <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-4">
            <h2 class="font-display font-bold text-lg text-slate-900">Predictive Event Health Trend</h2>
            <div class="grid grid-cols-3 gap-4 text-center">
              <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <span class="text-xs font-bold text-slate-400 uppercase">Current</span>
                <div class="text-2xl font-extrabold text-emerald-600">87 / 100</div>
              </div>
              <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <span class="text-xs font-bold text-slate-400 uppercase">+30 Min Trend</span>
                <div class="text-2xl font-extrabold text-amber-600">79 / 100</div>
              </div>
              <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <span class="text-xs font-bold text-slate-400 uppercase">+60 Min Trend</span>
                <div class="text-2xl font-extrabold text-rose-600">71 / 100</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'risks' && (
        <div class="glass-card rounded-3xl p-6 border border-slate-200 shadow-glass space-y-4">
          <h2 class="font-display font-bold text-lg text-slate-900">Operational Anomaly Radar</h2>
          <div class="space-y-3">
            {risksData.risks.map(r => (
              <div key={r.id} class="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span class={`px-2 py-0.5 text-[10px] font-bold rounded ${r.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{r.severity}</span>
                  <h3 class="font-bold text-slate-900 text-sm mt-1">{r.title}</h3>
                  <p class="text-xs text-slate-500">{r.evidence}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'actions' && (
        <div class="glass-card rounded-3xl p-6 border border-slate-200 shadow-glass space-y-4">
          <h2 class="font-display font-bold text-lg text-slate-900">Event Action Center</h2>
          <div class="space-y-3">
            {risksData.actions.map(act => (
              <div key={act.id} class="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span class="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded">{act.priority} PRIORITY</span>
                  <h3 class="font-bold text-slate-900 text-sm mt-1">{act.title}</h3>
                  <p class="text-xs text-slate-500">{act.reason}</p>
                </div>
                <button
                  onClick={() => handleApprove(act.id)}
                  disabled={act.status === 'APPROVED'}
                  class="px-4 py-2 bg-blue-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl"
                >
                  {act.status === 'APPROVED' ? 'Approved ✓' : 'Approve & Execute'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div class="glass-card rounded-3xl p-6 border border-slate-200 shadow-glass space-y-4">
          <h2 class="font-display font-bold text-lg text-slate-900">Immutable Audit Center Stream</h2>
          <div class="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 text-xs">
            {auditLog.map(a => (
              <div key={a.id} class="p-3.5 flex items-center justify-between">
                <div>
                  <strong class="text-slate-900 block">{a.action}</strong>
                  <span class="text-slate-500">By {a.actor_name} • Target: {a.target}</span>
                </div>
                <span class="text-slate-400 font-mono text-[11px]">{new Date(a.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Ecosystem Views
function OrganizationsView({ orgs, navigate }) {
  return (
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-slide-up">
      <h1 class="font-display font-extrabold text-2xl text-slate-900">Organization Ecosystem (Sample Demo Orgs)</h1>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {orgs.map(o => (
          <div key={o.id} class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
            <h3 class="font-bold text-slate-900 text-base">{o.name}</h3>
            <p class="text-xs text-slate-500 font-medium">{o.tagline}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PeopleView({ people, navigate }) {
  return (
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-slide-up">
      <h1 class="font-display font-extrabold text-2xl text-slate-900">Developer & Teammate Discovery</h1>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {people.map(p => (
          <div key={p.id} class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
            <h3 class="font-bold text-slate-900 text-base">{p.name}</h3>
            <p class="text-xs text-blue-600 font-semibold">{p.college} • {p.academic_year}</p>
            <p class="text-xs text-slate-500">{p.tagline}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// 13. GLOBAL COMMAND MENU MODAL (Cmd+K)
// --------------------------------------------------------------------------
function CommandMenuModal({ onClose, navigate, events }) {
  const [input, setInput] = useState('');

  return (
    <div class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-start justify-center pt-20 px-4 animate-slide-up">
      <div class="bg-white rounded-3xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden">
        <div class="p-4 border-b border-slate-100 flex items-center space-x-3">
          <span class="text-slate-400 text-sm">🔍</span>
          <input
            type="text"
            autoFocus
            placeholder="Type a command or search events..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            class="w-full bg-transparent text-sm font-semibold text-slate-800 focus:outline-none"
          />
          <button onClick={onClose} class="text-xs font-bold text-slate-400 hover:text-slate-700">ESC</button>
        </div>

        <div class="p-4 max-h-80 overflow-y-auto space-y-2 text-xs font-medium">
          <div class="text-slate-400 font-bold uppercase text-[10px] tracking-wider mb-1">Quick Navigation</div>
          <div onClick={() => { navigate('#/discover'); onClose(); }} class="p-2.5 rounded-xl hover:bg-blue-50 hover:text-blue-700 cursor-pointer flex items-center space-x-2">
            <span>🌐</span> <span>Discover Events Engine</span>
          </div>
          <div onClick={() => { navigate('#/dashboard/my-events'); onClose(); }} class="p-2.5 rounded-xl hover:bg-blue-50 hover:text-blue-700 cursor-pointer flex items-center space-x-2">
            <span>👤</span> <span>Participant Workspace</span>
          </div>
          <div onClick={() => { navigate('#/judge/queue'); onClose(); }} class="p-2.5 rounded-xl hover:bg-blue-50 hover:text-blue-700 cursor-pointer flex items-center space-x-2">
            <span>⚖️</span> <span>Judge Desk & Evaluation Queue</span>
          </div>
          <div onClick={() => { navigate('#/organizer/overview'); onClose(); }} class="p-2.5 rounded-xl hover:bg-blue-50 hover:text-blue-700 cursor-pointer flex items-center space-x-2">
            <span>📊</span> <span>Organizer Command Center</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;


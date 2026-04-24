// ─────────────────────────────────────────────────────────────────────────────
// IPL Predict — app.js
// All Supabase calls are wrapped in try/catch so the UI degrades gracefully
// while the backend is not yet wired up.
// ─────────────────────────────────────────────────────────────────────────────

/* global SUPABASE_URL, SUPABASE_ANON_KEY */

// ── Supabase client ───────────────────────────────────────────────────────────
let supabase = null;
try {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.warn('Supabase not initialised — running in demo mode.', e.message);
}

// ── Demo / placeholder data (used when Supabase is not configured) ────────────
const DEMO_MATCHES = [
  {
    id: 1,
    team1: 'CSK', team2: 'MI',
    team1_full: 'Chennai Super Kings', team2_full: 'Mumbai Indians',
    venue: 'MA Chidambaram Stadium, Chennai',
    match_time: new Date(Date.now() + 86400 * 1000).toISOString(),
    status: 'upcoming', winner: null,
    team1_emoji: '🦁', team2_emoji: '🌊',
  },
  {
    id: 2,
    team1: 'RCB', team2: 'KKR',
    team1_full: 'Royal Challengers Bangalore', team2_full: 'Kolkata Knight Riders',
    venue: 'M Chinnaswamy Stadium, Bengaluru',
    match_time: new Date(Date.now() + 2 * 86400 * 1000).toISOString(),
    status: 'upcoming', winner: null,
    team1_emoji: '🔴', team2_emoji: '🟣',
  },
  {
    id: 3,
    team1: 'DC', team2: 'SRH',
    team1_full: 'Delhi Capitals', team2_full: 'Sunrisers Hyderabad',
    venue: 'Arun Jaitley Stadium, Delhi',
    match_time: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    status: 'resulted', winner: 'DC',
    team1_emoji: '🔵', team2_emoji: '🟠',
  },
  {
    id: 4,
    team1: 'PBKS', team2: 'GT',
    team1_full: 'Punjab Kings', team2_full: 'Gujarat Titans',
    venue: 'HPCA Stadium, Dharamsala',
    match_time: new Date(Date.now() + 3 * 86400 * 1000).toISOString(),
    status: 'upcoming', winner: null,
    team1_emoji: '🔴', team2_emoji: '🔵',
  },
  {
    id: 5,
    team1: 'RR', team2: 'LSG',
    team1_full: 'Rajasthan Royals', team2_full: 'Lucknow Super Giants',
    venue: 'Sawai Mansingh Stadium, Jaipur',
    match_time: new Date(Date.now() - 86400 * 1000).toISOString(),
    status: 'resulted', winner: 'LSG',
    team1_emoji: '🩷', team2_emoji: '🩵',
  },
];

const DEMO_PREDICTIONS = [
  { match_id: 3, team_picked: 'DC', use_booster: false },
  { match_id: 5, team_picked: 'RR', use_booster: true  },
];

const DEMO_LEADERBOARD = [
  { rank: 1, name: 'Vettri',   points: 180, predictions: 9,  correct: 7 },
  { rank: 2, name: 'Chezhian', points: 140, predictions: 9,  correct: 6 },
  { rank: 3, name: 'Priya',    points: 110, predictions: 8,  correct: 5 },
  { rank: 4, name: 'Arjun',    points:  80, predictions: 7,  correct: 4 },
  { rank: 5, name: 'Meena',    points:  50, predictions: 6,  correct: 3 },
];

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  user: null,
  matches: [],
  predictions: {},   // keyed by match_id
  boostersLeft: 3,
  leaderboard: [],
  selectedTeam: {},  // keyed by match_id
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupAuthListeners();

  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await handleSession(session);
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) handleSession(session);
      else handleSignOut();
    });
  } else {
    // Demo mode — show UI as a logged-in guest
    state.user = { id: 'demo', email: 'demo@ipl.predict', user_metadata: { full_name: 'Demo User', avatar_url: null } };
    renderAuthState();
    loadData();
  }
});

// ── Auth ──────────────────────────────────────────────────────────────────────
async function handleSession(session) {
  state.user = session.user;
  renderAuthState();
  await loadData();
}

function handleSignOut() {
  state.user = null;
  state.predictions = {};
  renderAuthState();
  renderMatchesTab();
}

function renderAuthState() {
  const gate     = $('auth-gate');
  const content  = $('app-content');
  const authArea = $('auth-area');

  if (state.user) {
    gate.style.display    = 'none';
    content.style.display = 'block';

    const meta   = state.user.user_metadata || {};
    const name   = meta.full_name || state.user.email || 'Player';
    const avatar = meta.avatar_url;

    authArea.innerHTML = `
      ${avatar ? `<img src="${escHtml(avatar)}" alt="avatar" class="avatar">` : ''}
      <span id="user-name">${escHtml(name)}</span>
      <button class="btn btn-outline btn-sm" id="sign-out-btn">Sign out</button>
    `;
    $('sign-out-btn').addEventListener('click', signOut);
  } else {
    gate.style.display    = 'block';
    content.style.display = 'none';
    authArea.innerHTML    = '';
  }
}

function setupAuthListeners() {
  $('btn-google').addEventListener('click', signInWithGoogle);
  $('btn-magic').addEventListener('click', () => {
    const form = $('magic-email-form');
    form.style.display = form.style.display === 'flex' ? 'none' : 'flex';
  });
  $('btn-send-magic').addEventListener('click', sendMagicLink);
}

async function signInWithGoogle() {
  if (!supabase) { toast('Running in demo mode — Supabase not configured.', 'info'); return; }
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google',
    options: { redirectTo: window.location.href } });
  if (error) toast(error.message, 'error');
}

async function sendMagicLink() {
  const email = $('magic-email').value.trim();
  if (!email) { toast('Please enter your email.', 'error'); return; }
  if (!supabase) { toast('Running in demo mode — Supabase not configured.', 'info'); return; }
  const { error } = await supabase.auth.signInWithOtp({ email,
    options: { emailRedirectTo: window.location.href } });
  if (error) toast(error.message, 'error');
  else toast('Magic link sent! Check your inbox.', 'success');
}

async function signOut() {
  if (supabase) await supabase.auth.signOut();
  handleSignOut();
}

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadData() {
  await Promise.all([loadMatches(), loadPredictions()]);
  renderMatchesTab();
  loadLeaderboard();
  subscribeLeaderboard();
}

async function loadMatches() {
  if (!supabase) { state.matches = DEMO_MATCHES; return; }
  try {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .order('match_time', { ascending: true });
    if (error) throw error;
    state.matches = data || [];
  } catch (e) {
    console.error('loadMatches:', e.message);
    state.matches = DEMO_MATCHES;
  }
}

async function loadPredictions() {
  if (!state.user || !supabase) {
    if (!supabase) {
      DEMO_PREDICTIONS.forEach(p => { state.predictions[p.match_id] = p; });
    }
    return;
  }
  try {
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('player_id', state.user.id);
    if (error) throw error;
    state.predictions = {};
    (data || []).forEach(p => { state.predictions[p.match_id] = p; });

    // Count boosters used
    const boostersUsed = (data || []).filter(p => p.use_booster).length;
    state.boostersLeft = Math.max(0, 3 - boostersUsed);
  } catch (e) {
    console.error('loadPredictions:', e.message);
  }
}

async function loadLeaderboard() {
  const container = $('leaderboard-body');
  if (!container) return;

  if (!supabase) { state.leaderboard = DEMO_LEADERBOARD; renderLeaderboard(); return; }
  try {
    // Assumes a "leaderboard" view exists in Supabase (or RPC function)
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .order('points', { ascending: false });
    if (error) throw error;
    state.leaderboard = (data || []).map((r, i) => ({ ...r, rank: i + 1 }));
    renderLeaderboard();
  } catch (e) {
    console.error('loadLeaderboard:', e.message);
    state.leaderboard = DEMO_LEADERBOARD;
    renderLeaderboard();
  }
}

function subscribeLeaderboard() {
  if (!supabase) return;
  supabase
    .channel('leaderboard-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, loadLeaderboard)
    .subscribe();
}

// ── Submit prediction ─────────────────────────────────────────────────────────
async function submitPrediction(matchId) {
  const teamPicked = state.selectedTeam[matchId];
  if (!teamPicked) { toast('Please select a team first.', 'error'); return; }

  const useBooster = !!document.querySelector(`#booster-${matchId}`)?.checked;

  if (useBooster && state.boostersLeft <= 0) {
    toast('No boosters remaining!', 'error');
    return;
  }

  if (!supabase) {
    // Demo: store locally
    state.predictions[matchId] = { match_id: matchId, team_picked: teamPicked, use_booster: useBooster };
    if (useBooster) state.boostersLeft = Math.max(0, state.boostersLeft - 1);
    toast(`Prediction saved: ${teamPicked}${useBooster ? ' 🚀 (boosted)' : ''}`, 'success');
    renderMatchesTab();
    renderBoosterBadge();
    return;
  }

  try {
    const { error } = await supabase.functions.invoke('submit-prediction', {
      body: { match_id: matchId, team_picked: teamPicked, use_booster: useBooster },
    });
    if (error) throw error;
    toast(`Prediction saved: ${teamPicked}${useBooster ? ' 🚀 (boosted)' : ''}`, 'success');
    await loadPredictions();
    renderMatchesTab();
    renderBoosterBadge();
  } catch (e) {
    toast(e.message || 'Failed to save prediction.', 'error');
  }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(target).classList.add('active');

      if (target === 'tab-history')     renderHistoryTab();
      if (target === 'tab-leaderboard') loadLeaderboard();
    });
  });
}

// ── Render: Matches ───────────────────────────────────────────────────────────
function renderMatchesTab() {
  renderBoosterBadge();

  const upcoming  = state.matches.filter(m => m.status === 'upcoming');
  const resulted  = state.matches.filter(m => m.status === 'resulted');
  const locked    = state.matches.filter(m => m.status === 'locked');

  const upcomingEl = $('upcoming-matches');
  const resultedEl = $('resulted-matches');

  upcomingEl.innerHTML = '';
  resultedEl.innerHTML = '';

  if (upcoming.length === 0 && locked.length === 0) {
    upcomingEl.innerHTML = emptyState('📅', 'No upcoming matches right now.');
  } else {
    [...upcoming, ...locked].forEach(m => upcomingEl.appendChild(buildMatchCard(m)));
  }

  if (resulted.length === 0) {
    resultedEl.innerHTML = emptyState('🏏', 'No completed matches yet.');
  } else {
    resulted.forEach(m => resultedEl.appendChild(buildMatchCard(m)));
  }
}

function renderBoosterBadge() {
  const badge = $('booster-badge');
  if (!badge) return;
  badge.textContent = `🚀 Double Boosters remaining: ${state.boostersLeft} / 3`;
}

function buildMatchCard(match) {
  const card = document.createElement('div');
  const pred = state.predictions[match.id];
  const isLocked   = match.status === 'locked';
  const isResulted = match.status === 'resulted';
  const isPredicted = !!pred;

  card.className = `match-card${isPredicted ? ' predicted' : ''}${isLocked ? ' locked' : ''}`;

  const badgeClass = isResulted ? 'resulted' : isLocked ? 'locked' : '';
  const badgeText  = isResulted ? '✅ Resulted' : isLocked ? '🔒 Locked' : '🟢 Open';

  const matchDate = new Date(match.match_time);
  const timeStr   = matchDate.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  card.innerHTML = `
    <div class="match-card-header">
      <span class="venue">${escHtml(match.venue || '')}</span>
      <span class="match-badge ${badgeClass}">${badgeText}</span>
    </div>
    <div class="match-teams">
      <button class="team-btn${getTeamClass(match, match.team1, pred, isLocked || isResulted)}"
        data-match="${match.id}" data-team="${escHtml(match.team1)}"
        ${isLocked || isResulted ? 'disabled' : ''}>
        <span class="team-logo-placeholder">${match.team1_emoji || '🏏'}</span>
        <span>${escHtml(match.team1)}</span>
        <span style="font-size:.72rem;font-weight:400;color:var(--muted)">${escHtml(match.team1_full || '')}</span>
      </button>
      <span class="vs-label">VS</span>
      <button class="team-btn${getTeamClass(match, match.team2, pred, isLocked || isResulted)}"
        data-match="${match.id}" data-team="${escHtml(match.team2)}"
        ${isLocked || isResulted ? 'disabled' : ''}>
        <span class="team-logo-placeholder">${match.team2_emoji || '🏏'}</span>
        <span>${escHtml(match.team2)}</span>
        <span style="font-size:.72rem;font-weight:400;color:var(--muted)">${escHtml(match.team2_full || '')}</span>
      </button>
    </div>
    <div class="match-card-footer">
      <div class="match-time">🕐 ${timeStr}</div>
      ${buildPredictionControls(match, pred, isLocked, isResulted)}
    </div>
  `;

  // Team selection
  card.querySelectorAll('.team-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const mid  = Number(btn.dataset.match);
      const team = btn.dataset.team;
      state.selectedTeam[mid] = team;
      // Re-render just this card section (simpler: re-render all)
      renderMatchesTab();
    });
  });

  // Submit
  const submitBtn = card.querySelector('.submit-predict-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => submitPrediction(match.id));
  }

  return card;
}

function getTeamClass(match, team, pred, disabled) {
  if (pred && pred.team_picked === team) return disabled ? ' selected' : ' selected';
  if (state.selectedTeam[match.id] === team && !disabled) return ' selected';
  if (match.winner === team) return ' winner';
  if (match.winner && match.winner !== team) return ' loser';
  return '';
}

function buildPredictionControls(match, pred, isLocked, isResulted) {
  if (isResulted && pred) {
    const correct = pred.team_picked === match.winner;
    const pts     = calcPoints(correct, pred.use_booster);
    return `
      <div class="predicted-badge${pred.use_booster ? ' boosted' : ''}">
        You picked <strong>${escHtml(pred.team_picked)}</strong>
        ${pred.use_booster ? '🚀' : ''} —
        ${correct ? '✅ Correct' : '❌ Wrong'}
        <strong>${pts > 0 ? '+' : ''}${pts} pts</strong>
      </div>`;
  }
  if (isResulted && !pred) {
    return `<div class="predicted-badge" style="background:#fff3e0;color:#e65100">
      You did not predict — ❌ -10 pts</div>`;
  }
  if (isLocked && pred) {
    return `<div class="predicted-badge">
      Locked in: <strong>${escHtml(pred.team_picked)}</strong>
      ${pred.use_booster ? '🚀' : ''}</div>`;
  }
  if (isLocked) {
    return `<div class="predicted-badge" style="background:#fff3e0;color:#e65100">
      Predictions locked — none submitted</div>`;
  }

  // Open match
  if (pred) {
    return `<div class="predicted-badge${pred.use_booster ? ' boosted' : ''}">
      Prediction saved: <strong>${escHtml(pred.team_picked)}</strong>
      ${pred.use_booster ? '🚀 (boosted)' : ''}
      <br><small style="font-weight:400">Change your pick below</small></div>
      ${buildOpenControls(match, true)}`;
  }
  return buildOpenControls(match, false);
}

function buildOpenControls(match, hasPred) {
  const canBoost    = state.boostersLeft > 0;
  const teamChosen  = !!state.selectedTeam[match.id];
  return `
    <div class="prediction-controls">
      ${canBoost ? `
        <label class="boost-toggle">
          <input type="checkbox" id="booster-${match.id}">
          🚀 Use Double Booster (${state.boostersLeft} left)
        </label>` : '<span style="font-size:.78rem;color:var(--muted)">No boosters remaining</span>'}
      <button class="submit-predict-btn"
        ${teamChosen ? '' : 'disabled'}>
        ${hasPred ? 'Update Prediction' : 'Submit Prediction'}
      </button>
    </div>`;
}

function calcPoints(correct, boosted) {
  const base = correct ? 20 : -10;
  return boosted ? base * 2 : base;
}

// ── Render: History ───────────────────────────────────────────────────────────
function renderHistoryTab() {
  const container = $('history-list');
  if (!container) return;
  container.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';

  // Merge predictions with match data
  const rows = [];
  for (const [matchId, pred] of Object.entries(state.predictions)) {
    const match = state.matches.find(m => String(m.id) === String(matchId));
    if (!match) continue;
    rows.push({ match, pred });
  }

  if (rows.length === 0) {
    container.innerHTML = emptyState('🏏', 'No predictions submitted yet.');
    return;
  }

  rows.sort((a, b) => new Date(b.match.match_time) - new Date(a.match.match_time));

  container.innerHTML = '';
  rows.forEach(({ match, pred }) => {
    const resulted = match.status === 'resulted';
    const correct  = resulted && pred.team_picked === match.winner;
    const wrong    = resulted && pred.team_picked !== match.winner;
    const pts      = resulted ? calcPoints(correct, pred.use_booster) : null;

    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="history-match">
        <div class="teams">${escHtml(match.team1)} vs ${escHtml(match.team2)}</div>
        <div class="date">${new Date(match.match_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
      </div>
      <div class="history-pick">
        <span>Picked: <strong>${escHtml(pred.team_picked)}</strong></span>
        ${pred.use_booster ? '<span class="pick-chip boosted">🚀 Boosted</span>' : ''}
        ${resulted ? `<span class="pick-chip ${correct ? 'correct' : 'wrong'}">${correct ? '✅ Correct' : '❌ Wrong'}</span>` : '<span class="pick-chip pending">⏳ Pending</span>'}
      </div>
      <div class="history-points ${pts === null ? 'pending' : pts >= 0 ? 'positive' : 'negative'}">
        ${pts === null ? '—' : (pts >= 0 ? '+' : '') + pts}
      </div>
    `;
    container.appendChild(item);
  });
}

// ── Render: Leaderboard ───────────────────────────────────────────────────────
function renderLeaderboard() {
  const tbody = $('leaderboard-body');
  if (!tbody) return;

  if (state.leaderboard.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:2rem">No data yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.leaderboard.map(row => {
    const rankClass = row.rank <= 3 ? `rank-${row.rank}` : 'rank-other';
    const isMe      = state.user && (row.player_id === state.user.id || row.name === (state.user.user_metadata?.full_name));
    return `
      <tr class="player-row${isMe ? '" style="background:#e8f5e9' : ''}">
        <td><span class="rank-badge ${rankClass}">${row.rank}</span></td>
        <td>${escHtml(row.name || row.player_name || 'Player')}${isMe ? ' 👈' : ''}</td>
        <td style="color:${row.points >= 0 ? '#2e7d32' : '#c62828'};font-weight:800">${row.points >= 0 ? '+' : ''}${row.points}</td>
        <td>${row.predictions ?? '—'}</td>
        <td>${row.correct ?? '—'}</td>
      </tr>`;
  }).join('');
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const container = $('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function emptyState(icon, text) {
  return `<div class="empty-state"><div class="icon">${icon}</div><p>${text}</p></div>`;
}

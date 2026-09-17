const GAME_LABELS = { timeguesser: 'TimeGuesser', speedquiz: 'Speed Quiz' };
const state = { conversationId: null };

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function qs(params) {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) usp.set(key, value);
  }
  const str = usp.toString();
  return str ? `?${str}` : '';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Per-viewer convenience only (remembers the last-picked group in this
// browser) - never relied on for anything shared or read back by the server.
function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

async function loadConversations() {
  const { conversations } = await fetchJSON('/api/conversations');
  const picker = document.getElementById('conversationPicker');
  const select = document.getElementById('conversationSelect');

  if (conversations.length === 0) {
    return null;
  }

  if (conversations.length > 1) {
    picker.hidden = false;
    select.innerHTML = conversations
      .map((c) => `<option value="${escapeHtml(c.conversationId)}">${escapeHtml(c.label)} (${c.activePlayers} active)</option>`)
      .join('');
    const stored = safeGet('sgt.conversationId');
    const initial = conversations.some((c) => c.conversationId === stored) ? stored : conversations[0].conversationId;
    select.value = initial;
    select.addEventListener('change', () => {
      safeSet('sgt.conversationId', select.value);
      refresh(select.value);
    });
    return initial;
  }

  return conversations[0].conversationId;
}

function renderStatus(status) {
  const grid = document.getElementById('statusGrid');
  document.getElementById('statusHeading').textContent = status.friendlyDate
    ? `Today’s status — ${status.friendlyDate}`
    : 'Today’s status';

  const games = Object.values(status.games || {});
  if (games.length === 0) {
    grid.innerHTML = '<p class="muted">No active players yet.</p>';
    return;
  }

  grid.innerHTML = games
    .map((game) => {
      const label = GAME_LABELS[game.game] || game.game;
      const submittedCount = game.submitted.length;
      const totalCount = submittedCount + game.missing.length;

      let bodyHtml;
      if (game.finalized) {
        const names = game.finalized.winners.map((w) => escapeHtml(w.displayName)).join(' &amp; ');
        bodyHtml = `<div class="tile-winner">🏆 ${names} — ${game.finalized.winningScore.toLocaleString()}</div>`;
      } else if (game.missing.length === 0 && submittedCount > 0) {
        bodyHtml = '<div class="tile-badge tile-badge--good">Everyone’s in — ready to finalize!</div>';
      } else if (game.missing.length > 0) {
        bodyHtml = `<div class="tile-badge tile-badge--warning">Still needed</div>` +
          `<div class="tile-names">${game.missing.map((m) => escapeHtml(m.displayName)).join(', ')}</div>`;
      } else {
        bodyHtml = '<div class="tile-muted">No scores yet.</div>';
      }

      return `
        <article class="stat-tile">
          <h3>${escapeHtml(label)}</h3>
          <div class="tile-value">${submittedCount}<span class="tile-value-of"> / ${totalCount}</span></div>
          <div class="tile-caption">submitted</div>
          ${bodyHtml}
        </article>`;
    })
    .join('');
}

function renderLeaderboard(standings) {
  const body = document.getElementById('leaderboardBody');
  if (standings.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="muted">No finalized results yet.</td></tr>';
    return;
  }
  body.innerHTML = standings
    .map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(row.displayName)}</td>
        <td class="num">${row.timeguesserWins}</td>
        <td class="num">${row.speedquizWins}</td>
        <td class="num">${row.grandSlams > 0 ? `🎉 ${row.grandSlams}` : '0'}</td>
        <td class="num">${row.totalWins}</td>
      </tr>`)
    .join('');
}

function renderHistory(days) {
  const body = document.getElementById('historyBody');
  if (days.length === 0) {
    body.innerHTML = '<tr><td colspan="3" class="muted">No finalized days yet.</td></tr>';
    return;
  }
  body.innerHTML = days
    .map((day) => {
      const tg = day.timeguesser
        ? `${escapeHtml(day.timeguesser.winners)} — ${day.timeguesser.score.toLocaleString()}`
        : '—';
      const sq = day.speedquiz
        ? `${escapeHtml(day.speedquiz.winners)} — ${day.speedquiz.score.toLocaleString()}`
        : '—';
      const dateLabel = day.isGrandSlam ? `${escapeHtml(day.friendlyDate)} 🎉` : escapeHtml(day.friendlyDate);
      return `<tr><td>${dateLabel}</td><td>${tg}</td><td>${sq}</td></tr>`;
    })
    .join('');
}

async function refresh(conversationId) {
  state.conversationId = conversationId;
  if (!conversationId) return;
  const query = qs({ conversationId });
  const [status, leaderboard, history] = await Promise.all([
    fetchJSON(`/api/status${query}`),
    fetchJSON(`/api/leaderboard${query}`),
    fetchJSON(`/api/history${query}`),
  ]);
  renderStatus(status);
  renderLeaderboard(leaderboard.standings);
  renderHistory(history.days);
  document.getElementById('updatedAt').textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

async function init() {
  try {
    const conversationId = await loadConversations();
    if (!conversationId) {
      document.getElementById('emptyState').hidden = false;
      document.getElementById('mainContent').hidden = true;
      return;
    }
    document.getElementById('mainContent').hidden = false;
    document.getElementById('emptyState').hidden = true;
    await refresh(conversationId);
    setInterval(() => refresh(state.conversationId), 30000);
  } catch (err) {
    console.error(err);
    const emptyState = document.getElementById('emptyState');
    emptyState.hidden = false;
    emptyState.textContent = 'Could not load the leaderboard right now. Try refreshing.';
  }
}

init();

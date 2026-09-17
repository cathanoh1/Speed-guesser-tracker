import Link from 'next/link';
import { config } from '@/config';
import { getDb } from '@/db/client';
import { formatFriendlyDate, todayKeyIn } from '@/domain/dateUtil';
import { buildStandings, computeDailyStatus } from '@/domain/leaderboard';
import { ScoreStore } from '@/domain/store';
import { GAME_LABELS, GAMES, type Game } from '@/domain/types';
import { forceFinalize, joinRoster, leaveRoster } from './actions';

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function HomePage(props: PageProps<'/'>) {
  const searchParams = await props.searchParams;
  const submittedName = firstParam(searchParams.submitted);
  const errorMessage = firstParam(searchParams.error);

  const db = await getDb();
  const store = new ScoreStore(db);

  const playDate = todayKeyIn(config.timezone);
  const friendlyDate = formatFriendlyDate(playDate, config.timezone);

  const [activePlayers, scoresToday, dailyResults, grandSlams] = await Promise.all([
    store.listActivePlayers(),
    store.getScoresForDate(playDate),
    store.listDailyResults(),
    store.listGrandSlams(),
  ]);

  const status = computeDailyStatus(activePlayers, scoresToday, playDate);
  const standings = buildStandings(dailyResults, grandSlams);
  const todaysFinalized: Record<Game, (typeof dailyResults)[number] | undefined> = {
    timeguesser: dailyResults.find((r) => r.playDate === playDate && r.game === 'timeguesser'),
    speedquiz: dailyResults.find((r) => r.playDate === playDate && r.game === 'speedquiz'),
  };

  const grandSlamDates = new Set(grandSlams.map((g) => g.playDate));
  const historyByDate = new Map<string, Partial<Record<Game, { winners: string; score: number }>>>();
  for (const result of dailyResults) {
    const entry = historyByDate.get(result.playDate) ?? {};
    entry[result.game] = {
      winners: result.winners.map((w) => w.displayName).join(' & '),
      score: result.winningScore,
    };
    historyByDate.set(result.playDate, entry);
  }
  const historyDays = [...historyByDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 30)
    .map(([date, games]) => ({
      playDate: date,
      friendlyDate: formatFriendlyDate(date, config.timezone),
      games,
      isGrandSlam: grandSlamDates.has(date),
    }));

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>🏆 Speed Guesser Tracker</h1>
          <p className="subtitle">Daily TimeGuesser &amp; Speed Quiz results</p>
        </div>
        <Link className="nav-link" href="/submit">
          + Submit a score
        </Link>
      </header>

      {submittedName && <p className="banner banner--success">Thanks {submittedName} - your score is recorded!</p>}
      {errorMessage && <p className="banner banner--error">{errorMessage}</p>}

      <section>
        <h2>Today&rsquo;s status &mdash; {friendlyDate}</h2>
        <div className="stat-grid">
          {GAMES.map((game) => {
            const gameStatus = status.games[game];
            const finalized = todaysFinalized[game];
            const submittedCount = gameStatus.submitted.length;
            const totalCount = submittedCount + gameStatus.missing.length;
            return (
              <article className="stat-tile" key={game}>
                <h3>{GAME_LABELS[game]}</h3>
                <div className="tile-value">
                  {submittedCount}
                  <span className="tile-value-of"> / {totalCount}</span>
                </div>
                <div className="tile-caption">submitted</div>
                {finalized ? (
                  <div className="tile-winner">
                    🏆 {finalized.winners.map((w) => w.displayName).join(' & ')} &mdash;{' '}
                    {finalized.winningScore.toLocaleString()}
                  </div>
                ) : gameStatus.missing.length === 0 && submittedCount > 0 ? (
                  <span className="tile-badge tile-badge--good">Everyone&rsquo;s in - ready to finalize!</span>
                ) : gameStatus.missing.length > 0 ? (
                  <>
                    <span className="tile-badge tile-badge--warning">Still needed</span>
                    <div className="tile-names">{gameStatus.missing.map((m) => m.displayName).join(', ')}</div>
                  </>
                ) : (
                  <div className="tile-muted">No scores yet.</div>
                )}
                {!finalized && submittedCount > 0 && (
                  <form action={forceFinalize} style={{ marginTop: 10 }}>
                    <input type="hidden" name="game" value={game} />
                    <button
                      type="submit"
                      className="nav-link nav-link--secondary"
                      style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                    >
                      Finalize now
                    </button>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <h2>Today&rsquo;s submissions</h2>
        {scoresToday.length === 0 ? (
          <p className="muted">No scores submitted yet today.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  <th scope="col">Game</th>
                  <th scope="col" className="num">
                    Score
                  </th>
                  <th scope="col">Proof</th>
                </tr>
              </thead>
              <tbody>
                {[...scoresToday]
                  .sort((a, b) => a.displayName.localeCompare(b.displayName))
                  .map((entry) => (
                    <tr key={`${entry.game}-${entry.userId}`}>
                      <td>{entry.displayName}</td>
                      <td>{GAME_LABELS[entry.game]}</td>
                      <td className="num">{entry.score.toLocaleString()}</td>
                      <td>
                        <a href={entry.screenshotUrl} target="_blank" rel="noreferrer">
                          View screenshot
                        </a>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2>Active roster</h2>
        {activePlayers.length > 0 ? (
          <ul className="roster-list">
            {activePlayers.map((player) => (
              <li key={player.userId} className="roster-chip">
                {player.displayName}
                <form action={leaveRoster}>
                  <input type="hidden" name="userId" value={player.userId} />
                  <button type="submit" title="Leave today's roster">
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nobody&rsquo;s joined yet - submit a score or join below to get started.</p>
        )}
        <form action={joinRoster} style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <input
            type="text"
            name="displayName"
            placeholder="Your name"
            required
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
          />
          <button type="submit" className="nav-link nav-link--secondary">
            Join roster
          </button>
        </form>
      </section>

      <section>
        <h2>All-time leaderboard</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col" className="num">
                  TimeGuesser
                </th>
                <th scope="col" className="num">
                  Speed Quiz
                </th>
                <th scope="col" className="num">
                  Grand Slams
                </th>
                <th scope="col" className="num">
                  Total wins
                </th>
              </tr>
            </thead>
            <tbody>
              {standings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No finalized results yet.
                  </td>
                </tr>
              ) : (
                standings.map((row, index) => (
                  <tr key={row.userId}>
                    <td>{index + 1}</td>
                    <td>{row.displayName}</td>
                    <td className="num">{row.timeguesserWins}</td>
                    <td className="num">{row.speedquizWins}</td>
                    <td className="num">{row.grandSlams > 0 ? `🎉 ${row.grandSlams}` : 0}</td>
                    <td className="num">{row.totalWins}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Recent results</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">TimeGuesser</th>
                <th scope="col">Speed Quiz</th>
              </tr>
            </thead>
            <tbody>
              {historyDays.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted">
                    No finalized days yet.
                  </td>
                </tr>
              ) : (
                historyDays.map((day) => (
                  <tr key={day.playDate}>
                    <td>
                      {day.friendlyDate}
                      {day.isGrandSlam ? ' 🎉' : ''}
                    </td>
                    <td>
                      {day.games.timeguesser
                        ? `${day.games.timeguesser.winners} — ${day.games.timeguesser.score.toLocaleString()}`
                        : '—'}
                    </td>
                    <td>
                      {day.games.speedquiz
                        ? `${day.games.speedquiz.winners} — ${day.games.speedquiz.score.toLocaleString()}`
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="page-footer">Speed Guesser Tracker</footer>
    </div>
  );
}

import Link from 'next/link';
import { getDb } from '@/db/client';
import { ScoreStore } from '@/domain/store';
import { GAME_LABELS, GAMES } from '@/domain/types';
import { submitScore } from '../actions';
import { ScreenshotField } from './ScreenshotField';

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function SubmitPage(props: PageProps<'/submit'>) {
  const searchParams = await props.searchParams;
  const errorMessage = firstParam(searchParams.error);

  const db = await getDb();
  const store = new ScoreStore(db);
  const activePlayers = await store.listActivePlayers();

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Submit a score</h1>
          <p className="subtitle">Attach a screenshot of your result as proof.</p>
        </div>
        <Link className="nav-link nav-link--secondary" href="/">
          ← Back to leaderboard
        </Link>
      </header>

      {errorMessage && <p className="banner banner--error">{errorMessage}</p>}

      <form className="form-card" action={submitScore} encType="multipart/form-data">
        <div className="field">
          <label htmlFor="displayName">Your name</label>
          <input
            type="text"
            id="displayName"
            name="displayName"
            list="known-players"
            required
            autoComplete="off"
            placeholder="e.g. Cathan"
          />
          <datalist id="known-players">
            {activePlayers.map((player) => (
              <option key={player.userId} value={player.displayName} />
            ))}
          </datalist>
          <span className="hint">Pick your name from the list, or type a new one to join.</span>
        </div>

        <div className="field">
          <label htmlFor="game">Game</label>
          <select id="game" name="game" required defaultValue="">
            <option value="" disabled>
              Choose a game
            </option>
            {GAMES.map((game) => (
              <option key={game} value={game}>
                {GAME_LABELS[game]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="score">Score</label>
          <input type="number" id="score" name="score" min={0} step={1} required placeholder="e.g. 42150" />
        </div>

        <ScreenshotField />

        <button type="submit" className="submit-button">
          Submit score
        </button>
      </form>
    </div>
  );
}

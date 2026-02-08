import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Game } from '../stores/gameStore';
import { isROMCached, prefetchROMWithProgress } from '../utils/prefetch';

interface Props {
  game: Game;
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function GameCard({ game }: Props) {
  const navigate = useNavigate();
  const [cacheStatus, setCacheStatus] = useState<'idle' | 'downloading' | 'cached'>('idle');
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    isROMCached(game._id).then((cached) => {
      if (cached) setCacheStatus('cached');
    });
    return () => {
      abortRef.current?.();
    };
  }, [game._id]);

  const handleCacheClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cacheStatus !== 'idle') return;

    setCacheStatus('downloading');
    setProgress(0);

    const { promise, abort } = prefetchROMWithProgress(game._id, game.title, (pct) => {
      setProgress(pct);
    });
    abortRef.current = abort;

    promise.then((success) => {
      setCacheStatus(success ? 'cached' : 'idle');
      abortRef.current = null;
    });
  };

  return (
    <div className="game-card" onClick={() => navigate(`/lobby/${game._id}`)}>
      <div className="game-card-cover">
        {game.coverPath ? (
          <img
            src={`/api/games/covers/${game.coverPath.replace('covers/', '')}`}
            alt={game.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="game-card-placeholder">
            <span>{game.title.charAt(0)}</span>
          </div>
        )}
      </div>
      <div className="game-card-info">
        <h3 className="game-card-title">{game.title}</h3>
        <div className="game-card-meta">
          <span className="badge">{game.region}</span>
          {game.tags?.map((tag) => (
            <span key={tag} className="badge badge-secondary">{tag}</span>
          ))}
          <span className="badge badge-info">
            {game.minPlayers}-{game.maxPlayers} nguoi choi
          </span>
        </div>
        {game.description && (
          <p className="game-card-desc">{game.description}</p>
        )}
        <button
          className={`game-card-cache ${cacheStatus}`}
          onClick={handleCacheClick}
        >
          {cacheStatus === 'idle' && (
            <>Tai game{game.romSizeBytes ? ` (${formatSize(game.romSizeBytes)})` : ''}</>
          )}
          {cacheStatus === 'downloading' && (
            <>
              <span className="game-card-cache-fill" style={{ width: `${progress}%` }} />
              <span className="game-card-cache-text">Dang tai... {progress}%</span>
            </>
          )}
          {cacheStatus === 'cached' && (
            <span className="game-card-cache-text">Da tai</span>
          )}
        </button>
      </div>
    </div>
  );
}

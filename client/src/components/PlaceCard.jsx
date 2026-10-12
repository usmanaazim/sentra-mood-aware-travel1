/** One recommendation: metadata, reasons, score breakdown, directions, feedback. */
import { useState } from 'react';
import {
  Check, ChevronDown, Clock, Globe, Heart, IndianRupee, Info,
  Navigation, Navigation2, ThumbsDown, Trash2
} from 'lucide-react';
import { categoryEmoji, categoryLabel } from '../lib/moods.js';
import { formatCoord, formatDistance } from '../lib/geo.js';

/** OpenStreetMap's own directions interface - SENTRA has no in-app turn-by-turn navigation. */
export function directionsUrl(from, place) {
  const f = `${Number(from.lat).toFixed(6)},${Number(from.lon).toFixed(6)}`;
  const t = `${Number(place.lat).toFixed(6)},${Number(place.lon).toFixed(6)}`;
  return `https://www.openstreetmap.org/directions?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`;
}

export function ScoreBars({ breakdown }) {
  if (!breakdown) return null;
  const parts = [
    { key: 'mood', value: breakdown.mood?.score ?? 0, label: `Mood fit ${Math.round(breakdown.mood?.score ?? 0)}% (weight 50%)` },
    { key: 'distance', value: breakdown.distance?.score ?? 0, label: `Distance fit ${Math.round(breakdown.distance?.score ?? 0)}% (weight 30%)` },
    { key: 'preferences', value: breakdown.preferences?.score ?? 0, label: `Preference fit ${Math.round(breakdown.preferences?.score ?? 0)}% (weight 20%)` }
  ];
  return (
    <div className="score-bars" role="img" aria-label={parts.map((p) => p.label).join('; ')}>
      {parts.map((p) => (
        <span key={p.key} className="score-bar" title={p.label}>
          <i style={{ height: `${Math.max(6, Math.min(100, p.value))}%` }} />
        </span>
      ))}
    </div>
  );
}

function Stars({ value, onChange, disabled }) {
  return (
    <div className="stars" role="group" aria-label="Rating out of 5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n} type="button" className={`star ${value >= n ? 'is-on' : ''}`} disabled={disabled}
          aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={value === n}
          onClick={() => onChange(value === n ? null : n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function PlaceCard({
  place, selected, onSelect, onDirections, review, onSaveReview, onRemoveReview, origin, rank
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    vote: review?.vote ?? null,
    rating: review?.rating ?? null,
    comment: review?.comment ?? ''
  });
  const [saving, setSaving] = useState(false);

  const address = place.address || 'Address not recorded in OpenStreetMap';
  const website = place.website;

  const submit = async (patch = {}) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setSaving(true);
    try { await onSaveReview?.(next); } finally { setSaving(false); }
  };

  return (
    <article className={`card card--interactive ${selected ? 'card--selected' : ''}`} id={`place-${place.osmKey.replace('/', '-')}`}>
      <div className="place-card">
        <div>
          <div className="place-card__top">
            <span className="place-card__emoji" aria-hidden="true">{categoryEmoji(place.category)}</span>
            <div style={{ minWidth: 0 }}>
              <h3 className="place-card__name">
                {rank ? <span className="muted" aria-hidden="true">#{rank} </span> : null}
                {place.name}
              </h3>
              <div className="row" style={{ gap: 8 }}>
                <span className="badge">{categoryLabel(place.category)}</span>
                {place.fictional && <span className="badge badge--demo">Illustrative sample</span>}
              </div>
            </div>
          </div>

          <div className="place-card__meta">
            <span><Navigation size={14} aria-hidden="true" /> {formatDistance(place.distanceM)}</span>
            <span className="mono">{formatCoord(place.lat)}, {formatCoord(place.lon)}</span>
            {place.travelMinutes && <span><Clock size={14} aria-hidden="true" /> ~{place.travelMinutes} min travel (est.)</span>}
            <span><IndianRupee size={14} aria-hidden="true" /> {place.priceText || 'Price not available'}</span>
            {website && (
              <span>
                <Globe size={14} aria-hidden="true" />
                <a href={website} target="_blank" rel="noopener noreferrer nofollow">Website</a>
              </span>
            )}
          </div>

          <div className="place-card__reason">
            <strong>Why this place</strong>
            <ul>
              {(place.reasons || []).map((r) => <li key={r}>{r}</li>)}
            </ul>
            <button type="button" className="btn btn--ghost btn--sm btn--auto" style={{ marginTop: 6 }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              <ChevronDown size={15} aria-hidden="true" /> {open ? 'Hide detail' : 'Show metadata & scoring'}
            </button>
          </div>

          {open && (
            <div className="card card--tight" style={{ background: 'var(--bg-2)', marginBottom: 10 }}>
              <table className="table">
                <tbody>
                  <tr><th scope="row">Address</th><td>{address}</td></tr>
                  <tr>
                    <th scope="row">Opening hours</th>
                    <td>{place.hoursText || (place.openingHours ? `Metadata: ${place.openingHours}` : 'Opening hours not recorded')}</td>
                  </tr>
                  <tr><th scope="row">Visit duration</th><td>{place.durationText || 'Visit duration not available'}</td></tr>
                  <tr><th scope="row">Entrance fee</th><td>{place.fee === 'yes' ? 'A fee is tagged (amount not recorded in OpenStreetMap)' : place.fee === 'no' ? 'Tagged as free (fee=no)' : 'Price not available'}</td></tr>
                  <tr><th scope="row">Wheelchair access</th><td>{place.wheelchair ? `wheelchair=${place.wheelchair}` : 'Not recorded in OpenStreetMap'}</td></tr>
                  {place.cuisine && <tr><th scope="row">Cuisine</th><td>{place.cuisine}</td></tr>}
                  {place.outdoorSeating === 'yes' && <tr><th scope="row">Outdoor seating</th><td>Tagged as available</td></tr>}
                  <tr><th scope="row">Data source</th><td>{place.metadataSource === 'openstreetmap' ? 'OpenStreetMap tags' : 'Illustrative demo record'}</td></tr>
                  {place.breakdown && (
                    <tr>
                      <th scope="row">Score breakdown</th>
                      <td>
                        Mood {Math.round(place.breakdown.mood?.score ?? 0)} ×50% ·
                        Distance {Math.round(place.breakdown.distance?.score ?? 0)} ×30% ·
                        Preferences {Math.round(place.breakdown.preferences?.score ?? 0)} ×20%
                        {place.breakdown.feedbackAdjustment ? ` · feedback ${place.breakdown.feedbackAdjustment > 0 ? '+' : ''}${place.breakdown.feedbackAdjustment}` : ''}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p className="hint" style={{ marginTop: 8 }}>
                <Info size={13} aria-hidden="true" style={{ verticalAlign: -2 }} /> Fields absent from OpenStreetMap are labelled honestly.
                SENTRA never estimates prices, ratings or visit durations it cannot verify.
              </p>
            </div>
          )}

          <div className="place-card__actions">
            <button type="button" className="btn btn--sm btn--auto" onClick={() => onSelect?.(place.osmKey)}>
              {selected ? <><Check size={15} aria-hidden="true" /> Shown on map</> : 'Show on map'}
            </button>
            <a
              className="btn btn--secondary btn--sm btn--auto"
              href={directionsUrl(origin || { lat: place.lat, lon: place.lon }, place)}
              target="_blank" rel="noopener noreferrer"
              title="Opens OpenStreetMap's directions interface in a new tab"
            >
              <Navigation2 size={15} aria-hidden="true" /> Directions (OpenStreetMap)
            </a>
          </div>
        </div>

        <div className="place-card__side">
          {Number.isFinite(place.score) && (
            <span className="score-pill" title="Suitability score - a transparent rule-based total, not an AI confidence value">
              {place.score}<small>/100</small>
            </span>
          )}
          <ScoreBars breakdown={place.breakdown} />
          <div className="row" style={{ gap: 6 }}>
            <button
              type="button" className="btn btn--ghost btn--sm btn--auto" disabled={saving}
              aria-pressed={draft.vote === 'like'} title="Like this recommendation"
              style={draft.vote === 'like' ? { color: 'var(--teal-700)', background: 'var(--teal-100)' } : undefined}
              onClick={() => submit({ vote: draft.vote === 'like' ? null : 'like' })}
            >
              <Heart size={15} aria-hidden="true" /> Like
            </button>
            <button
              type="button" className="btn btn--ghost btn--sm btn--auto" disabled={saving}
              aria-pressed={draft.vote === 'dislike'} title="Dislike this recommendation"
              style={draft.vote === 'dislike' ? { color: 'var(--danger)', background: 'var(--danger-bg)' } : undefined}
              onClick={() => submit({ vote: draft.vote === 'dislike' ? null : 'dislike' })}
            >
              <ThumbsDown size={15} aria-hidden="true" /> Dislike
            </button>
          </div>
        </div>
      </div>

      <div className="divider" />

      <div className="feedback-pop">
        <div className="row row--between">
          <span className="label" style={{ margin: 0 }}>Your feedback</span>
          {review?.id && (
            <button type="button" className="btn btn--ghost btn--sm btn--auto" onClick={() => onRemoveReview?.(review.id)}>
              <Trash2 size={14} aria-hidden="true" /> Remove saved entry
            </button>
          )}
        </div>
        <div className="row" style={{ gap: 12 }}>
          <Stars value={draft.rating ?? 0} disabled={saving} onChange={(r) => submit({ rating: r })} />
          <span className="hint" style={{ margin: 0 }}>{draft.rating ? `You rated this ${draft.rating}/5` : 'Rate 1–5 (optional)'}</span>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <label className="sr-only" htmlFor={`comment-${place.osmKey.replace('/', '-')}`}>Feedback comment</label>
          <input
            id={`comment-${place.osmKey.replace('/', '-')}`}
            className="input" maxLength="500" placeholder="Optional short note (max 500 characters)"
            value={draft.comment}
            onChange={(e) => setDraft((d) => ({ ...d, comment: e.target.value }))}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn btn--sm btn--auto" disabled={saving || draft.comment === (review?.comment ?? '')} onClick={() => submit()}>
            {saving ? <span className="spinner" aria-hidden="true" /> : 'Save'}
          </button>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          Signed-in feedback is stored in SQLite against your account and adjusts your own future rankings.
          Visitors without an account keep reviews on this device only.
        </p>
      </div>
    </article>
  );
}

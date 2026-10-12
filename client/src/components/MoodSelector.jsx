/** Mood picker. Emoji cards, keyboard accessible, never diagnoses emotion. */
import { useId } from 'react';
import { MOODS } from '../lib/moods.js';

export default function MoodSelector({ value, onChange, suggestion, onAcceptSuggestion, compact = false }) {
  const groupId = useId();
  return (
    <div>
      <div className="row row--between" style={{ marginBottom: 10 }}>
        <span className="label" id={groupId}>How are you feeling?</span>
        {value && (
          <button type="button" className="btn btn--ghost btn--sm btn--auto" onClick={() => onChange(null)}>
            Clear
          </button>
        )}
      </div>

      <div className="mood-grid" role="group" aria-labelledby={groupId}>
        {MOODS.map((mood) => (
          <button
            key={mood.id}
            type="button"
            className="mood-card"
            aria-pressed={value === mood.id}
            onClick={() => onChange(value === mood.id ? null : mood.id)}
          >
            <span className="mood-card__emoji" aria-hidden="true">{mood.emoji}</span>
            <span className="mood-card__label">{mood.label}</span>
            {!compact && <span className="mood-card__blurb">{mood.blurb}</span>}
          </button>
        ))}
      </div>

      {suggestion && suggestion.mood !== value && (
        <div className="alert alert--info" style={{ marginTop: 12 }} role="status">
          <div>
            <strong>Keyword suggestion: {MOODS.find((m) => m.id === suggestion.mood)?.label}</strong>
            <p className="small" style={{ margin: '4px 0 0' }}>
              Matched on “{suggestion.matchedKeywords.join('”, “')}” using lightweight keyword matching
              ({suggestion.confidence}) - not a language model. You are always in control.
            </p>
            <button type="button" className="btn btn--sm btn--secondary btn--auto" style={{ marginTop: 8 }} onClick={() => onAcceptSuggestion?.(suggestion.mood)}>
              Use this mood
            </button>
          </div>
        </div>
      )}

      <p className="hint" style={{ marginTop: 10 }}>
        Sentra maps moods to place categories as a recommendation heuristic. It does not diagnose emotions,
        and it makes no mental-health or wellbeing claims.
      </p>
    </div>
  );
}

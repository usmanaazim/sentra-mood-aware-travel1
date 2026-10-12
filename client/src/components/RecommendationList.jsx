/** Ranked results list with loading / empty / error / demo states. */
import { Compass, Info, RefreshCw, ShieldCheck } from 'lucide-react';
import PlaceCard from './PlaceCard.jsx';
import { DemoBanner, EmptyState, ErrorMessage, RecommendationSkeleton } from './States.jsx';

export default function RecommendationList({
  status, results, error, meta, selectedKey, onSelect, onDirections, origin,
  getReview, onSaveReview, onRemoveReview, onRetry, onWiden, onDemo, moodLabel
}) {
  if (status === 'loading') {
    return (
      <div>
        <div className="results-head">
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>
            <span className="spinner spinner--dark" aria-hidden="true" style={{ marginRight: 10, verticalAlign: -2 }} />
            Scoring places for your {moodLabel ? `${moodLabel.toLowerCase()} ` : ''}mood…
          </h2>
        </div>
        <RecommendationSkeleton />
        <p className="hint" style={{ marginTop: 12 }}>
          Live searches query the community-run Overpass API and are cached for 5 minutes per location.
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <ErrorMessage
        title="We could not load nearby places"
        error={error}
        onRetry={onRetry}
        onDemo={onDemo}
      />
    );
  }

  if (status === 'idle') {
    return (
      <EmptyState
        title="Ready when you are"
        message="Pick a mood (and optionally your budget, time and radius), then press Discover places. Sentra will query OpenStreetMap for real places near you and explain why each one fits."
      />
    );
  }

  const places = results || [];

  return (
    <div>
      {meta?.demo && <div style={{ marginBottom: 16 }}><DemoBanner notice={meta.demoNotice} source={meta.demoSource} meta={meta.demoMeta} /></div>}

      <div className="results-head">
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>
          {places.length > 0 ? `${places.length} place${places.length === 1 ? '' : 's'} for your mood` : 'No matching places'}
        </h2>
        {meta?.mood && <span className="badge badge--teal">{meta.mood.emoji} {meta.mood.label}</span>}
        {!meta?.demo && meta?.source === 'overpass' && (
          <span className="badge"><ShieldCheck size={13} aria-hidden="true" /> Live OpenStreetMap data</span>
        )}
        {meta?.cached && <span className="badge">Cached result · {new Date(meta.fetchedAt).toLocaleTimeString()}</span>}
        <span className="spacer" />
        {onRetry && (
          <button type="button" className="btn btn--secondary btn--sm btn--auto" onClick={onRetry}>
            <RefreshCw size={15} aria-hidden="true" /> Refresh
          </button>
        )}
      </div>

      {places.length === 0 ? (
        <EmptyState
          title="Nothing matched this combination"
          message={`No supported categories were found within ${(meta?.radiusM / 1000 || 3).toFixed(1)} km. Try widening the radius, choosing more categories, or switching location.`}
          onWiden={onWiden}
          onDemo={onDemo}
        />
      ) : (
        <>
          <div className="place-list">
            {places.map((place, i) => (
              <PlaceCard
                key={place.osmKey}
                place={place}
                rank={i + 1}
                selected={selectedKey === place.osmKey}
                onSelect={onSelect}
                onDirections={onDirections}
                origin={origin}
                review={getReview?.(place.osmKey)}
                onSaveReview={(entry) => onSaveReview?.(place, entry)}
                onRemoveReview={onRemoveReview}
              />
            ))}
          </div>

          <div className="alert alert--info" style={{ marginTop: 16 }}>
            <Info size={18} aria-hidden="true" />
            <div>
              <strong>How these were ranked</strong>
              <p className="small" style={{ margin: '4px 0 0' }}>{meta?.method}</p>
              {meta?.personalisation && <p className="small" style={{ margin: '4px 0 0' }}>{meta.personalisation}</p>}
              {meta?.excluded && (
                <p className="small" style={{ margin: '4px 0 0' }}>
                  Filtered out: {meta.excluded.outsideRadius || 0} outside your radius,
                  {' '}{meta.excluded.noMatch || 0} that clash with this mood.
                </p>
              )}
              {meta?.moodSuggestion && (
                <p className="small" style={{ margin: '4px 0 0' }}>
                  <Compass size={13} aria-hidden="true" style={{ verticalAlign: -2 }} /> Mood taken from your description via
                  keyword matching on “{meta.moodSuggestion.matchedKeywords.join('”, “')}”.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Shared explainer used by the landing page and the About page. */
import { Brain, Filter, MapPin, Route, SlidersHorizontal, Sparkles } from 'lucide-react';

export const STEPS = [
  {
    icon: MapPin,
    title: 'Share where you are and how you feel',
    body: 'Pick a mood, optionally describe what you are after in a sentence, and share your location - or choose an example location manually.'
  },
  {
    icon: Brain,
    title: 'Sentra scores places near you',
    body: 'Nearby parks, gardens, cafes, museums and viewpoints are retrieved from OpenStreetMap via the public Overpass API and scored in plain JavaScript: 50% mood fit, 30% distance, 20% preference fit.'
  },
  {
    icon: Route,
    title: 'Choose a place and navigate',
    body: 'Compare explained recommendations on the map, then open directions in the OpenStreetMap interface in a new tab.'
  }
];

export const FEATURES = [
  { icon: Brain, title: 'Mood-first matching', body: 'Categories are matched to mood with documented heuristics, never hidden model output.' },
  { icon: SlidersHorizontal, title: 'Budget & time aware', body: 'Available time and budget shape the ranking, but missing OpenStreetMap prices are labelled rather than invented.' },
  { icon: Route, title: 'Straight-line distances', body: 'Distances use the Haversine formula between your point and each place, shown to the nearest 10 m.' },
  { icon: Sparkles, title: 'Explained results', body: 'Every card states why it was recommended and shows the score breakdown.' },
  { icon: Filter, title: 'Feedback that matters', body: 'Likes, dislikes and ratings are stored per account and nudge your own future rankings.' },
  { icon: MapPin, title: 'Open map stack', body: 'Leaflet with OpenStreetMap tiles and Overpass queries - no paid maps, no API keys.' }
];

export default function HowItWorks({ withFeatures = true }) {
  return (
    <>
      <section className="section" id="how-it-works">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">How it works</p>
            <h2>From mood to destination in three steps</h2>
            <p className="lead">
              Sentra is not a navigation app. It answers a different question: given how I feel right now,
              how much time I have and what I can spend, where should I go?
            </p>
          </div>
          <div className="grid grid-3 steps">
            {STEPS.map((s, i) => (
              <article className="step" key={s.title}>
                <span className="step__num" aria-hidden="true">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {withFeatures && (
        <section className="section section--tint" id="features">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">Features</p>
              <h2>Honest recommendations, transparent scoring</h2>
            </div>
            <div className="grid grid-3">
              {FEATURES.map((f) => (
                <article className="card feature" key={f.title}>
                  <span className="feature__icon" aria-hidden="true"><f.icon size={20} /></span>
                  <div>
                    <h3>{f.title}</h3>
                    <p>{f.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

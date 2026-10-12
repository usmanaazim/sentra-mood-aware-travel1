/** Budget, time, radius, category, indoor/outdoor, purpose and accessibility inputs. */
import { Clock, IndianRupee, Ruler, SlidersHorizontal, Sparkles } from 'lucide-react';
import { CATEGORIES } from '../lib/moods.js';

export const BUDGET_PRESETS = [0, 100, 300, 500, 1000];
export const DEFAULT_PREFS = {
  mood: null,
  radiusM: 3000,
  budgetInr: 300,
  timeMinutes: 120,
  categories: [],
  indoorOutdoor: 'any',
  purpose: '',
  accessibility: '',
  freeText: ''
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export default function PreferenceForm({ prefs, onChange, onInterpret, interpreting, disabled = false }) {
  const set = (patch) => onChange({ ...prefs, ...patch });

  return (
    <div>
      <div className="panel__title"><SlidersHorizontal size={16} aria-hidden="true" /> Trip preferences</div>

      <div className="field">
        <label className="label" htmlFor="budget">
          <IndianRupee size={14} aria-hidden="true" style={{ verticalAlign: -2 }} /> Maximum budget (₹)
        </label>
        <input
          id="budget" className="input" type="number" inputMode="numeric" min="0" max="100000" step="50"
          value={prefs.budgetInr ?? ''} disabled={disabled}
          onChange={(e) => set({ budgetInr: e.target.value === '' ? null : clamp(Number(e.target.value), 0, 100000) })}
        />
        <div className="chip-row" style={{ marginTop: 6 }}>
          {BUDGET_PRESETS.map((b) => (
            <button key={b} type="button" className="chip" aria-pressed={prefs.budgetInr === b} disabled={disabled} onClick={() => set({ budgetInr: b })}>
              {b === 0 ? 'Free only' : `₹${b}`}
            </button>
          ))}
        </div>
        <p className="hint">
          OpenStreetMap rarely records prices, so budget is applied only when a fee is explicitly tagged.
          Places without price data are kept and labelled “Price not available”.
        </p>
      </div>

      <div className="field">
        <label className="label" htmlFor="time"><Clock size={14} aria-hidden="true" style={{ verticalAlign: -2 }} /> Time available</label>
        <div className="range-row">
          <input id="time" type="range" min="30" max="480" step="15" value={prefs.timeMinutes ?? 120} disabled={disabled}
            onChange={(e) => set({ timeMinutes: Number(e.target.value) })} />
          <output className="range-value" htmlFor="time">
            {prefs.timeMinutes >= 60 ? `${(prefs.timeMinutes / 60).toFixed(prefs.timeMinutes % 60 ? 1 : 0)} h` : `${prefs.timeMinutes} min`}
          </output>
        </div>
        <p className="hint">Used only when a visit duration can be reasonably estimated. Usually it cannot - OSM does not store it.</p>
      </div>

      <div className="field">
        <label className="label" htmlFor="radius"><Ruler size={14} aria-hidden="true" style={{ verticalAlign: -2 }} /> Search radius</label>
        <div className="range-row">
          <input id="radius" type="range" min="500" max="5000" step="250" value={prefs.radiusM} disabled={disabled}
            onChange={(e) => set({ radiusM: Number(e.target.value) })} />
          <output className="range-value" htmlFor="radius">{(prefs.radiusM / 1000).toFixed(2).replace(/0$/, '')} km</output>
        </div>
        <p className="hint">Limited to 500 m – 5 km to stay within the public Overpass service's fair-use limits.</p>
      </div>

      <div className="field">
        <span className="label">Preferred categories</span>
        <div className="chip-row">
          {CATEGORIES.map((c) => (
            <button
              key={c.id} type="button" className="chip" disabled={disabled}
              aria-pressed={prefs.categories.includes(c.id)}
              onClick={() => set({
                categories: prefs.categories.includes(c.id)
                  ? prefs.categories.filter((x) => x !== c.id)
                  : [...prefs.categories, c.id]
              })}
            >
              <span aria-hidden="true">{c.emoji}</span> {c.label}
            </button>
          ))}
        </div>
        <p className="hint">Leave empty to search every supported category.</p>
      </div>

      <div className="field">
        <span className="label" id="io-label">Indoor or outdoor</span>
        <div className="segmented" role="group" aria-labelledby="io-label">
          {[['any', 'Any'], ['outdoor', 'Outdoor'], ['indoor', 'Indoor']].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={prefs.indoorOutdoor === id} disabled={disabled} onClick={() => set({ indoorOutdoor: id })}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="purpose">Trip purpose <span className="muted small">(optional)</span></label>
        <input id="purpose" className="input" maxLength="200" placeholder="e.g. quiet walk after work"
          value={prefs.purpose} disabled={disabled} onChange={(e) => set({ purpose: e.target.value })} />
      </div>

      <div className="field">
        <label className="label" htmlFor="accessibility">Accessibility needs <span className="muted small">(optional)</span></label>
        <input id="accessibility" className="input" maxLength="200" placeholder="e.g. wheelchair access, step-free entrance"
          value={prefs.accessibility} disabled={disabled} onChange={(e) => set({ accessibility: e.target.value })} />
        <p className="hint">Checked against the OpenStreetMap <span className="mono">wheelchair</span> tag only. When it is missing, the field stays neutral instead of guessing.</p>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label className="label" htmlFor="freeText">
          Describe what you want <span className="muted small">(optional)</span>
        </label>
        <textarea id="freeText" className="textarea" maxLength="300" placeholder="e.g. somewhere quiet with trees where I can sit for an hour"
          value={prefs.freeText} disabled={disabled} onChange={(e) => set({ freeText: e.target.value })} />
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn--secondary btn--sm btn--auto" onClick={onInterpret} disabled={disabled || interpreting || !prefs.freeText.trim()}>
            {interpreting ? <><span className="spinner spinner--dark" aria-hidden="true" /> Reading…</> : <><Sparkles size={15} aria-hidden="true" /> Suggest a mood</>}
          </button>
          <span className="hint" style={{ margin: 0 }}>Lightweight keyword matching - not a language model.</span>
        </div>
      </div>
    </div>
  );
}

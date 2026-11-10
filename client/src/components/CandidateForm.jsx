import { Field, TriState } from './ui.jsx';
import { STATUSES, STATUS_LABELS, ENGLISH_LABELS } from '../api.js';

// Editable candidate fields. `value` is the candidate object, `onChange(field, value)` updates one field.
export default function CandidateForm({ value, onChange, disabled, isAdmin, errors = {}, phoneWarning }) {
  const text = (k, label, props = {}) => (
    <Field label={label} error={errors[k]} className={props.span ? 'span-2' : ''} hint={props.hint}>
      {props.textarea ? (
        <textarea value={value[k] ?? ''} disabled={disabled} onChange={(e) => onChange(k, e.target.value)} rows={props.rows || 3} />
      ) : (
        <input type={props.type || 'text'} value={value[k] ?? ''} disabled={disabled} onChange={(e) => onChange(k, e.target.value)} placeholder={props.placeholder} />
      )}
    </Field>
  );
  const bool = (k, label) => (
    <Field label={label}><TriState value={value[k]} disabled={disabled} onChange={(v) => onChange(k, v)} /></Field>
  );

  return (
    <div>
      <div className="form-section">Persoonlijke gegevens</div>
      <div className="form-grid">
        {text('full_name', 'Volledige naam')}
        <Field label="Telefoonnummer (WhatsApp)" error={errors.phone || phoneWarning} hint="Internationaal, bijv. +31612345678">
          <input type="tel" value={value.phone_input ?? value.phone ?? ''} disabled={disabled} onChange={(e) => onChange('phone', e.target.value)} required />
        </Field>
        {text('email', 'E-mailadres', { type: 'email' })}
        {text('nationality', 'Nationaliteit')}
        {text('current_city', 'Woonplaats')}
        {text('current_country', 'Land')}
        {text('date_of_birth', 'Geboortedatum', { type: 'date' })}
        <Field label="Leeftijd"><input type="number" min="14" max="100" value={value.age ?? ''} disabled={disabled} onChange={(e) => onChange('age', e.target.value === '' ? null : Number(e.target.value))} /></Field>
        <Field label="Heeft een geldig BSN" hint="Alleen ja/nee wordt bewaard. Vraag of bewaar nooit het BSN-nummer zelf.">
          <TriState value={value.has_bsn} disabled={disabled} onChange={(v) => onChange('has_bsn', v)} />
        </Field>
      </div>

      <div className="form-section">Talen &amp; rijbewijs</div>
      <div className="form-grid">
        <Field label="Gesproken talen" hint="Scheid met komma's, bijv. Pools, Engels, Nederlands">
          <input type="text" disabled={disabled} value={value.languages_input ?? (value.languages || []).join(', ')} onChange={(e) => onChange('languages', e.target.value)} />
        </Field>
        <Field label="Niveau Engels">
          <select value={value.english_level ?? ''} disabled={disabled} onChange={(e) => onChange('english_level', e.target.value || null)}>
            <option value="">Onbekend</option>
            {Object.entries(ENGLISH_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        {bool('driving_licence', 'Rijbewijs')}
        {bool('own_car', 'Eigen auto')}
        {bool('forklift', 'Heftruckcertificaat')}
        {bool('ept', 'EPT-certificaat')}
        {bool('reach_truck', 'Reachtruckcertificaat')}
        {bool('has_experience', 'Ervaring magazijn / productie')}
      </div>

      <div className="form-section">Werk</div>
      <div className="form-grid">
        {text('work_experience', 'Werkervaring', { textarea: true, span: true })}
        {text('previous_jobs', 'Vorige banen', { textarea: true, span: true })}
        {text('desired_job', 'Gewenst werk')}
        {text('availability', 'Beschikbaarheid', { placeholder: 'bijv. direct, vanaf 1 december' })}
        {text('available_from', 'Beschikbaar vanaf (datum)', { type: 'date' })}
        <Field label="Status kandidaat">
          <select value={value.status || 'new'} disabled={disabled} onChange={(e) => onChange('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </Field>
        {text('notes', 'Notities', { textarea: true, span: true, rows: 4 })}
        <Field className="span-2">
          <label className="checkbox">
            <input type="checkbox" checked={!!value.consent_given} disabled={disabled} onChange={(e) => onChange('consent_given', e.target.checked)} />
            De kandidaat geeft toestemming om zijn gegevens te bewaren voor werving (privacytoestemming)
          </label>
        </Field>
      </div>
    </div>
  );
}

// Turns form state into an API payload.
export function toPayload(form) {
  const out = {};
  const keys = ['full_name', 'phone', 'email', 'nationality', 'current_country', 'current_city', 'has_bsn', 'date_of_birth', 'age',
    'english_level', 'driving_licence', 'own_car', 'forklift', 'ept', 'reach_truck', 'has_experience', 'work_experience',
    'previous_jobs', 'desired_job', 'availability', 'available_from', 'notes', 'status', 'consent_given'];
  for (const k of keys) if (form[k] !== undefined) out[k] = form[k] === '' ? null : form[k];
  if (form.languages !== undefined) out.languages = Array.isArray(form.languages) ? form.languages : String(form.languages).split(',').map((s) => s.trim()).filter(Boolean);
  return out;
}

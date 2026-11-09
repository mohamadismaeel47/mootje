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
      <div className="form-section">Personal details</div>
      <div className="form-grid">
        {text('full_name', 'Full name')}
        <Field label="Phone number (WhatsApp)" error={errors.phone || phoneWarning} hint="International format, e.g. +31612345678">
          <input type="tel" value={value.phone_input ?? value.phone ?? ''} disabled={disabled} onChange={(e) => onChange('phone', e.target.value)} required />
        </Field>
        {text('email', 'Email address', { type: 'email' })}
        {text('nationality', 'Nationality')}
        {text('current_city', 'Current city')}
        {text('current_country', 'Current country')}
        {text('date_of_birth', 'Date of birth', { type: 'date' })}
        <Field label="Age"><input type="number" min="14" max="100" value={value.age ?? ''} disabled={disabled} onChange={(e) => onChange('age', e.target.value === '' ? null : Number(e.target.value))} /></Field>
        <Field label="Has a valid BSN" hint="Only yes/no is stored. Never ask for or save the BSN number itself.">
          <TriState value={value.has_bsn} disabled={disabled} onChange={(v) => onChange('has_bsn', v)} />
        </Field>
      </div>

      <div className="form-section">Languages &amp; licences</div>
      <div className="form-grid">
        <Field label="Languages spoken" hint="Separate with commas, e.g. Polish, English, Dutch">
          <input type="text" disabled={disabled} value={value.languages_input ?? (value.languages || []).join(', ')} onChange={(e) => onChange('languages', e.target.value)} />
        </Field>
        <Field label="English level">
          <select value={value.english_level ?? ''} disabled={disabled} onChange={(e) => onChange('english_level', e.target.value || null)}>
            <option value="">Unknown</option>
            {Object.entries(ENGLISH_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        {bool('driving_licence', 'Driving licence')}
        {bool('own_car', 'Own car')}
        {bool('forklift', 'Forklift certificate')}
        {bool('ept', 'EPT certificate')}
        {bool('reach_truck', 'Reach truck certificate')}
        {bool('has_experience', 'Warehouse / production experience')}
      </div>

      <div className="form-section">Work</div>
      <div className="form-grid">
        {text('work_experience', 'Work experience', { textarea: true, span: true })}
        {text('previous_jobs', 'Previous jobs', { textarea: true, span: true })}
        {text('desired_job', 'Desired job')}
        {text('availability', 'Availability', { placeholder: 'e.g. immediately, from 1 December' })}
        {text('available_from', 'Available from (date)', { type: 'date' })}
        <Field label="Candidate status">
          <select value={value.status || 'new'} disabled={disabled} onChange={(e) => onChange('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </Field>
        {text('notes', 'Notes', { textarea: true, span: true, rows: 4 })}
        <Field className="span-2">
          <label className="checkbox">
            <input type="checkbox" checked={!!value.consent_given} disabled={disabled} onChange={(e) => onChange('consent_given', e.target.checked)} />
            The candidate agreed that we store their data for recruitment (privacy consent)
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

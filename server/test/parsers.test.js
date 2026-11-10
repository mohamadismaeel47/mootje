import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseYesNo, isHelpRequest, parseAge, parseName, parseLocation, parseEnglish, parseCertificates,
  parseAvailability, parseExperience, detectLanguage, parseLanguageSwitch, splitNumbered,
} from '../src/services/bot/parsers.js';

test('yes/no in several languages', () => {
  for (const y of ['yes', 'Yes!', 'ja', 'JA', 'tak', 'da', 'sí', 'oui', 'yes I do', 'Ja klopt', '👍', 'ok']) assert.equal(parseYesNo(y), true, y);
  for (const n of ['no', 'Nee', 'nie', 'no I don\'t', "I don't have one", 'geen', 'not yet', 'ik heb geen rijbewijs', '❌']) assert.equal(parseYesNo(n), false, n);
  assert.equal(parseYesNo('maybe tomorrow'), null);
});

test('help requests are detected', () => {
  for (const h of ['?', 'what do you mean', 'What is BSN?', "I don't understand", 'wat bedoel je', 'snap het niet', 'explain please']) assert.equal(isHelpRequest(h), true, h);
  for (const a of ['28', 'yes', 'Breda, Netherlands', 'I worked 2 years as order picker in a warehouse in Tilburg for a big company']) assert.equal(isHelpRequest(a), false, a);
});

test('age and date of birth', () => {
  const now = new Date('2026-11-09T12:00:00Z');
  assert.deepEqual(parseAge('28', now).values, { age: 28 });
  assert.deepEqual(parseAge('I am 34 years old', now).values, { age: 34 });
  assert.deepEqual(parseAge('14-03-1996', now).values, { date_of_birth: '1996-03-14', age: 30 });
  assert.equal(parseAge('old enough', now).ok, false);
  assert.equal(parseAge('5', now).ok, false);
});

test('name', () => {
  assert.deepEqual(parseName('my name is anna kowalska').values, { full_name: 'Anna Kowalska' });
  assert.equal(parseName('yes').ok, false);
  assert.equal(parseName('0612345678').ok, false);
});

test('location', () => {
  assert.deepEqual(parseLocation('Breda, Netherlands').values, { current_city: 'Breda', current_country: 'Netherlands' });
  assert.deepEqual(parseLocation('I live in Tilburg').values, { current_city: 'Tilburg' });
  assert.deepEqual(parseLocation('Poland').values, { current_country: 'Poland' });
  assert.deepEqual(parseLocation('ik woon in Breda Nederland').values, { current_city: 'Breda', current_country: 'Netherlands' });
});

test('english level', () => {
  assert.equal(parseEnglish('a little').values.english_level, 'basic');
  assert.equal(parseEnglish('yes').values.english_level, 'good');
  assert.equal(parseEnglish('fluent').values.english_level, 'fluent');
  assert.equal(parseEnglish('no').values.english_level, 'none');
  assert.equal(parseEnglish('een beetje').values.english_level, 'basic');
});

test('certificates', () => {
  assert.deepEqual(parseCertificates('forklift and EPT').values, { forklift: true, ept: true, reach_truck: false });
  assert.deepEqual(parseCertificates('nee').values, { forklift: false, ept: false, reach_truck: false });
  assert.deepEqual(parseCertificates('reachtruck').values, { forklift: false, ept: false, reach_truck: true });
  assert.deepEqual(parseCertificates('all of them').values, { forklift: true, ept: true, reach_truck: true });
  const r = parseCertificates('yes');
  assert.equal(r.ok, false);
  assert.equal(r.clarify, 'which_certificates');
});

test('availability', () => {
  const now = new Date('2026-11-09T12:00:00Z'); // Monday
  assert.equal(parseAvailability('immediately', now).values.available_from, '2026-11-09');
  assert.equal(parseAvailability('next week', now).values.available_from, '2026-11-16');
  assert.equal(parseAvailability('01-12-2026', now).values.available_from, '2026-12-01');
  assert.equal(parseAvailability('after my holiday', now).values.availability, 'after my holiday');
  assert.equal(parseAvailability('yes', now).ok, false);
});

test('experience', () => {
  assert.deepEqual(parseExperience('no').values, { has_experience: false });
  assert.equal(parseExperience('yes, 2 years order picking').values.has_experience, true);
  assert.equal(parseExperience('I worked in a factory').values.work_experience, 'I worked in a factory');
});

test('language detection', () => {
  assert.equal(detectLanguage('Hoi, ik zoek werk'), 'nl');
  assert.equal(detectLanguage('Hi, I am looking for a job'), 'en');
  assert.equal(parseLanguageSwitch('Nederlands graag'), 'nl');
  assert.equal(parseLanguageSwitch('English please'), 'en');
  assert.equal(parseLanguageSwitch('good'), null);
});

test('numbered list answers', () => {
  assert.deepEqual(splitNumbered('1. Anna\n2. 28\n3) Polish', 12), [{ n: 1, answer: 'Anna' }, { n: 2, answer: '28' }, { n: 3, answer: 'Polish' }]);
  assert.deepEqual(splitNumbered('1. Jan 2. 14-03-1996 11. 01.12.2026', 12), [{ n: 1, answer: 'Jan' }, { n: 2, answer: '14-03-1996' }, { n: 11, answer: '01.12.2026' }]);
  assert.deepEqual(splitNumbered('I am 28', 12), []);
  assert.deepEqual(splitNumbered('15. something', 12), []);
});

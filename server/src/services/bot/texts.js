// All texts the WhatsApp assistant sends. Add a new language by copying the `en` block.
// {recruiter} and {name} are replaced automatically.

export const SUPPORTED_LANGUAGES = ['en', 'nl'];

export const TEXTS = {
  en: {
    intro: 'Hi! My name is {recruiter}. Is it correct that you are looking for a job?',
    intro_explain: 'I am a recruiter and I help people find work in the Netherlands. Please answer YES if you are looking for a job, or NO if you are not.',
    great: 'Great! To help you find a suitable job as quickly as possible, I need some information from you.\n\nPlease answer the following questions.',
    consent: 'First a short question about your privacy: we save your answers safely and only use them to find a job for you. We only share your details with recruitment agencies for jobs that suit you. You can ask us to delete your data at any time by sending DELETE.\n\nDo you agree? (YES / NO)',
    consent_explain: 'We need your permission to save your answers (name, age, experience, etc.). Without permission we cannot help you find a job. Please answer YES or NO.',
    consent_declined: 'Okay, we will not save your information. If you change your mind, just send us a message.',
    not_interested: 'No problem! If you are looking for a job later, just send us a message. Have a nice day!',
    not_understood: 'Sorry, I did not understand your answer.',
    question_prefix: 'Question {n} of {total}:',
    cv_offer: 'Thank you! Do you have a CV? You can send it here as a PDF, Word file or photo. If you do not have one, just answer NO.',
    cv_waiting: 'Please send your CV as a file or photo in this chat. If you do not have one, answer NO.',
    cv_received: 'Thank you, we received your file!',
    completed: 'Thank you{name}! Your registration is complete. We will contact you as soon as we have a suitable job for you.',
    after_complete: 'Thank you for your message. A recruiter will reply to you as soon as possible.',
    text_only: 'Sorry, I can only read text messages and files. Please type your answer.',
    deletion_ack: 'We received your request to delete your data. A recruiter will process it and confirm to you.',
    stop_ack: 'Okay, you will not receive automatic messages anymore. Send START if you want to continue.',
    start_ack: 'Welcome back! Let us continue.',
    language_set: 'Okay, we will continue in English.',
    followup: 'Hi{name}, just checking in. Could you please answer the last question?',
  },
  nl: {
    intro: 'Hoi! Mijn naam is {recruiter}. Klopt het dat je op zoek bent naar werk?',
    intro_explain: 'Ik ben recruiter en ik help mensen aan werk in Nederland. Antwoord JA als je werk zoekt, of NEE als je geen werk zoekt.',
    great: 'Top! Om je zo snel mogelijk aan passend werk te helpen, heb ik wat informatie van je nodig.\n\nBeantwoord de volgende vragen.',
    consent: 'Eerst een korte vraag over je privacy: we bewaren je antwoorden veilig en gebruiken ze alleen om werk voor je te vinden. We delen je gegevens alleen met uitzendbureaus voor banen die bij je passen. Je kunt altijd vragen om je gegevens te verwijderen door VERWIJDER te sturen.\n\nGa je akkoord? (JA / NEE)',
    consent_explain: 'We hebben je toestemming nodig om je antwoorden (naam, leeftijd, ervaring, enz.) op te slaan. Zonder toestemming kunnen we je niet helpen. Antwoord JA of NEE.',
    consent_declined: 'Oké, we slaan je gegevens niet op. Als je van gedachten verandert, stuur ons dan gewoon een bericht.',
    not_interested: 'Geen probleem! Als je later werk zoekt, stuur ons dan gewoon een bericht. Fijne dag!',
    not_understood: 'Sorry, ik begreep je antwoord niet.',
    question_prefix: 'Vraag {n} van {total}:',
    cv_offer: 'Bedankt! Heb je een cv? Je kunt het hier sturen als pdf, Word-bestand of foto. Heb je geen cv, antwoord dan NEE.',
    cv_waiting: 'Stuur je cv als bestand of foto in deze chat. Heb je er geen, antwoord dan NEE.',
    cv_received: 'Bedankt, we hebben je bestand ontvangen!',
    completed: 'Bedankt{name}! Je inschrijving is compleet. We nemen contact met je op zodra we passend werk voor je hebben.',
    after_complete: 'Bedankt voor je bericht. Een recruiter reageert zo snel mogelijk.',
    text_only: 'Sorry, ik kan alleen tekstberichten en bestanden lezen. Typ je antwoord alsjeblieft.',
    deletion_ack: 'We hebben je verzoek om je gegevens te verwijderen ontvangen. Een recruiter handelt dit af en laat het je weten.',
    stop_ack: 'Oké, je krijgt geen automatische berichten meer. Stuur START als je verder wilt.',
    start_ack: 'Welkom terug! We gaan verder.',
    language_set: 'Oké, we gaan verder in het Nederlands.',
    followup: 'Hoi{name}, ik wilde even checken. Wil je de laatste vraag nog beantwoorden?',
  },
};

// The registration questions, in order. `field` decides whether a question was already answered.
export const QUESTIONS = [
  {
    key: 'full_name',
    en: { q: 'What is your full name?', explain: 'Please write your first name and last name, for example: Anna Kowalska.' },
    nl: { q: 'Wat is je volledige naam?', explain: 'Schrijf je voornaam en achternaam, bijvoorbeeld: Anna de Vries.' },
  },
  {
    key: 'age',
    en: { q: 'How old are you?', explain: 'Please write your age as a number, for example: 28. You can also send your date of birth, for example: 14-03-1996.' },
    nl: { q: 'Hoe oud ben je?', explain: 'Schrijf je leeftijd als getal, bijvoorbeeld: 28. Je mag ook je geboortedatum sturen, bijvoorbeeld: 14-03-1996.' },
  },
  {
    key: 'nationality',
    en: { q: 'What is your nationality?', explain: 'Which country is your passport from? For example: Polish, Romanian, Dutch, Syrian.' },
    nl: { q: 'Wat is je nationaliteit?', explain: 'Uit welk land komt je paspoort? Bijvoorbeeld: Pools, Roemeens, Nederlands, Syrisch.' },
  },
  {
    key: 'location',
    en: { q: 'Where are you currently living? (city and country)', explain: 'In which city and country do you live now? For example: Breda, Netherlands.' },
    nl: { q: 'Waar woon je op dit moment? (stad en land)', explain: 'In welke stad en welk land woon je nu? Bijvoorbeeld: Breda, Nederland.' },
  },
  {
    key: 'has_bsn',
    en: { q: 'Do you have a valid BSN? (YES / NO)', explain: 'A BSN (Burgerservicenummer) is your Dutch citizen service number. You get it when you register at a Dutch municipality. You need it to work in the Netherlands. Please answer YES or NO. Do not send the number itself.' },
    nl: { q: 'Heb je een geldig BSN? (JA / NEE)', explain: 'Een BSN (burgerservicenummer) is je persoonlijke nummer van de Nederlandse overheid. Je krijgt het als je je inschrijft bij een gemeente. Je hebt het nodig om in Nederland te werken. Antwoord JA of NEE. Stuur het nummer zelf niet.' },
  },
  {
    key: 'english_level',
    en: { q: 'Do you speak English? (NO / A LITTLE / GOOD / FLUENT)', explain: 'How well do you speak English? Answer: NO, A LITTLE, GOOD or FLUENT.' },
    nl: { q: 'Spreek je Engels? (NEE / EEN BEETJE / GOED / VLOEIEND)', explain: 'Hoe goed spreek je Engels? Antwoord: NEE, EEN BEETJE, GOED of VLOEIEND.' },
  },
  {
    key: 'driving_licence',
    en: { q: 'Do you have a driving licence? (YES / NO)', explain: 'Do you have a car driving licence (category B) that is valid in Europe? Please answer YES or NO.' },
    nl: { q: 'Heb je een rijbewijs? (JA / NEE)', explain: 'Heb je een autorijbewijs (rijbewijs B) dat geldig is in Europa? Antwoord JA of NEE.' },
  },
  {
    key: 'own_car',
    en: { q: 'Do you have your own car? (YES / NO)', explain: 'Do you have a car that you can use to drive to work? Please answer YES or NO.' },
    nl: { q: 'Heb je een eigen auto? (JA / NEE)', explain: 'Heb je een auto die je kunt gebruiken om naar je werk te rijden? Antwoord JA of NEE.' },
  },
  {
    key: 'has_experience',
    en: { q: 'Do you have experience working in a warehouse or production? If yes, please tell me shortly what you did.', explain: 'Have you worked before in a warehouse (for example order picking, packing, loading) or in a factory/production? Answer YES or NO, and if YES, tell me what you did.' },
    nl: { q: 'Heb je ervaring met werken in een magazijn of productie? Zo ja, vertel kort wat je deed.', explain: 'Heb je eerder gewerkt in een magazijn (bijvoorbeeld orderpicken, inpakken, laden) of in een fabriek/productie? Antwoord JA of NEE, en bij JA wat je deed.' },
  },
  {
    key: 'certificates',
    en: { q: 'Do you have a forklift, EPT or reach truck certificate? Please write which ones, or NO.', explain: 'A forklift (heftruck), EPT (electric pallet truck) and reach truck are machines used in warehouses. You need a certificate to drive them. Write which certificates you have, for example: "forklift and EPT", or answer NO.' },
    nl: { q: 'Heb je een certificaat voor heftruck, EPT of reachtruck? Schrijf welke, of NEE.', explain: 'Een heftruck, EPT (elektrische pallettruck) en reachtruck zijn machines in een magazijn. Je hebt een certificaat nodig om erop te rijden. Schrijf welke certificaten je hebt, bijvoorbeeld: "heftruck en EPT", of antwoord NEE.' },
  },
  {
    key: 'availability',
    en: { q: 'When can you start working?', explain: 'From which day can you start a new job? For example: "now", "next week" or a date like 01-12-2026.' },
    nl: { q: 'Wanneer kun je beginnen met werken?', explain: 'Vanaf welke dag kun je beginnen? Bijvoorbeeld: "direct", "volgende week" of een datum zoals 01-12-2026.' },
  },
  {
    key: 'desired_job',
    en: { q: 'What kind of job are you looking for?', explain: 'Which type of work would you like to do? For example: order picker, production worker, forklift driver, cleaner.' },
    nl: { q: 'Wat voor werk zoek je?', explain: 'Welk soort werk wil je graag doen? Bijvoorbeeld: orderpicker, productiemedewerker, heftruckchauffeur, schoonmaker.' },
  },
];

export function t(lang, key, vars = {}) {
  const pack = TEXTS[lang] || TEXTS.en;
  let s = pack[key] ?? TEXTS.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v ?? '');
  return s;
}

export function questionText(lang, question) {
  return (question[lang] || question.en).q;
}

export function questionExplain(lang, question) {
  return (question[lang] || question.en).explain;
}

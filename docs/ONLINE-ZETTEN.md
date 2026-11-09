# De CRM online zetten (met Render)

Na deze stappen open je de CRM in je browser (Chrome, Safari, op laptop of telefoon) via een adres zoals
`https://recruitment-crm.onrender.com`. Alleen jij kunt inloggen.

## Wat heb je nodig?

- Je GitHub-account (de code staat in `mohamadismaeel47/mootje`).
- Een account op **render.com** (inloggen met GitHub kan).
- Een betaalmethode: de app, de database en de opslag voor cv's zijn betaalde onderdelen. Kijk op render.com/pricing
  voor de actuele prijzen.

## Stap 1 – Code op de hoofdbranch zetten

Render werkt met één branch. Maak op GitHub een pull request van `claude/recruitment-crm-whatsapp-4nd4cl` naar `main`
en voeg hem samen (of kies in Render deze branch).

## Stap 2 – Blueprint starten

1. Ga in Render naar **New + → Blueprint**.
2. Kies je repository `mootje`. Render leest het bestand `render.yaml` en maakt automatisch:
   - de webapp (regio Frankfurt, in de EU),
   - een PostgreSQL-database,
   - een privé-schijf voor cv-bestanden,
   - willekeurige geheimen (`JWT_SECRET`, `ENCRYPTION_KEY`, `WHATSAPP_VERIFY_TOKEN`).
3. Render vraagt om **SETUP_TOKEN**. Verzin een lang geheim wachtwoord (minstens 20 tekens) en bewaar het goed.
4. Klik op **Apply**. Het bouwen duurt een paar minuten.

## Stap 3 – Jouw account maken (alleen jij)

1. Open het adres van je app (zie bovenaan in Render, eindigt op `.onrender.com`).
2. Je ziet **Create admin account**. Vul je naam, e-mail, een sterk wachtwoord en de **SETUP_TOKEN** in.
3. Klaar. Daarna kan niemand meer een account aanmaken: de CRM laat dit maar één keer toe.

Zo blijft de app alleen van jou:

- Maak geen extra gebruikers aan (*Settings → Users*), tenzij je dat zelf wilt.
- Gebruik een sterk, uniek wachtwoord. Na 10 foute pogingen wordt inloggen 15 minuten geblokkeerd.
- Iedereen kan het adres zien, maar zonder jouw wachtwoord zien ze niets van je kandidaten.

## Stap 4 – Back-up van de sleutel

Ga in Render naar je webapp → **Environment** en kopieer de waarde van **ENCRYPTION_KEY** naar een veilige plek
(bijvoorbeeld een wachtwoordmanager). Zonder deze sleutel kun je opgeslagen WhatsApp-tokens niet meer lezen.

## Stap 5 – WhatsApp koppelen

Volg nu [`WHATSAPP-KOPPELEN.md`](WHATSAPP-KOPPELEN.md), vanaf stap 3. De webhook-URL en de Verify Token zie je in
de CRM bij *Settings → WhatsApp API*.

## Eigen domeinnaam (optioneel)

Wil je liever `crm.jouwbedrijf.nl`? In Render: webapp → **Settings → Custom Domains**. Volg de stappen daar en pas
daarna de webhook-URL in Meta aan.

# De CRM online zetten met Railway + eigen adres

Na deze stappen open je de CRM in Google Chrome via je eigen adres, bijvoorbeeld `https://crm.jouwbedrijf.nl`.
Alleen jij kunt inloggen.

Het bestand `railway.json` in de code vertelt Railway hoe de app gebouwd en gestart wordt. Dat hoef je niet zelf in te stellen.

---

## Stap 1 – Project maken

1. Ga naar **railway.com** → **New Project** → **Deploy from GitHub repo** → kies **mootje**.
2. Klik op de nieuwe dienst (service) → **Settings** → **Source** → zet **Branch** op
   `claude/recruitment-crm-whatsapp-4nd4cl` (of op `main` als die bestaat).

## Stap 2 – Database toevoegen

1. In je project: **+ Create** (of **New**) → **Database** → **PostgreSQL**.
2. Railway maakt een dienst met de naam **Postgres**.

## Stap 3 – Opslag voor cv's (volume)

Zonder volume zijn geüploade cv's weg na elke nieuwe versie.

1. Klik met rechts op je app-dienst (of gebruik **+ Create → Volume**) → **Attach volume**.
2. **Mount path:** `/data`

## Stap 4 – Variabelen invullen

Klik op je app-dienst → **Variables** → **New Variable**. Voeg deze toe:

| Naam | Waarde |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (precies zo typen; Railway vult het zelf in) |
| `UPLOAD_DIR` | `/data/uploads` |
| `JWT_SECRET` | een lange willekeurige tekst (minstens 40 tekens) |
| `ENCRYPTION_KEY` | een andere lange willekeurige tekst (minstens 40 tekens) – **bewaar een kopie!** |
| `SETUP_TOKEN` | een geheim wachtwoord dat jij kiest (minstens 20 tekens) – nodig voor je eerste account |
| `WHATSAPP_VERIFY_TOKEN` | een willekeurige tekst – heb je later nodig bij Meta |

Tip: maak de willekeurige teksten met een wachtwoordgenerator (bijvoorbeeld in je wachtwoordmanager).
Gebruik voor elke variabele een **andere** tekst.

Klik op **Deploy** (of wacht: Railway bouwt automatisch opnieuw). Bij **Deployments** zie je de voortgang.
Groen = gelukt.

## Stap 5 – Tijdelijk Railway-adres testen

1. App-dienst → **Settings** → **Networking** → **Generate Domain**.
2. Open dat adres (eindigt op `.up.railway.app`) in Chrome.
3. Je ziet **Create admin account**. Vul je naam, e-mail, een sterk wachtwoord en je **SETUP_TOKEN** in.

Werkt het? Ga dan door met je eigen adres.

## Stap 6 – Eigen adres (domeinnaam)

### a. Domeinnaam kopen

Koop een domeinnaam bij een registrar, bijvoorbeeld TransIP, Versio, Hostnet of Cloudflare.
Heb je al een domein (bijvoorbeeld voor je bedrijf)? Dan kun je een subdomein gebruiken, zoals `crm.jouwbedrijf.nl`.

### b. Koppelen in Railway

1. App-dienst → **Settings** → **Networking** → **Custom Domain** → typ bijvoorbeeld `crm.jouwbedrijf.nl`.
2. Railway laat een **DNS-record** zien (meestal een **CNAME**, soms ook een **TXT**-record om te controleren).

### c. DNS-record toevoegen bij je registrar

1. Log in bij je registrar → **DNS-instellingen** van je domein.
2. Voeg het record precies zo toe als Railway laat zien (type, naam en waarde).
3. Wacht een paar minuten tot soms een paar uur. Railway zet daarna automatisch een **https**-certificaat aan.

### d. PUBLIC_URL instellen

Voeg in Railway bij **Variables** toe: `PUBLIC_URL` = `https://crm.jouwbedrijf.nl` (jouw adres).
Dan toont de CRM de juiste webhook-URL voor Meta.

## Stap 7 – Back-ups

- Bewaar **ENCRYPTION_KEY** op een veilige plek. Zonder deze sleutel kun je opgeslagen WhatsApp-tokens niet meer lezen.
- Kijk in de Postgres-dienst bij **Backups** of automatische back-ups aan staan.

## Stap 8 – WhatsApp koppelen

Volg [`WHATSAPP-KOPPELEN.md`](WHATSAPP-KOPPELEN.md) vanaf stap 3. Gebruik als webhook-URL:
`https://crm.jouwbedrijf.nl/api/webhooks/whatsapp` (jouw adres) en als Verify Token je `WHATSAPP_VERIFY_TOKEN`.

## Problemen?

| Probleem | Oplossing |
|---|---|
| Deploy faalt met "SETUP_TOKEN is required" | Voeg de variabele `SETUP_TOKEN` toe |
| Deploy faalt met "Missing required environment variable" | Controleer de variabelen uit stap 4 |
| "Invalid setup token" bij account maken | Typ exact dezelfde SETUP_TOKEN als in Railway |
| Cv's weg na update | Volume met mount path `/data` en `UPLOAD_DIR=/data/uploads` |
| Eigen adres werkt niet | DNS-record nog niet actief; controleer type/naam/waarde en wacht even |

Stuur bij een fout een screenshot van **Deployments → View logs**.

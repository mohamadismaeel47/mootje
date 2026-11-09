# WhatsApp koppelen – stap voor stap

Deze handleiding legt uit hoe je de CRM koppelt aan de officiële **WhatsApp Business Cloud API** van Meta.
Lees eerst het stuk over **Coexistence**, want dat bepaalt of je je huidige nummer in de WhatsApp Business-app kunt houden.

---

## 1. Belangrijk: je huidige nummer en Coexistence

**Coexistence** betekent: hetzelfde telefoonnummer werkt tegelijk in de **WhatsApp Business-app op je telefoon** én
via de **Cloud API** (dus in deze CRM). Berichten die je in de app typt, komen ook in de CRM (via de webhook
`smb_message_echoes`). De CRM zet zo'n gesprek dan automatisch op **handmatig**, zodat de assistent je niet stoort.

### Wat ik wél en níet heb gecontroleerd

- Ik heb **geen toegang tot jouw Meta-account**. Ik kan dus niet zien of jouw account en nummer Coexistence ondersteunen.
  Dat moet je zelf controleren (zie hieronder).
- Ik heb **niets** aan je nummer veranderd. De CRM verandert ook nooit zelf iets aan je nummer.
- De officiële Meta-documentatie kon ik vanuit deze omgeving niet openen. De informatie hieronder komt uit
  documentatie van WhatsApp-partners. **Controleer de actuele voorwaarden altijd bij Meta.**

### Voorwaarden die partners noemen (controleer bij Meta)

- Je gebruikt de **WhatsApp Business-app** (niet de gewone WhatsApp), versie **2.24.17 of hoger**.
- Het nummer is al een tijd actief in de Business-app (één bron noemt minimaal 7 dagen).
- Het land van je nummer moet ondersteund worden. Bronnen spreken elkaar tegen: oudere bronnen noemen
  beperkingen, een recente bron (2026) zegt dat het nu wereldwijd werkt, ook in de EU. **Controleer dit voor +31.**
- Coexistence gaat via **Embedded Signup** van een **Tech Provider** of **Solution Partner**. Het is dus níet hetzelfde
  als in het Meta-dashboard op “Telefoonnummer toevoegen” klikken.
- Beperkingen die genoemd worden: geen spraakoproepen via de API op dat nummer, groepschats synchroniseren niet,
  en berichten via de API kosten geld volgens de Cloud API-prijzen (berichten vanuit de app blijven gratis).

### ⚠️ Waarschuwing

Als je in het Meta-dashboard (*WhatsApp → API Setup → Add phone number*) je **huidige** nummer toevoegt en registreert
**zonder** Coexistence-onboarding, dan wordt het nummer **verhuisd** naar de Cloud API. Je kunt het dan **niet meer
gebruiken in de WhatsApp Business-app**. Doe dit dus niet met je huidige nummer, tenzij je dat echt wilt.

### Hoe controleer je het?

1. Open de WhatsApp Business-app → Instellingen → Help → App-info: kijk welke versie je hebt.
2. Kijk in de Meta-documentatie bij *“Onboarding WhatsApp Business app users (Coexistence)”* welke landen en
   voorwaarden nu gelden.
3. Kies een route uit stap 2 hieronder.

## 2. Je keuzes

| Optie | Voordeel | Nadeel |
|---|---|---|
| **A. Coexistence via een partner** (een BSP / Solution Partner die Coexistence aanbiedt) | Je houdt je nummer in de app op je telefoon | Je hebt een partneraccount nodig; soms extra kosten; de partner moet de credentials aan jou geven (access token, Phone Number ID, WABA ID) |
| **B. Coexistence met je eigen Meta-app** | Geen partner nodig | Je eigen app moet Tech Provider worden en Embedded Signup instellen – dit is meer technisch werk en Meta-verificatie |
| **C. Een nieuw, apart nummer voor de CRM** (aanbevolen als A/B niet lukt) | Simpel en veilig; je huidige app blijft precies zoals hij is | Kandidaten krijgen een ander nummer |
| **D. Je huidige nummer volledig verhuizen** | Alles in de CRM | Je kunt het nummer **niet meer** in de app gebruiken |

**Mijn advies:** start met **optie C** (een nieuw nummer, bijvoorbeeld een extra prepaid-simkaart of een vast nummer
dat sms/spraak kan ontvangen). Dan kun je alles meteen testen zonder risico. Wil je later toch je huidige nummer
gebruiken, kies dan optie A.

Zeg het mij voordat je optie D kiest.

## 3. Meta instellen (voor optie B, C en D)

1. Ga naar **developers.facebook.com** → *My Apps* → *Create app* → type **Business**.
2. Voeg het product **WhatsApp** toe. Meta maakt een test-WABA en een testnummer.
3. **Business-verificatie**: in *Business Settings → Security Center*. Nodig om meer dan testberichten te sturen.
4. **Nummer toevoegen** (alleen een nieuw nummer, zie de waarschuwing!): *WhatsApp → API Setup → Add phone number*.
   Vul de weergavenaam in, ontvang de code per sms of telefoon. Daarna moet het nummer **geregistreerd** worden
   (Meta doet dit meestal in de wizard; anders `POST /{phone-number-id}/register` met een 6-cijferige pincode).
5. **Permanente token** (geen 24-uurs testtoken!):
   - *Business Settings → Users → System users → Add* (rol Admin).
   - *Assign assets*: kies je app (Full control) en je WhatsApp-account (Full control).
   - *Generate new token* → kies je app → vink **whatsapp_business_messaging** en **whatsapp_business_management** aan → token verloopt: **Never**.
6. **App Secret**: in je app *App settings → Basic → App secret → Show*.
7. **Phone Number ID** en **WhatsApp Business Account ID**: *WhatsApp → API Setup*.

## 4. In de CRM

1. Zorg dat de CRM online staat op een **https**-adres en dat `PUBLIC_URL` in `.env` klopt.
2. *Settings → WhatsApp API*: vul de 5 waarden in en klik **Save**. Kies zelf een **Verify Token** (bijvoorbeeld een
   lange willekeurige tekst). Tokens worden versleuteld opgeslagen en nooit naar de browser gestuurd.
3. Kopieer de **Callback URL** uit de CRM.
4. In Meta: *WhatsApp → Configuration → Webhook → Edit* → plak de Callback URL en dezelfde Verify Token →
   **Verify and save**. Bij *Webhook fields* → **messages** → *Subscribe*. (Bij Coexistence ook **smb_message_echoes**.)
5. Terug in de CRM: klik **Test connection**. Je ziet per stap ✓ of ✗, met de foutmelding van Meta.
   Staat “App subscribed” op ✗? Klik **Subscribe app**.
6. Stuur vanaf je eigen telefoon een WhatsApp naar het zakelijke nummer. In *Webhook activity* zie je het bericht
   binnenkomen, en in de inbox antwoordt de assistent.

## 5. Templates maken

Om zélf een gesprek te starten, of te antwoorden na 24 uur, wil WhatsApp een **goedgekeurde template**.

1. *WhatsApp Manager → Message templates → Create template*.
2. Voorbeeld eerste bericht, naam `job_intro`, taal English:
   > Hi! My name is Mohamad. Is it correct that you are looking for a job?
3. Voorbeeld follow-up, naam `job_followup`, met variabele:
   > Hi {{1}}, we are still looking for a job for you. Could you answer our last question?
4. Na goedkeuring: vul de namen in bij *Settings → Assistant*.

## 6. Problemen oplossen

| Probleem | Oplossing |
|---|---|
| Webhook-verificatie mislukt | Verify Token in Meta en CRM moet precies gelijk zijn; URL moet https zijn en publiek bereikbaar; kijk in *Webhook activity* |
| Berichten komen niet binnen | *Test connection* → “App subscribed” moet ✓ zijn; in Meta moet het veld **messages** aangevinkt zijn; App Secret moet kloppen (anders “Invalid signature” in de log) |
| Fout 190 (token) | Token verlopen of fout. Maak een permanente System User-token |
| Fout 131030 | In testmodus kun je alleen sturen naar nummers die je in Meta als ontvanger hebt toegevoegd |
| Fout 131047 | 24 uur voorbij: gebruik een template |
| Fout 133010 | Nummer is niet geregistreerd voor de Cloud API |

Zonder geldige gegevens doet de CRM **niet** alsof het werkt: je ziet altijd de echte foutmelding. Wil je de assistent
testen zonder Meta, gebruik dan **Test chat** in de inbox.

# SabiTori by SMS and USSD: for phones with no internet

Status: **design and prototype** (`packages/gateway`). Not deployed. No number or short code exists yet.

## Why

SabiTori today needs an Android phone. Most people it is for do not use the internet on their phone, and many
have only a basic phone. They can all send an SMS and dial a USSD code: that works on every handset, on 2G, with no
data plan and no app.

| | | Source |
| --- | --- | --- |
| Cameroon, people offline | 17.1 million people (58 % of the population) did not use the internet in January 2025; 12.4 million did (41.9 %) | [DataReportal, Digital 2025: Cameroon](https://datareportal.com/reports/digital-2025-cameroon) |
| Cameroon, phones | 25.5 million cellular connections at the start of 2025, more than the number of internet users twice over | same, from GSMA Intelligence |
| Sub-Saharan Africa | Only about a quarter of people use mobile internet; most of the rest already live under a mobile broadband signal (the "usage gap") | [GSMA, The State of Mobile Internet Connectivity 2025](https://www.gsma.com/somic/wp-content/uploads/2025/09/The-State-of-Mobile-Internet-Connectivity-2025-Trends-in-Mobile-Internet-Connectivity.pdf); [GSMA, Mobile Economy Sub-Saharan Africa 2024](https://www.gsma.com/solutions-and-impact/connectivity-for-good/mobile-economy/wp-content/uploads/2024/11/GSMA_ME_SSA_2024_Web.pdf) |
| Africa | Almost 1 billion people do not use mobile internet | [GSMA, Mobile Economy Africa 2025](https://www.gsma.com/solutions-and-impact/connectivity-for-good/mobile-economy/africa/) |
| Cost of a smartphone | An entry-level internet-enabled handset costs about 87 % of a month's income for the poorest 20 % in Sub-Saharan Africa | [GSMA, State of Mobile Internet Connectivity 2025: affordability](https://www.gsma.com/somic/wp-content/uploads/2025/11/The-State-of-Mobile-Internet-Connectivity-2025-Affordability-of-Internet-Enabled-Handsets-and-Data.pdf) |
| World | About 3.4 billion people do not use mobile internet | [GSMA press release, 2025](https://gsma.com/newsroom/press-release/gsma-calls-for-renewed-focus-on-closing-the-usage-gap-as-more-than-3-billion-people-remain-offline-despite-available-mobile-internet-services/) |
| When the internet is cut | Cameroon's North-West and South-West regions lost the internet for 94 days in 2017 (SMS kept working); Access Now estimated the cost at about USD 4.5 million | [Access Now](https://www.accessnow.org/victory-cameroon-94-days-internet-back/); [Al Jazeera](https://www.aljazeera.com/amp/news/2018/1/26/cameroon-internet-shutdowns-cost-anglophones-millions) |

Scams reach exactly these people, by SMS and by phone call:

| | | Source |
| --- | --- | --- |
| Africa | Reported cybercrime losses rose from about USD 192 million to USD 484 million, and identified victims from 35,000 to 87,000; online scams were the most common cybercrime in 2025, using mobile money and social media; 72 % of surveyed countries reported scam centres | [INTERPOL, African Cyberthreat Assessment 2026](https://www.interpol.int/News-and-Events/News/2026/INTERPOL-report-finds-AI-linked-to-more-than-half-of-cybercrime-in-Africa) |
| Africa, trend | Cyber-related crime reached about 30 % of reported crime in Western and Eastern Africa | [INTERPOL, 2025 assessment](https://www.interpol.int/News-and-Events/News/2025/New-INTERPOL-report-warns-of-sharp-rise-in-African-cybercrime) |
| Cameroon | The national ICT agency (ANTIC) put losses to cyber scams at about FCFA 7 billion since 2010 (2023 statement) | [Pan African Visions](https://panafricanvisions.com/2023/08/cybercrimes-cameroon-lost-fcfa7billion-to-scamming-in-13-years) |

Reported figures undercount: most victims of a FCFA 5,000 mobile money scam never report it. Figures from different
reports use different methods and years; quote each with its source.

## What a person does

1. **Forward a doubtful SMS** (or type it) to the SabiTori number. Within seconds they get one reply SMS: the same card
   as the app, in the same order. A scam warning comes first; a scam never has its amount or date said back.
   "EN" or "FR" at the start chooses the language; otherwise the reply is in the message's language.
2. **Dial the SabiTori USSD code** for a menu: check a number that called or texted them (an ordinary mobile number
   asking for money or a PIN is a trap), short anti-scam tips, and how to forward an SMS.

Example reply (prototype output for a forwarded prize scam, 3 SMS):

```
SabiTori :
Ceci ressemble à un piège. N'envoyez pas d'argent. Ne donnez pas votre code secret. Ce message dit que vous avez
gagné quelque chose, mais que vous devez payer d'abord. Ce message vous demande d'envoyer de l'argent à un numéro de
téléphone personnel.
Nous n'avons pas pu tout comprendre dans ce message. Voici ce que nous avons trouvé.
Si vous n'etes pas sur, demandez à une personne de confiance.
```

A forwarded SMS does not carry its original sender's number, so the checks that need it (a company name sent from an
ordinary mobile number, "send money to this number") cannot fire by SMS: "pls send 5000 frs to this nbr" gets no
warning this way. Next step below.

## How it is built (prototype in `packages/gateway`)

The SMS reply and the USSD menu use the same code as the app (`@sabitori/core` reads the message, the language packs
give the words): no second set of rules, no AI writing free text, facts checked against the message.

- `smsReply(text)`: the card as at most 3 SMS, GSM-7 only (the cheapest encoding, readable on the oldest phones).
- `ussd(path)`: a stateless USSD menu (`CON` / `END` screens of at most 182 characters).
- `server.ts`: a small HTTP service (`POST /sms`, `POST /ussd`) any SMS or USSD provider can call. It writes no
  message and no phone number to disk or to the log, only counts.

### Three ways to put it on the network

| Route | What it needs | Fits | Limits |
| --- | --- | --- | --- |
| **A. Relay phone** (first) | An Android phone with a local SIM runs SabiTori in relay mode: it receives the SMS, makes the card **on the phone, offline**, and replies by SMS. No server, no internet, no cloud AI | Starting now, in one town, with a partner organisation that keeps the phone charged | One SIM's sending limits; the relay owner pays the replies (SMS bundles are cheap); needs SMS permissions, so a separate build outside the Play Store |
| **B. Short code** | A short number from MTN, Orange or Camtel (value-added service numbers; Camtel's catalogue lists the "8" prefix), approved under the telecom regulator (ART), connected to `server.ts` | Country scale, free to the sender (operator or sponsor pays) | Months of agreements; international SMS providers list two-way SMS in Cameroon as not supported ([Twilio](https://www.twilio.com/guidelines/cm/sms), [Plivo](https://www.plivo.com/sms/coverage/cm/)), so a direct operator or local aggregator deal is needed |
| **C. USSD code** | A USSD code from the operators (or a USSD aggregator) pointing to `POST /ussd` | The menu on every handset, free to the user if the operator agrees | Same agreements as B; a USSD session cannot carry a whole forwarded message, so USSD is for the menu, SMS for messages |

Route A is the one that matches SabiTori's promise: the message goes from one phone to another over the operator's
network and is read on the relay phone, never on a server.

### Privacy

The app never sends a message anywhere. These channels are different: the person sends their message to us. So:

- Route A: the message is read on the relay phone and deleted after the reply; nothing is kept.
- Routes B and C: the server keeps no message and no number; the operator still sees the SMS, as for any SMS.
- Before launch, `docs/privacy.md` gets a section for these channels, and the first reply of a new number says in one
  line that the message is read by SabiTori and not kept. [OWNER: legal review of that section]

## What only the owner can do

- [OWNER: a partner organisation in one town to host a relay phone (route A) and tell people the number]
- [OWNER: talks with MTN Cameroon, Orange Cameroun and Camtel for a toll-free short code and a USSD code (routes B, C)]
- [OWNER: who pays the reply SMS: operator zero-rating, a sponsor, or the partner]
- A native French and a Pidgin speaker to read the SMS and USSD wording before any launch.

## Next steps in the code

1. Relay mode in the Android app (separate build with SMS permissions): receive an SMS, `smsReply`, send the reply.
2. Two-way follow-ups: reply "1" for the full card in more SMS, "EN"/"FR" to switch language (stateless: the number
   and last message are not kept, so a follow-up re-sends the message).
3. Let the person add the sender: "forward the SMS, then send the number it came from" (or "DE 677123456" at the start),
   so the checks that need the sender work by SMS too.
4. Measure on the evaluation sets how often the SMS reply says the right amount and date (as for photos).

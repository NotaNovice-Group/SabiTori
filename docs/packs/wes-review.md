# Cameroonian Pidgin (wes): review sheet

How to review: read each Pidgin draft aloud and fix it directly in `packs/wes/phrases.json` (the `text` field of the same key).
When a line is right, change its `status` from `"draft"` to `"reviewed"`. Keep every `{slot}` (such as `{date}`) exactly as written; you may move it.
Spelling follows English where the word is the same (an English voice reads it); the note column says what the drafter was unsure about.

239 keys: 83 from `packages/core/src/catalog.ts`, then 156 from `apps/app/src/engine/extra.ts`. All are `draft`.

| key | English | Pidgin draft | note |
|---|---|---|---|
| `scam.likely` | This looks like a trick. Do not send money. Do not share your PIN. | This message look like wayo. No send money. No give your PIN to anybody. |  |
| `scam.caution` | Be careful. Check before you do anything. | Take care. Check first before you do anything. |  |
| `scam.no_signs` | We found no warning signs. Never share your PIN with anyone. | We no see any warning sign. Never give your PIN to anybody. | Kept away from any word that means safe. |
| `scam.check_balance` | Check your balance with your operator's own code, not with a number from this message. | Check your balance with the code wey your operator get, no be with number wey dey inside this message. | Possessive avoided ("your operator yi code") to keep it easy for an English voice. |
| `scam.signal.asks_pin` | This message asks for your secret code. | This message ask for your secret code. |  |
| `scam.signal.wrong_transfer` | This message says money was sent to you by mistake. | This message talk say them send you money by mistake. | "them" written in English spelling for Pidgin "dem". |
| `scam.signal.prize_fee` | This message says you won something, but you must pay first. | This message talk say you win something, but e say make you pay first. |  |
| `scam.signal.account_block_threat` | This message threatens to block your account or SIM card. | This message threaten say them go block your account or your SIM card. | "threaten" may be heavy; alternative: "This message the frighten you say..." |
| `scam.signal.link` | This message has a link. Do not open it. | This message get link. No open am. |  |
| `scam.signal.time_pressure` | This message pushes you to act very fast. | This message want rush you make you do something quick quick. |  |
| `scam.signal.sender_mismatch` | It says it is from {sender}, but it does not come from {sender}'s real number. | E say e come from {sender}, but e no come from the real number of {sender}. | "e" for it; some write "i". Check how the voice says "e". |
| `scam.signal.fake_balance` | This balance message does not come from your operator. | This balance message no come from your operator. |  |
| `scam.signal.asks_to_call_number` | This message asks you to call a number. Use the official number instead. | This message tell you make you call one number. Use the official number instead. |  |
| `scam.signal.ussd_instruction` | This message tells you to dial a code. Codes like this can send your money away. | This message tell you make you dial one code. Code like this fit send your money go. |  |
| `scam.signal.pay_to_personal_number` | This message asks you to send money to a personal phone number. | This message ask you make you send money to somebody personal phone number. | "personal phone number": unsure of the most natural Pidgin; alternative "to ordinary person yi number". |
| `scam.signal.promised_return` | This message promises your money will grow fast. This is a common trick. | This message promise say your money go grow quick quick. This kind thing na common wayo. |  |
| `scam.signal.offer_fee` | This message offers a job, a place, a loan or a scholarship, but asks you to pay first. | This message offer you work, place, loan or scholarship, but e say make you pay first. | "place" means a place in a concours or school; maybe say "place for concours". |
| `scam.signal.distress_money` | This message tells of an emergency to ask for money. Call the person back on the number you already know. | This message talk say trouble don happen, for ask you money. Call the person back for the number wey you already sabi. |  |
| `sender.known` | This message is from {sender}. | This message come from {sender}. |  |
| `sender.claimed` | This message says it is from {sender}. | This message say e come from {sender}. |  |
| `sender.unknown` | We do not know who sent this message. | We no know who send this message. |  |
| `about.electricity_bill` | It is about your electricity bill. | E concern your light bill. | "light bill" is the everyday word for the electricity (ENEO) bill. |
| `about.water_bill` | It is about your water bill. | E concern your water bill. |  |
| `about.mobile_money` | It is about mobile money. | E concern mobile money. |  |
| `about.telecom` | It is about your phone line or airtime. | E concern your phone line or your credit. | "credit" for airtime, as people say in Cameroon. |
| `about.bank` | It is about your bank account. | E concern your bank account. |  |
| `about.health` | It is about your health or a hospital visit. | E concern your health or when you go hospital. |  |
| `about.school` | It is about school. | E concern school. |  |
| `about.administrative` | It is about an official paper. | E concern one official paper. |  |
| `about.legal` | It is about a legal matter, such as court or police. | E concern law matter, like court or police. |  |
| `about.other` | We could not tell what this message is about. | We no fit know which thing this message concern. | Avoided "wetin" (Nigerian feel) and "weti" (English voice reads it badly). |
| `action.pay` | You must pay. | You get for pay. | "get for" = have to. Alternative: "You must pay." |
| `action.bring_document` | You must bring or send a paper. | You get for bring or send one paper. |  |
| `action.go_to_place` | You must go to an office or a place. | You get for go for one office or one place. |  |
| `action.call` | You must call them. | You get for call them. |  |
| `action.reply` | You must answer this message. | You get for answer this message. |  |
| `action.collect` | You can collect something. | You fit go collect something. |  |
| `action.take_medicine` | Take your medicine as the paper says. | Take your medicine the way the paper talk. | Many people say "drink medicine"; "take" also covers injections and creams. |
| `action.nothing` | You do not need to do anything. | You no need do anything. |  |
| `action.unclear` | We are not sure what you must do. Ask someone you trust. | We no sure what you get for do. Ask somebody wey you trust. |  |
| `deadline.by` | Do it by {date}. | Do am latest {date}. | "latest" = on or before that day. Check it sounds natural. |
| `deadline.on` | Be there on {date}. | Make you dey there for {date}. |  |
| `deadline.on_at` | Be there on {date} at {hour} {minutes} a.m. | Make you dey there for {date}, for {hour} {minutes} for morning. | Morning time. Check "for ... for morning" is not too heavy. |
| `deadline.on_at_hour` | Be there on {date} at {hour} a.m. | Make you dey there for {date}, for {hour} o'clock for morning. | Added "o'clock" for the full hour. |
| `deadline.on_at_pm` | Be there on {date} at {hour} {minutes} p.m. | Make you dey there for {date}, for {hour} {minutes} for afternoon. | {hour} 12 means noon: "12 for afternoon" may sound odd. |
| `deadline.on_at_hour_pm` | Be there on {date} at {hour} p.m. | Make you dey there for {date}, for {hour} o'clock for afternoon. | Same noon question as above. |
| `deadline.on_at_eve` | Be there on {date} at {hour} {minutes} p.m. | Make you dey there for {date}, for {hour} {minutes} for evening. | 6 to 11 p.m.: from 8 or 9 people may say "for night". |
| `deadline.on_at_hour_eve` | Be there on {date} at {hour} p.m. | Make you dey there for {date}, for {hour} o'clock for evening. | Same evening/night question. |
| `deadline.date` | It is on {date}. | Na for {date}. |  |
| `deadline.from` | From {date}. | Start from {date}. |  |
| `deadline.passed` | The date {date} has already passed. | The date {date} don already pass. |  |
| `deadline.none` | There is no date in this message. | This message no get any date. |  |
| `money.amount` | The amount is {amount}. | The money na {amount}. |  |
| `money.none` | This message does not say an amount of money. | This message no talk how much money. |  |
| `help.call` | To ask questions, call {phone}. | If you get question, call {phone}. |  |
| `help.none` | If you are not sure, ask someone you trust. | If you no sure, ask somebody wey you trust. |  |
| `urgency.info` | This is only information. | This na only information. |  |
| `urgency.soon` | Do this soon. | Make you do am soon. |  |
| `urgency.urgent` | This is urgent. | This thing urgent. |  |
| `facts_only.intro` | We could not understand all of this message. Here is what we found. | We no fit understand all this message. Na these things we find. |  |
| `ui.welcome` | Choose your language. | Choose your language. |  |
| `ui.take_photo` | Take a photo of a message | Snap one message | "snap" = take a photo, common in Cameroon. |
| `ui.paste` | Paste a message | Paste one message |  |
| `ui.reading` | Reading your message. | We the read your message. | "the" (Cameroonian progressive marker): check an English voice says it like "dee". |
| `ui.camera_closer` | Move closer. | Come near small. |  |
| `ui.camera_hold` | Hold still. | Hold am, no shake. |  |
| `ui.camera_ok` | Got it. | We don get am. |  |
| `ui.retake` | The photo is not clear. Please take it again. | The photo no clear. Abeg snap am again. |  |
| `ui.listen` | Listen | Listen |  |
| `ui.again` | Again | Again |  |
| `ui.slower` | Slower | Talk slow |  |
| `ui.stop` | Stop | Stop |  |
| `ui.call` | Call | Call |  |
| `ui.remind` | Remind me | Remind me |  |
| `ui.show_helper` | Show someone | Show somebody |  |
| `ui.show_source` | Where is this in the message? | Where e dey for the message? |  |
| `ui.history` | My messages | My messages |  |
| `ui.settings` | Settings | Settings | English word kept: people know it from the phone. |
| `ui.language` | Language | Language |  |
| `ui.delete` | Delete | Delete | English word kept: people know it from the phone. |
| `ui.back` | Back | Go back |  |
| `ui.privacy` | Your messages never leave this phone. | Your messages no go ever comot from this phone. |  |
| `ui.not_advice` | SabiTori explains messages. It does not give advice. | SabiTori the explain messages. E no di give advice. | "the" (Cameroonian progressive marker): check an English voice says it like "dee". |
| `app.next` | Next | Next |  |
| `app.mode.title` | How do you use messages? | How you the use messages? | "the" (Cameroonian progressive marker): check an English voice says it like "dee". |
| `app.mode.listen` | I listen | I want listen |  |
| `app.mode.listen_hint` | The phone speaks the message and every button. | The phone go talk the message and every button. |  |
| `app.mode.read` | I read | I want read |  |
| `app.mode.read_hint` | The message is shown. Press Listen to hear it. | We go show the message. Press Listen for hear am. | "Listen" is the button name: keep it the same as ui.listen. |
| `app.lang.soon` | Voice coming soon. Spoken in {name} for now. | Voice go come soon. For now e go talk for {name}. |  |
| `app.lang.soon_plain` | Voice coming soon. | Voice go come soon. |  |
| `app.tap_again` | Tap again to do it | Touch am again for do am |  |
| `app.home.empty` | No messages yet | Message never dey | "never" = not yet. Alternative: "No message yet". |
| `app.home.empty_hint` | A message you read with SabiTori is kept here, on this phone only. | Message wey you read with SabiTori go stay here, for this phone only. |  |
| `app.practice` | Practice with an example | Practice with one example |  |
| `app.practice.title` | Practice messages | Practice messages |  |
| `app.practice.hint` | These messages are made up. | These messages na lie-lie one. | "lie-lie" = made up / not real. Check it does not sound like an accusation. |
| `app.practice.badge` | Practice message | Practice message |  |
| `app.example.eneo` | Electricity bill | Light bill |  |
| `app.example.camwater` | Water cut-off notice | Notice for water cut |  |
| `app.example.momo` | Money sent by mistake | Money wey them send by mistake |  |
| `app.example.prize` | Prize and secret code | Prize and secret code |  |
| `app.example.hospital` | Hospital appointment | Hospital appointment |  |
| `app.example.school` | School fees | School fees |  |
| `app.paste.label` | The message | The message |  |
| `app.paste.placeholder` | Paste or type the message here | Paste or write the message here |  |
| `app.paste.sender` | Who sent it? | Who send am? |  |
| `app.paste.sender.name` | A name | One name |  |
| `app.paste.sender.number` | A number | One number |  |
| `app.paste.sender.unknown` | I do not know | I no know |  |
| `app.paste.sender.name_label` | Name of the sender | Name of the person wey send am |  |
| `app.paste.sender.number_label` | Number of the sender | Number of the person wey send am |  |
| `app.paste.go` | Explain this message | Explain this message |  |
| `app.capture.checking` | Checking the photo | We the check the photo | "the" (Cameroonian progressive marker): check an English voice says it like "dee". |
| `app.capture.again` | Take the photo again | Snap the photo again |  |
| `app.capture.use` | Use this photo anyway | Use this photo like that | "like that" = anyway. |
| `app.capture.empty` | We could not read any words in this photo. | We no fit read any word for this photo. |  |
| `app.capture.failed` | Reading failed. Please try again. | The reading no work. Abeg try again. |  |
| `app.sms.wait` | Read my next SMS | Read my next SMS |  |
| `app.sms.waiting` | Waiting for your next SMS. When it comes, your phone asks you. Press Allow. | We the wait your next SMS. When e come, your phone go ask you. Press Allow. | "the" (Cameroonian progressive marker): check an English voice says it like "dee". "Allow" kept: it is the English button on the phone's own screen (it may show in French on some phones). |
| `app.sms.stop` | Stop waiting | No wait again | "no ... again" = stop doing. Check it is clear as a button. |
| `app.sms.none` | No SMS was read. Try again, or share the message from your SMS app. | We no read any SMS. Try again, or share the message from your SMS app. |  |
| `app.sms.unavailable` | This phone cannot do this. Share the message from your SMS app instead. | This phone no fit do this one. Share the message from your SMS app instead. |  |
| `app.photo.choose` | Choose a photo | Choose one photo |  |
| `app.photo.denied_title` | The camera is switched off | The camera dey off |  |
| `app.photo.denied` | SabiTori needs the camera to read a paper. You can switch it on in the phone settings. You can also choose a photo you already have. | SabiTori need the camera for read paper. You fit on am for the phone settings. You fit also choose photo wey you don already get. | "on am" = switch it on. |
| `app.settings.open` | Open settings | Open settings |  |
| `app.remind.set` | Reminder set | We don set reminder |  |
| `app.remind.cancel` | Cancel the reminder | Remove the reminder |  |
| `app.remind.past` | This date is too close for a reminder. | This date too near for reminder. |  |
| `app.remind.denied` | Notifications are switched off, so SabiTori cannot remind you. You can switch them on in the phone settings. | Notifications dey off, so SabiTori no fit remind you. You fit on them for the phone settings. | "Notifications" kept in English: no common Pidgin word. |
| `app.remind.failed` | The reminder could not be set. Please try again. | We no fit set the reminder. Abeg try again. |  |
| `app.remind.channel` | Reminders | Reminders |  |
| `app.card.not_found` | This message is no longer here. | This message no dey here again. |  |
| `app.card.fallback_note` | Spoken in {name} | E talk for {name} |  |
| `app.urgency.info` | Information | Information |  |
| `app.urgency.soon` | Soon | Soon |  |
| `app.urgency.urgent` | Urgent | Urgent |  |
| `app.scam.title` | Warning | Take care | Two words instead of "Warning". Alternative: keep "Warning". |
| `app.fact.reference` | Reference | Reference |  |
| `app.sender.unknown` | Unknown sender | We no know the sender |  |
| `app.sender.says` | Says: {name} | E say na {name} |  |
| `app.close` | Close | Close |  |
| `app.original` | The message as written | The message the way them write am |  |
| `app.settings.listen_first` | Listen first | Listen first |  |
| `app.settings.listen_first_hint` | A button speaks its name on the first tap and acts on the second. | When you touch button the first time, e go talk e name. The second time, e go do e work. | "e name", "e work": some write "yi" (his/its). Check which the voice says better. |
| `app.settings.on` | On | On |  |
| `app.settings.off` | Off | Off |  |
| `app.settings.speed` | Speaking speed | How fast the voice talk |  |
| `app.settings.speed.normal` | Normal | Normal |  |
| `app.settings.speed.slow` | Slow | Slow |  |
| `app.settings.speed.slower` | Very slow | Slow slow | Doubling = very slow. |
| `app.settings.history` | Keep my messages | Keep my messages |  |
| `app.settings.history.30` | 30 days | 30 days |  |
| `app.settings.history.7` | 7 days | 7 days |  |
| `app.settings.history.0` | Do not keep | No keep them |  |
| `app.settings.model` | Understanding model | Model for understand | Technical: "model" kept, no Pidgin word. |
| `app.settings.model.none` | Not added. The phone uses simple rules. | We never add am. The phone the use simple rules. | "the" (Cameroonian progressive marker): check an English voice says it like "dee". |
| `app.settings.model.ready` | Added, {size} | E don add, {size} |  |
| `app.settings.model.loading` | Getting the model ready | We the prepare the model | "the" (Cameroonian progressive marker): check an English voice says it like "dee". |
| `app.settings.model.active` | Ready to use | E ready for use |  |
| `app.settings.model.failed` | Could not start. Simple rules are used. | E no fit start. Na simple rules we the use. |  |
| `app.settings.model.add` | Add a model file | Add model file |  |
| `app.settings.model.remove` | Remove the model file | Remove the model file |  |
| `app.settings.model.saving` | Saving the file | We the save the file |  |
| `app.settings.model.err.not_gguf` | This file is not a model file. | This file no be model file. |  |
| `app.settings.model.err.unavailable` | This phone cannot keep a model file. | This phone no fit keep model file. |  |
| `app.settings.model.err.write_failed` | The file was not saved. The phone may be full. | The file no save. Maybe the phone don full. |  |
| `app.settings.model.builtin` | Understanding model: built in (MiniLM, 33M) | Model for understand: e dey inside the app already (MiniLM, 33M) | Technical line; "MiniLM, 33M" kept as is. |
| `app.settings.model.builtin_loading` | Getting the built-in model ready. Simple rules are used until then. | We the prepare the model wey dey inside the app. Until e ready, na simple rules we di use. |  |
| `app.settings.model.builtin_ready` | Ready. It reads every message on this phone, with no internet. | E ready. E the read every message for this phone, without internet. |  |
| `app.settings.model.builtin_failed` | Could not start. Simple rules are used. | E no fit start. Na simple rules we the use. |  |
| `app.settings.model.note` | This extra model is optional. It can be slow on some phones. Without it, SabiTori still reads messages with simple rules. | This extra model, na if you want. E fit slow for some phones. Without am, SabiTori still the read messages with simple rules. |  |
| `app.card.checking` | Checking more carefully | We the check am well well |  |
| `app.card.improved` | We understood more of this message. You can listen again. | We don understand this message pass before. You fit listen again. |  |
| `app.settings.privacy` | Privacy | Privacy | English word kept: no short Pidgin word. Alternative: "Your secret". |
| `app.settings.privacy_body` | Photos, texts and voices stay on this phone. SabiTori does not use the internet to read a message. Your history can be deleted at any time. | Photos, texts and voices the stay for this phone. SabiTori no di use internet for read message. You fit delete your history any time. |  |
| `app.settings.connected` | Connected features | Things wey use internet | Plain wording for "Connected features". |
| `app.settings.connected_hint` | These are off until you switch them on. Your messages never leave this phone, with or without them. | These things dey off until you on them. Your messages no go ever comot from this phone, with them or without them. |  |
| `app.settings.updates` | Get new languages and scam warnings | Get new languages and wayo warnings |  |
| `app.settings.updates_hint` | The phone downloads language voices, updated scam warnings and confirmed official numbers. Your messages are never sent. | The phone go download language voices, new wayo warnings and official numbers wey them don confirm. We no go ever send your messages. |  |
| `app.settings.updates.never` | Not checked yet | We never check yet |  |
| `app.settings.updates.last` | Last check: {date} | Last check: {date} |  |
| `app.settings.updates.check` | Check now | Check now |  |
| `app.settings.updates.checking` | Checking | We the check |  |
| `app.settings.updates.up_to_date` | You already have the newest. | You don already get the newest one. |  |
| `app.settings.updates.updated` | Done. The new things are ready the next time you open SabiTori. | E don finish. The new things go ready next time wey you open SabiTori. |  |
| `app.settings.updates.network` | Could not connect. Try again later. | We no fit connect. Try again later. |  |
| `app.settings.updates.unsafe` | This update could not be trusted, so it was not used. Nothing changed. | We no fit trust this update, so we no use am. Nothing no change. |  |
| `app.settings.updates.store` | The phone could not save the update. It may be full. Nothing changed. | The phone no fit save the update. Maybe e don full. Nothing no change. |  |
| `app.settings.updates.delete` | Delete downloaded updates | Delete the updates wey you download |  |
| `app.settings.updates.delete_hint` | This deletes the languages, scam warnings and official numbers that were downloaded. SabiTori goes back to the ones it came with, the next time you open it. Your messages are not touched. | This one go delete the languages, wayo warnings and official numbers wey you download. SabiTori go go back to the ones wey e come with, next time wey you open am. We no go touch your messages. | "go go back" may sound odd spoken; alternative "SabiTori go return to...". |
| `app.settings.updates.delete_confirm` | Yes, delete the downloaded updates | Yes, delete the updates wey you download |  |
| `app.settings.updates.keep` | Keep them | Keep them |  |
| `app.settings.updates.deleted` | Deleted. SabiTori uses its built-in languages and warnings from the next start. | E don delete. From next time wey e start, SabiTori go use the languages and warnings wey e come with. |  |
| `app.settings.reports` | Send error reports | Send problem reports | Plain wording for "error reports". |
| `app.settings.reports_hint` | When the app breaks, a report without your messages helps fix it. It never contains your messages, photos, names, numbers or amounts. | When the app spoil, report wey no get your messages the help for repair am. E no ever get your messages, photos, names, numbers or how much money. |  |
| `app.settings.privacy_connected` | Your messages never leave this phone. If you switch them on, SabiTori can download updates and send error reports, never your messages. | Your messages no go ever comot from this phone. If you on them, SabiTori fit download updates and send problem reports, but never your messages. |  |
| `app.settings.version` | Version | Version |  |
| `app.pilot.title` | Pilot numbers | Numbers for the pilot | "pilot" (the trial) kept in English. |
| `app.pilot.body` | This phone counts how often you use SabiTori. It never keeps what your messages say. Nothing is sent: you choose whether to share these numbers. | This phone the count how many times you use SabiTori. E no ever keep what your messages talk. Nothing no go anywhere: na you go choose if you want share these numbers. |  |
| `app.pilot.explained` | Messages explained: {n} | Messages wey we explain: {n} |  |
| `app.pilot.warnings` | Scam warnings: {n} | Wayo warnings: {n} |  |
| `app.pilot.listened` | Times you listened: {n} | Times wey you listen: {n} |  |
| `app.pilot.since` | Counting since {date} | We start count for {date} |  |
| `app.pilot.share` | Share the numbers | Share the numbers |  |
| `app.pilot.copied` | Numbers copied. Paste them in a message to the pilot team. | Numbers don copy. Paste them for message to the pilot team. |  |
| `app.pilot.reset` | Start counting again | Start the count again |  |
| `app.settings.clear` | Delete all my messages | Delete all my messages |  |
| `app.settings.cleared` | Deleted | E don delete |  |
| `app.nav.home` | Home | Home | English word kept. |
| `app.settings.restart` | Start again from the beginning | Start again from the beginning |  |
| `app.settings.restart_hint` | This deletes every message kept on this phone, and their reminders, and takes you back to choose your language. SabiTori has no account, so there is nothing else to sign out of. It cannot be undone. | This one go delete every message wey dey for this phone, and their reminders, and carry you back for choose your language. SabiTori no get account, so nothing else no dey for sign out. You no fit bring them back. | "sign out" kept in English. |
| `app.settings.restart_confirm` | Delete and start again | Delete and start again |  |
| `app.settings.clear_hint` | This deletes every message kept on this phone, and their reminders. It cannot be undone. | This one go delete every message wey dey for this phone, and their reminders. You no fit bring them back. |  |
| `app.settings.clear_confirm` | Yes, delete all my messages | Yes, delete all my messages |  |
| `app.settings.clear_keep` | Keep my messages | Keep my messages |  |
| `app.settings.history.0_hint` | Messages are not kept. A message with a reminder is kept until its reminder, then deleted. | We no go keep messages. Message wey get reminder go stay until the reminder, then e go delete. |  |
| `app.remind.kept` | This message is kept on this phone until the reminder, then deleted. | This message go stay for this phone until the reminder, then e go delete. |  |
| `app.remind.passed` | This date has already passed. | This date don already pass. |  |
| `app.card.not_saved` | This message could not be kept on this phone. You can still read it now. | We no fit keep this message for this phone. You fit still read am now. |  |
| `app.share.first_only` | Only the first photo is read. | Na only the first photo we go read. |  |
| `app.share.too_long` | This text is very long. Only the beginning is read. | This text long too much. Na only the beginning we go read. |  |
| `app.share.too_big` | This file is too big to read. | This file too big for read. |  |
| `app.share.unsupported` | SabiTori reads photos and texts. This file is neither, so it was not opened. | SabiTori the read photos and texts. This file no be any one of them, so we no open am. |  |
| `app.capture.no_ocr` | This phone cannot read photos. You can paste or type the message instead. | This phone no fit read photos. You fit paste or write the message instead. |  |
| `app.fatal.title` | Something went wrong | Something don spoil |  |
| `app.fatal.body` | SabiTori could not continue. Your messages are still on this phone. | SabiTori no fit continue. Your messages still dey for this phone. |  |
| `app.fatal.restart` | Start again | Start again |  |
| `app.fatal.remove_updates` | Remove downloaded updates | Remove the updates wey you download |  |
| `app.fatal.listen` | Listen | Listen |  |
| `app.settings.updates.bad_file` | The file that was refused: {file} | The file wey we refuse: {file} |  |
| `app.settings.updates.quarantined` | A downloaded update could not be used, so SabiTori went back to its built-in languages and warnings. | One update wey you download no fit work, so SabiTori go back to the languages and warnings wey e come with. |  |
| `app.settings.model.testing` | Checking the model file | We the check the model file |  |
| `app.settings.model.err.not_usable` | This model file could not be started, so it was not kept. Nothing else changed. | This model file no fit start, so we no keep am. Nothing else no change. |  |
| `app.settings.about` | About and open licences | About SabiTori and open licences | "licences" kept in English: no Pidgin word. |
| `app.about.intro` | SabiTori is free software. It is built with the work of many people. Their names and licences are below. | SabiTori na free software. Na plenty people their work make am. Their names and licences dey below. |  |
| `app.about.voices` | Voices | Voices |  |
| `app.about.notices` | Open licences | Open licences |  |

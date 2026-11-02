// French templates (lang "fr"). g(kind, action, opts, texts[]): one message per text wording.
const g = (k, a, o, t) => ({ lang: 'fr', k, a, ...o, t });

export default [
  /* ===================== electricity_bill (14) ===================== */
  g('electricity_bill', 'pay', { due: 'u', from: 'ENEO' }, [
    (c) => `ENEO: Votre facture N° ${c.ref('', 7)} de ${c.A(8000, 60000)} est disponible. Date limite de paiement: ${c.D()}. Evitez la coupure.`,
  ]),
  g('electricity_bill', 'pay', { due: 's', from: 'ENEO' }, [
    (c) => `Cher client ENEO, facture n° ${c.ref('', 8)}: ${c.A(5000, 45000)} à régler avant le ${c.D()}. Payez via Orange Money ou MTN MoMo. Merci.`,
  ]),
  g('electricity_bill', 'pay', { due: 'L', src: 'letter', from: 'ENEO' }, [
    (c) => `ENEO CAMEROUN\nAVIS DE RELANCE\nM./Mme ${c.name()}\nVotre facture n° ${c.ref('', 8)} d'un montant de ${c.A(15000, 90000)} reste impayée. Sans règlement avant le ${c.D()}, nous procéderons à la suspension de votre fourniture. Veuillez vous présenter à l'agence de ${c.city()} avec la présente.`,
  ]),
  g('electricity_bill', 'nothing', { from: 'ENEO' }, [
    (c) => `ENEO: Recharge du compteur n° ${c.ref('', 11)} effectuée avec succès. Montant ${c.A(2000, 20000, 1000)}. Réf ${c.ref('EN', 6)}.`,
  ]),
  g('electricity_bill', 'nothing', { from: 'ENEO' }, [
    (c) => `ENEO: Coupure d'électricité programmée le ${c.D(c.int(2, 12))} de 8h à 16h au quartier ${c.quarter()} pour travaux. Veuillez nous excuser pour la gêne.`,
  ]),
  g('electricity_bill', 'bring_document', { due: 's', src: 'letter', from: 'ENEO' }, [
    (c) => `ENEO - Service Abonnés\nObjet: demande d'abonnement\nPour poursuivre votre dossier, veuillez apporter à l'agence de ${c.city()} une photocopie de votre CNI, un plan de localisation et l'attestation de propriété, au plus tard le ${c.D()}.`,
  ]),
  g('electricity_bill', 'go_to_place', { due: 'u', from: 'ENEO' }, [
    (c) => `ENEO: Votre demande de changement de compteur est acceptée. Présentez-vous à l'agence de ${c.city()} le ${c.D()} à ${c.time()} muni de votre pièce d'identité.`,
  ]),
  g('electricity_bill', 'call', { due: 's', from: 'ENEO' }, [
    (c) => `ENEO: Pour le suivi de votre dossier de branchement n° ${c.ref('', 6)}, appelez le service clientèle au ${c.land()} avant le ${c.D()}.`,
  ]),
  g('electricity_bill', 'reply', { due: 'u', from: 'ENEO' }, [
    (c) => `ENEO: Pour confirmer le relevé de votre compteur, répondez par SMS avec l'index lu avant le ${c.D()}. Merci.`,
  ]),
  g('electricity_bill', 'collect', { from: 'ENEO' }, [
    (c) => `ENEO: Votre attestation de non-redevance est prête. Vous pouvez la retirer à l'agence de ${c.city()}, du lundi au vendredi.`,
  ]),
  g('electricity_bill', 'pay', { u: 'urgent', sg: ['pay_to_personal_number', 'sender_mismatch', 'time_pressure'], from: 'num' }, [
    (c) => `ENEO: Votre compteur sera coupé aujourd'hui. Envoyez ${c.A(10000, 40000, 1000)} par MoMo au ${c.ph()} pour régler votre facture avant 17h.`,
  ]),
  g('electricity_bill', 'pay', { due: 'u', sg: ['link', 'sender_mismatch'], from: 'num' }, [
    (c) => `ENEO: Facture ${c.ref('', 7)} en retard. Evitez la coupure avant le ${c.D()}, payez ici: ${c.url('eneo-paie.example', '/f/' + c.code(4))}`,
  ]),
  g('electricity_bill', 'pay', { due: 's', sg: ['link'], from: 'ENEO' }, [
    (c) => `ENEO: Votre facture de ${c.A(8000, 50000)} est disponible sur www.eneo-exemple.cm. Date limite: ${c.D()}.`,
  ]),
  g('electricity_bill', 'pay', { src: 'whatsapp', u: 'urgent', from: 'name:Tonton Blaise Fictif' }, [
    (c) => `Bonsoir ma fille, ENEO a coupé le courant à la maison, la facture de ${c.A(10000, 30000, 1000)} n'est pas payée. Tu peux envoyer ça par Orange Money ce soir? Merci.`,
  ]),

  /* ===================== water_bill (12) ===================== */
  g('water_bill', 'pay', { due: 's', from: 'CAMWATER' }, [
    (c) => `CAMWATER: Facture d'eau n° ${c.ref('CW-', 5)}, consommation ${c.int(6, 40)} m3, montant ${c.A(3000, 25000)}. A payer avant le ${c.D()}.`,
  ]),
  g('water_bill', 'pay', { due: 'u', from: 'CAMWATER' }, [
    (c) => `CAMWATER: Cher client, votre facture d'eau de ${c.A(4000, 30000)} est impayée. Une coupure interviendra le ${c.D()} si le règlement n'est pas effectué. Réf: ${c.ref('CW-', 5)}.`,
  ]),
  g('water_bill', 'pay', { due: 'L', src: 'letter', from: 'CAMWATER' }, [
    (c) => `CAMWATER - Direction commerciale\nMISE EN DEMEURE\nM./Mme ${c.name()}, contrat n° ${c.ref('', 8)}\nVotre facture de ${c.A(12000, 70000)} était exigible le ${c.D()}. Nous vous invitons à régulariser votre situation pour éviter la coupure de votre branchement.`,
  ]),
  g('water_bill', 'nothing', { from: 'CAMWATER' }, [
    (c) => `CAMWATER: Nous avons bien reçu votre paiement de ${c.A(3000, 25000)} pour la facture ${c.ref('CW-', 5)}. Merci pour votre paiement.`,
  ]),
  g('water_bill', 'nothing', { from: 'CAMWATER' }, [
    (c) => `CAMWATER: Interruption de l'alimentation en eau le ${c.D(c.int(1, 10))} au quartier ${c.quarter()} pour travaux sur le réseau. Nous vous remercions de votre compréhension.`,
  ]),
  g('water_bill', 'go_to_place', { due: 's', from: 'CAMWATER' }, [
    (c) => `CAMWATER: Présentez-vous à l'agence de ${c.city()} avant le ${c.D()} pour la régularisation de votre branchement.`,
  ]),
  g('water_bill', 'bring_document', { due: 's', src: 'letter', from: 'CAMWATER' }, [
    (c) => `CAMWATER\nDemande d'abonnement eau\nPièces à fournir: photocopie de la CNI, plan de situation du terrain, quittance d'achat du compteur. Dépôt du dossier avant le ${c.D()}.`,
  ]),
  g('water_bill', 'call', { from: 'CAMWATER' }, [
    (c) => `CAMWATER: Fuite détectée sur votre branchement. Pour plus d'informations appelez le service client au ${c.land()}.`,
  ]),
  g('water_bill', 'reply', { due: 's', from: 'CAMWATER' }, [
    (c) => `CAMWATER: Pour recevoir vos factures par SMS, répondez OUI à ce message avant le ${c.D()}.`,
  ]),
  g('water_bill', 'collect', { from: 'CAMWATER' }, [
    (c) => `CAMWATER: Votre attestation de raccordement est prête. Vous pouvez la retirer à l'agence de ${c.city()}.`,
  ]),
  g('water_bill', 'pay', { u: 'urgent', sg: ['pay_to_personal_number', 'sender_mismatch', 'account_block_threat', 'time_pressure'], from: 'num' }, [
    (c) => `CAMWATER: Votre facture est impayée, votre branchement sera coupé dans les 24 heures. Envoyez ${c.A(8000, 30000, 1000)} par Orange Money au ${c.ph()}.`,
  ]),
  g('water_bill', 'pay', { due: 's', sg: ['link'], from: 'CAMWATER' }, [
    (c) => `CAMWATER: Payez votre facture ${c.ref('CW-', 5)} de ${c.A(4000, 30000)} en ligne avant le ${c.D()}: ${c.url('camwater-exemple.cm', '/paiement')}`,
  ]),

  /* ===================== mobile_money (24) ===================== */
  g('mobile_money', 'nothing', { from: 'MTN MoMo' }, [
    (c) => `Vous avez reçu ${c.A(2000, 100000, 500)} de ${c.name()}. Nouveau solde: ${c.A(5000, 200000, 500)}. ID de transaction: ${c.ref('', 7)}. Ne communiquez jamais votre code secret.`,
  ]),
  g('mobile_money', 'nothing', { from: 'Orange Money' }, [
    (c) => `Orange Money: Retrait effectué avec succès. Montant ${c.A(5000, 150000, 500)}, frais ${c.A(100, 1500, 100)}. Nouveau solde ${c.A(500, 90000, 500)}. ID ${c.ref('', 9)}. Orange ne vous demandera jamais votre code PIN.`,
  ]),
  g('mobile_money', 'nothing', { from: 'Orange Money' }, [
    (c) => `Dépôt effectué avec succès: ${c.A(5000, 200000, 500)} sur votre compte Orange Money par l'agent ${c.fn()}. Transaction ${c.ref('', 8)}. Merci.`,
  ]),
  g('mobile_money', 'nothing', { from: 'MTN MoMo' }, [
    (c) => `Transfert réussi. Vous avez envoyé ${c.A(1000, 80000, 500)} à ${c.name()} (${c.fmtPh(c.ph9())}). Frais: ${c.A(100, 1000, 100)}. Nouveau solde: ${c.A(500, 60000, 500)}. Ne communiquez jamais votre code PIN.`,
  ]),
  g('mobile_money', 'nothing', { from: 'MTN MoMo' }, [
    (c) => `MTN MoMo: Paiement de facture ENEO effectué avec succès. Montant ${c.A(5000, 40000, 500)}. Référence ${c.ref('', 9)}. Gardez ce message comme preuve.`,
  ]),
  g('mobile_money', 'pay', { due: 'u', from: 'MTN MoMo' }, [
    (c) => `MTN MoMo: Votre prêt de ${c.A(5000, 50000, 1000)} arrive à échéance le ${c.D()}. Veuillez rembourser avant cette date pour éviter des pénalités.`,
  ]),
  g('mobile_money', 'go_to_place', { due: 's', from: 'Orange Money' }, [
    (c) => `Orange Money: Pour lever le plafond de votre compte, présentez-vous dans une agence Orange avant le ${c.D()}.`,
  ]),
  g('mobile_money', 'bring_document', { due: 's', from: 'MTN MoMo' }, [
    (c) => `MTN MoMo: Mise à jour d'identification obligatoire. Munissez-vous de votre CNI et de votre numéro, et présentez-les chez un agent avant le ${c.D()}.`,
  ]),
  g('mobile_money', 'call', { from: 'Orange Money' }, [
    (c) => `Orange Money: Pour toute réclamation sur la transaction ${c.ref('', 8)}, appelez le service client depuis votre ligne Orange.`,
  ]),
  g('mobile_money', 'collect', { from: 'Orange Money' }, [
    (c) => `Orange Money: Votre carte de retrait est prête. Vous pouvez la retirer à l'agence de ${c.city()} avec votre CNI.`,
  ]),
  g('mobile_money', 'pay', { src: 'whatsapp', sg: ['wrong_transfer'], from: 'num' }, [
    (c) => `Bonsoir, je me suis trompé de numéro, je vous ai envoyé ${c.A(15000, 90000, 500)} par erreur. Merci de me renvoyer l'argent au ${c.sn}. Que Dieu vous bénisse.`,
  ]),
  g('mobile_money', 'pay', { sg: ['wrong_transfer', 'fake_balance', 'sender_mismatch'], from: 'num' }, [
    (c) => `MTN MoMo: Vous avez reçu ${c.A(50000, 150000, 5000)} de ${c.name()}. Nouveau solde: ${c.A(60000, 200000, 5000)}. Cet envoi était une erreur de transfert, renvoyez le montant au ${c.sn} svp.`,
  ]),
  g('mobile_money', 'nothing', { sg: ['fake_balance', 'sender_mismatch'], from: 'num' }, [
    (c) => `Vous avez reçu ${c.A(25000, 200000, 5000)} de ${c.name()}. Nouveau solde: ${c.A(100000, 300000, 5000)}. ID de transaction: ${c.ref('', 7)}. MTN MoMo.`,
  ]),
  g('mobile_money', 'reply', { sg: ['asks_pin', 'sender_mismatch'], from: 'num' }, [
    (c) => `MTN MoMo: Pour annuler la transaction erronée de ${c.A(10000, 80000, 500)}, envoyez votre code secret au ${c.sn}.`,
  ]),
  g('mobile_money', 'reply', { u: 'urgent', sg: ['account_block_threat', 'time_pressure', 'asks_pin', 'sender_mismatch'], from: 'num' }, [
    (c) => `Orange Money: Votre compte sera bloqué dans les 30 minutes. Confirmez votre code PIN en répondant à ce message.`,
  ]),
  g('mobile_money', 'pay', { sg: ['prize_fee', 'pay_to_personal_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `FELICITATIONS! Vous avez gagné ${c.A(500000, 3000000, 500000)} à la tombola Orange Money. Pour recevoir votre gain, envoyez ${c.A(5000, 25000, 5000)} de frais au ${c.sn}.`,
  ]),
  g('mobile_money', 'call', { src: 'whatsapp', sg: ['prize_fee', 'asks_to_call_number'], from: 'num' }, [
    (c) => `MTN MoMo: Vous êtes le gagnant du tirage au sort de la semaine, un smartphone vous attend! Appelez le ${c.sn} pour réclamer votre lot.`,
  ]),
  g('mobile_money', 'pay', { sg: ['ussd_instruction', 'wrong_transfer'], lvl: 'likely_scam', from: 'num' }, [
    (c) => `Erreur de transfert de ${c.A(20000, 70000, 5000)}. Pour annuler, composez *126*1*${c.ph9()}*${c.num(20000, 70000, 5000)}# maintenant.`,
  ]),
  g('mobile_money', 'pay', { sg: ['ussd_instruction'], lvl: 'likely_scam', from: 'num' }, [
    (c) => `Orange Money: pour récupérer votre bonus de ${c.A(10000, 50000, 5000)}, composez #150*1*1*${c.ph9()}*${c.num(5000, 20000, 5000)}# puis validez.`,
  ]),
  g('mobile_money', 'pay', { sg: ['pay_to_personal_number', 'account_block_threat', 'sender_mismatch'], from: 'num' }, [
    (c) => `MTN MoMo: Votre compte est bloqué. Pour le débloquer, versez ${c.A(3000, 15000, 1000)} de frais d'activation au ${c.sn}.`,
  ]),
  g('mobile_money', 'unclear', { sg: ['link', 'sender_mismatch'], from: 'num' }, [
    (c) => `MTN MoMo: votre compte nécessite une vérification. Cliquez ici: ${c.url('momo-verif.example', '/' + c.code(5))}`,
  ]),
  g('mobile_money', 'call', { u: 'urgent', sg: ['asks_to_call_number', 'time_pressure', 'sender_mismatch'], from: 'num' }, [
    (c) => `Orange Money: Problème sur votre compte. Appelez immédiatement le ${c.sn}, un agent va vous aider.`,
  ]),
  g('mobile_money', 'reply', { src: 'whatsapp', sg: ['asks_pin'], from: 'num' }, [
    (c) => `Bonjour, ici le service MTN MoMo. Nous allons vous rembourser ${c.A(20000, 60000, 5000)}. Dictez-nous le code de confirmation que vous allez recevoir par SMS.`,
  ]),
  g('mobile_money', 'unclear', { u: 'urgent', sg: ['time_pressure'], from: 'Orange Money' }, [
    (c) => `Orange Money: Votre transfert programmé expire aujourd'hui. Confirmez dans l'application avant minuit.`,
  ]),

  /* ===================== telecom (18) ===================== */
  g('telecom', 'pay', { due: 'u', from: 'MTN Cameroon' }, [
    (c) => `MTN: Votre forfait internet ${c.int(2, 30)} Go expire le ${c.D()}. Rechargez ${c.A(1000, 15000, 500)} pour le renouveler.`,
  ]),
  g('telecom', 'nothing', { from: 'Orange Cameroun' }, [
    (c) => `Orange: Votre forfait de ${c.int(1, 20)} Go a été activé avec succès. Valable jusqu'au ${c.D(c.int(5, 31))}. Merci de votre confiance.`,
  ]),
  g('telecom', 'nothing', { from: 'MTN Cameroon' }, [
    (c) => `MTN: Votre recharge de ${c.A(500, 10000, 500)} a bien été reçue. Votre crédit est de ${c.A(200, 15000, 100)}. Merci.`,
  ]),
  g('telecom', 'pay', { due: 's', src: 'letter', from: 'name:CAMTEL' }, [
    (c) => `CAMTEL - Agence de ${c.city()}\nFacture téléphone fixe n° ${c.ref('', 8)}\nMontant: ${c.A(7000, 60000)}\nDate limite de paiement: ${c.D()}. Passé ce délai, des pénalités de retard s'appliqueront.`,
  ]),
  g('telecom', 'reply', { from: 'Orange Cameroun' }, [
    (c) => `Orange: Profitez du bonus de recharge de 100%! Répondez OUI à ce message pour l'activer.`,
  ]),
  g('telecom', 'reply', { due: 'u', from: 'MTN Cameroon' }, [
    (c) => `MTN: Pour confirmer le remplacement de votre carte SIM, répondez par OUI avant le ${c.D()}.`,
  ]),
  g('telecom', 'go_to_place', { due: 's', from: 'Orange Cameroun' }, [
    (c) => `Orange: Pour l'identification de votre ligne, présentez-vous dans une agence Orange avec votre CNI avant le ${c.D()}.`,
  ]),
  g('telecom', 'bring_document', { due: 'u', from: 'name:Nexttel' }, [
    (c) => `Nexttel: Votre ligne n'est pas enregistrée. Apportez une photocopie de votre CNI à l'agence de ${c.city()} avant le ${c.D()}.`,
  ]),
  g('telecom', 'call', { from: 'MTN Cameroon' }, [
    (c) => `MTN: Pour toute information sur votre forfait, appelez le service client au 8000 depuis votre ligne MTN.`,
  ]),
  g('telecom', 'collect', { from: 'Orange Cameroun' }, [
    (c) => `Orange: Votre nouvelle carte SIM est prête. Retirez-la à l'agence de ${c.city()} avec votre CNI.`,
  ]),
  g('telecom', 'nothing', { src: 'whatsapp', from: 'name:Orange Cameroun' }, [
    (c) => `Chers clients, une maintenance du réseau aura lieu cette nuit à ${c.city()}. Le service pourra être perturbé quelques heures. Merci de votre compréhension.`,
  ]),
  g('telecom', 'nothing', { sg: ['ussd_instruction'], from: 'MTN Cameroon' }, [
    (c) => `MTN: Pour consulter votre solde data, composez *155#. Merci d'être client MTN.`,
  ]),
  g('telecom', 'call', { u: 'urgent', sg: ['account_block_threat', 'time_pressure', 'asks_to_call_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `URGENT: Votre carte SIM sera bloquée dans les 24 heures. Appelez le ${c.sn} pour confirmer votre identité.`,
  ]),
  g('telecom', 'pay', { sg: ['prize_fee', 'pay_to_personal_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `MTN: Vous êtes l'heureux gagnant du tirage au sort, vous gagnez ${c.int(20, 100)} Go gratuits. Pour recevoir, envoyez ${c.A(1000, 5000, 500)} au ${c.sn}.`,
  ]),
  g('telecom', 'unclear', { sg: ['link', 'sender_mismatch'], from: 'num' }, [
    (c) => `Orange: Gagnez 10 Go gratuits! Cliquez ici: ${c.url('orange-promo.example', '/g/' + c.code(4))}`,
  ]),
  g('telecom', 'pay', { u: 'urgent', sg: ['time_pressure'], from: 'MTN Cameroon' }, [
    (c) => `MTN: Offre exceptionnelle! Doublez votre recharge aujourd'hui seulement. Rechargez ${c.A(1000, 5000, 500)} tout de suite.`,
  ]),
  g('telecom', 'pay', { sg: ['pay_to_personal_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `Orange: Pour valider votre bonus, transférez ${c.A(1000, 4000, 500)} de crédit au ${c.sn} puis rappelez-nous.`,
  ]),

  g('telecom', 'nothing', { from: 'Orange Cameroun' }, [
    (c) => `Orange: Votre abonnement internet mensuel a été renouvelé automatiquement. Montant débité: ${c.A(2000, 10000, 500)}. Merci de votre fidélité.`,
  ]),

  /* ===================== bank (18) ===================== */
  g('bank', 'nothing', { from: 'Afriland First Bank' }, [
    (c) => `Afriland First Bank: Virement de ${c.A(50000, 900000, 5000)} crédité sur votre compte **${c.digits(4)}. Solde disponible: ${c.A(80000, 1500000, 5000)}.`,
  ]),
  g('bank', 'nothing', { from: 'SGC' }, [
    (c) => `SGC: Retrait DAB de ${c.A(10000, 200000, 5000)} effectué le ${c.D(-c.int(0, 2))} à ${c.city()}. Solde: ${c.A(5000, 800000, 1000)}.`,
  ]),
  g('bank', 'pay', { due: 'u', from: 'UBA' }, [
    (c) => `UBA: Votre échéance de crédit de ${c.A(30000, 250000, 5000)} est due le ${c.D()}. Veuillez approvisionner votre compte.`,
  ]),
  g('bank', 'pay', { due: 'L', src: 'letter', from: 'name:BICEC' }, [
    (c) => `BICEC - Agence de ${c.city()}\nObjet: compte n° ${c.ref('', 10)} en découvert\nVotre compte présente un découvert de ${c.A(20000, 300000, 5000)}. Merci de régulariser avant le ${c.D()} afin d'éviter des frais supplémentaires.`,
  ]),
  g('bank', 'collect', { from: 'Afriland First Bank' }, [
    (c) => `Afriland First Bank: Votre carte bancaire est prête. Retrait à l'agence de ${c.city()}, muni de votre CNI.`,
  ]),
  g('bank', 'bring_document', { due: 's', from: 'SGC' }, [
    (c) => `SGC: Pour finaliser votre dossier de crédit, apportez vos 3 derniers bulletins de salaire avant le ${c.D()}.`,
  ]),
  g('bank', 'go_to_place', { due: 'u', from: 'UBA' }, [
    (c) => `UBA: Rendez-vous avec votre conseiller le ${c.D()} à ${c.time()}, agence de ${c.city()}.`,
  ]),
  g('bank', 'call', { from: 'SGC' }, [
    (c) => `SGC: Pour contester l'opération du ${c.D(-c.int(1, 5))}, appelez le service clientèle au ${c.land()}.`,
  ]),
  g('bank', 'reply', { from: 'Afriland First Bank' }, [
    (c) => `Afriland First Bank: Un paiement de ${c.A(5000, 150000, 1000)} a été demandé sur votre carte. Répondez OUI pour confirmer ou NON pour refuser.`,
  ]),
  g('bank', 'nothing', { from: 'UBA' }, [
    (c) => `UBA: Votre relevé de compte du mois d'octobre est disponible dans votre application mobile.`,
  ]),
  g('bank', 'nothing', { from: 'SGC' }, [
    (c) => `SGC: Opération ${c.ref('', 8)} validée. Ne communiquez jamais votre code PIN ni votre mot de passe, même à un agent de la banque.`,
  ]),
  g('bank', 'nothing', { from: 'name:BICEC' }, [
    (c) => `BICEC: Prélèvement des frais de tenue de compte de ${c.A(500, 3000, 500)} effectué ce jour.`,
  ]),
  g('bank', 'reply', { u: 'urgent', sg: ['account_block_threat', 'asks_pin', 'sender_mismatch'], from: 'num' }, [
    (c) => `Afriland: Votre compte sera bloqué. Envoyez votre code PIN et votre mot de passe en réponse pour le réactiver.`,
  ]),
  g('bank', 'unclear', { src: 'whatsapp', sg: ['link', 'sender_mismatch'], from: 'num' }, [
    (c) => `UBA: Votre carte expire bientôt. Mettez à jour vos informations: ${c.url('uba-secure.example', '/m/' + c.code(4))}`,
  ]),
  g('bank', 'call', { sg: ['asks_to_call_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `SGC: Opération suspecte de ${c.A(50000, 400000, 5000)} détectée sur votre compte. Appelez votre conseiller au ${c.sn}.`,
  ]),
  g('bank', 'pay', { sg: ['pay_to_personal_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `Votre crédit de ${c.A(500000, 2000000, 500000)} est approuvé. Versez ${c.A(10000, 40000, 5000)} de frais de dossier au ${c.sn} pour le décaissement.`,
  ]),
  g('bank', 'go_to_place', { due: 's', sg: ['account_block_threat'], from: 'UBA' }, [
    (c) => `UBA: Compte inactif. Votre compte sera fermé le ${c.D()} si aucune opération n'est effectuée. Passez en agence.`,
  ]),

  g('bank', 'bring_document', { due: 'u', src: 'letter', from: 'name:BICEC' }, [
    (c) => `BICEC - Agence de ${c.city()}\nObjet: mise à jour de votre dossier client\nNous vous prions d'apporter un justificatif de domicile récent et une copie de votre CNI à l'agence avant le ${c.D()}.`,
  ]),

  /* ===================== health (14) ===================== */
  g('health', 'go_to_place', { due: 'u', from: 'name:Hôpital de District d\'Exemple' }, [
    (c) => `Hôpital de District d'Exemple: RDV confirmé le ${c.D()} à ${c.time()}, service ${c.pick(['cardiologie', 'pédiatrie', 'maternité', 'ophtalmologie'])}. Présentez-vous 30 minutes avant. Info: ${c.land()}.`,
  ]),
  g('health', 'collect', { from: 'name:Laboratoire Démo' }, [
    (c) => `Laboratoire Démo: Vos résultats d'analyses (dossier n° ${c.ref('', 6)}) sont prêts. Vous pouvez les retirer au laboratoire de 7h à 17h.`,
  ]),
  g('health', 'take_medicine', { src: 'letter', from: 'unk' }, [
    (c) => `ORDONNANCE\nDr ${c.name()}\nAmoxicilline 500 mg: 1 gélule matin et soir pendant 7 jours, après le repas.\nParacétamol 1 g: 1 comprimé si fièvre, maximum 3 fois par jour.`,
  ]),
  g('health', 'take_medicine', { from: 'name:Pharmacie Exemple' }, [
    (c) => `Pharmacie Exemple: Rappel de traitement. Prenez 1 comprimé de ${c.pick(['Metformine 500 mg', 'Amlodipine 5 mg'])} le matin avec un verre d'eau, chaque jour. Ne l'arrêtez pas sans avis du médecin.`,
  ]),
  g('health', 'take_medicine', { src: 'whatsapp', from: 'name:Dr Paul Fictif' }, [
    (c) => `Bonjour, pour le palu: Coartem 4 comprimés 2 fois par jour pendant 3 jours, avec un repas gras. Buvez beaucoup d'eau. Revenez me voir si la fièvre continue.`,
  ]),
  g('health', 'take_medicine', { from: 'name:Centre de Santé Démo' }, [
    (c) => `Centre de Santé Démo: Sirop pour votre enfant, 5 ml 3 fois par jour avant le repas pendant 5 jours. Posologie à respecter.`,
  ]),
  g('health', 'pay', { due: 'u', from: 'name:Clinique Exemple' }, [
    (c) => `Clinique Exemple: Votre facture n° ${c.ref('', 6)} (consultation et examens) de ${c.A(10000, 150000, 500)} est à régler avant le ${c.D()}.`,
  ]),
  g('health', 'bring_document', { due: 's', from: 'name:Maternité de District d\'Exemple' }, [
    (c) => `Maternité de District d'Exemple: Pour votre consultation prénatale du ${c.D()}, apportez votre carnet de santé et les résultats de l'échographie.`,
  ]),
  g('health', 'call', { from: 'name:Centre de Santé Démo' }, [
    (c) => `Centre de Santé Démo: Pour reprogrammer votre rendez-vous, appelez le ${c.land()} du lundi au vendredi.`,
  ]),
  g('health', 'reply', { due: 'u', from: 'name:Hôpital de District d\'Exemple' }, [
    (c) => `Hôpital de District d'Exemple: Répondez 1 pour confirmer ou 2 pour annuler votre rendez-vous du ${c.D()}.`,
  ]),
  g('health', 'nothing', { from: 'name:Hôpital de District d\'Exemple' }, [
    (c) => `Hôpital de District d'Exemple: Paiement de ${c.A(2000, 50000, 500)} bien reçu à la caisse (reçu n° ${c.ref('', 6)}). Merci.`,
  ]),
  g('health', 'go_to_place', { u: 'urgent', src: 'whatsapp', from: 'num' }, [
    (c) => `Bonjour, ici l'infirmière de garde. Votre mari a été admis aux urgences de l'hôpital ce soir. Venez dès que possible au service des urgences avec sa carte d'identité.`,
  ]),
  g('health', 'go_to_place', { due: 's', from: 'name:Centre de Santé Démo' }, [
    (c) => `Centre de Santé Démo: Rappel de vaccin pour votre enfant. Présentez-vous au centre le ${c.D()} avec le carnet de vaccination.`,
  ]),
  g('health', 'collect', { sg: ['link'], from: 'name:Laboratoire Démo' }, [
    (c) => `Laboratoire Démo: Vos résultats sont disponibles sur www.labo-exemple.cm avec le numéro ${c.ref('', 6)}.`,
  ]),

  /* ===================== school (13) ===================== */
  g('school', 'pay', { due: 's', from: 'name:Lycée Bilingue de Démo' }, [
    (c) => `Lycée Bilingue de Démo: 2e tranche des frais de scolarité, ${c.A(25000, 120000, 5000)}, à payer avant le ${c.D()}. Merci aux parents.`,
  ]),
  g('school', 'pay', { due: 'u', src: 'letter', from: 'name:Collège Modèle' }, [
    (c) => `COLLEGE MODELE - Direction\nDernier rappel aux parents de l'élève ${c.name()}: les frais de scolarité de ${c.A(30000, 90000, 5000)} doivent être réglés avant le ${c.D()}, faute de quoi l'élève ne sera plus admis en classe.`,
  ]),
  g('school', 'go_to_place', { due: 'u', from: 'name:Ecole Publique de Démo' }, [
    (c) => `Ecole Publique de Démo: Réunion des parents d'élèves le ${c.DW()} à ${c.time()}. Présence obligatoire.`,
  ]),
  g('school', 'collect', { from: 'name:Lycée Bilingue de Démo' }, [
    (c) => `Lycée Bilingue de Démo: Les bulletins du 1er trimestre sont disponibles au secrétariat. Les parents peuvent venir les chercher.`,
  ]),
  g('school', 'bring_document', { due: 's', from: 'name:Lycée Bilingue de Démo' }, [
    (c) => `Lycée Bilingue de Démo: Inscriptions 2026-2027. Apportez l'acte de naissance, 4 photos, le bulletin de l'année précédente avant le ${c.D()}.`,
  ]),
  g('school', 'call', { from: 'name:Collège Modèle' }, [
    (c) => `Collège Modèle: Pour toute information sur l'examen blanc du BEPC, appelez le secrétariat au ${c.land()}.`,
  ]),
  g('school', 'reply', { due: 'u', from: 'name:Ecole Publique de Démo' }, [
    (c) => `Ecole Publique de Démo: Parents, répondez OUI pour autoriser la sortie pédagogique de votre enfant avant le ${c.D()}.`,
  ]),
  g('school', 'nothing', { from: 'name:Ecole Publique de Démo' }, [
    (c) => `Ecole Publique de Démo: Nous informons les parents que l'école sera fermée le ${c.D(c.int(3, 20))} (jour férié). Reprise des cours le lendemain.`,
  ]),
  g('school', 'nothing', { from: 'name:Lycée Bilingue de Démo' }, [
    (c) => `Lycée Bilingue de Démo: Résultats du 1er trimestre: l'élève ${c.fn()} est admis(e) en classe supérieure. Félicitations. Paiement de la scolarité bien reçu.`,
  ]),
  g('school', 'go_to_place', { due: 'u', src: 'letter', from: 'name:Collège Modèle' }, [
    (c) => `COLLEGE MODELE\nConvocation: les parents de l'élève ${c.name()} sont convoqués devant le conseil de discipline le ${c.D()} à ${c.time()} au bureau du censeur.`,
  ]),
  g('school', 'bring_document', { src: 'whatsapp', due: 'u', from: 'name:Maître Esther Modèle' }, [
    (c) => `Chers parents, l'examen blanc de maths a lieu le ${c.D()}. Les enfants doivent apporter leur calculatrice, leur règle et la convocation. Merci.`,
  ]),
  g('school', 'collect', { sg: ['link'], from: 'name:Office du Baccalauréat Démo' }, [
    (c) => `Résultats du Baccalauréat disponibles sur www.examens-exemple.cm. Consultez votre numéro de table ${c.ref('', 5)}.`,
  ]),
  g('school', 'pay', { sg: ['prize_fee', 'pay_to_personal_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `Bourse d'excellence 2026: vous avez gagné une bourse de ${c.A(300000, 1000000, 100000)}. Envoyez ${c.A(10000, 25000, 5000)} de frais de dossier au ${c.sn} pour la recevoir.`,
  ]),

  /* ===================== administrative (14) ===================== */
  g('administrative', 'collect', { from: 'name:DGSN' }, [
    (c) => `DGSN: Votre carte nationale d'identité n° ${c.ref('', 8)} est prête. Retrait au commissariat de ${c.city()} avec le récépissé.`,
  ]),
  g('administrative', 'collect', { from: 'name:Mairie' }, [
    (c) => `Mairie de ${c.city()}: Votre acte de naissance est disponible. Vous pouvez venir le chercher au service d'état civil.`,
  ]),
  g('administrative', 'go_to_place', { due: 'u', src: 'letter', from: 'name:Mairie' }, [
    (c) => `MAIRIE DE ${c.city().toUpperCase()}\nConvocation: M./Mme ${c.name()} est convoqué(e) le ${c.D()} à ${c.time()} au service d'état civil pour la célébration du mariage. Se munir des pièces d'identité.`,
  ]),
  g('administrative', 'bring_document', { due: 's', from: 'name:Préfecture' }, [
    (c) => `Préfecture: Dossier passeport n° ${c.ref('', 6)}. Pièces à fournir: acte de naissance, CNI, 2 photos, avant le ${c.D()}.`,
  ]),
  g('administrative', 'pay', { due: 's', src: 'letter', from: 'name:Centre des Impôts' }, [
    (c) => `CENTRE DES IMPOTS DE ${c.city().toUpperCase()}\nAvis: la patente de l'exercice 2026 d'un montant de ${c.A(30000, 250000, 5000)} est à payer avant le ${c.D()}. Majoration de 10% après cette date.`,
  ]),
  g('administrative', 'call', { from: 'name:Préfecture' }, [
    (c) => `Préfecture: Pour le suivi de votre dossier n° ${c.ref('', 6)}, appelez le ${c.land()} aux heures de bureau.`,
  ]),
  g('administrative', 'reply', { from: 'name:Mairie' }, [
    (c) => `Mairie de ${c.city()}: Pour le recensement des ménages, répondez à ce SMS en indiquant votre quartier et le nombre de personnes.`,
  ]),
  g('administrative', 'nothing', { from: 'name:DGSN' }, [
    (c) => `DGSN: Votre demande de CNI n° ${c.ref('', 8)} a bien été enregistrée. Aucune action n'est requise pour le moment.`,
  ]),
  g('administrative', 'bring_document', { due: 'u', src: 'letter', from: 'name:Sous-préfecture' }, [
    (c) => `SOUS-PREFECTURE DE ${c.city().toUpperCase()}\nVous êtes prié(e) de déposer au plus tard le ${c.D()} les pièces suivantes: copie certifiée de l'acte de naissance, certificat de résidence, 3 photos.`,
  ]),
  g('administrative', 'pay', { due: 'L', src: 'letter', from: 'name:Commune' }, [
    (c) => `COMMUNE DE ${c.city().toUpperCase()}\nRappel: la taxe communale de ${c.A(10000, 60000, 1000)} devait être réglée avant le ${c.D()}. Veuillez régulariser auprès du receveur municipal.`,
  ]),
  g('administrative', 'pay', { u: 'urgent', sg: ['pay_to_personal_number', 'sender_mismatch', 'time_pressure'], from: 'num' }, [
    (c) => `DGSN: Votre CNI est bloquée. Envoyez ${c.A(10000, 30000, 5000)} au ${c.sn} (frais de déblocage) immédiatement pour la récupérer.`,
  ]),
  g('administrative', 'unclear', { sg: ['link'], from: 'name:Mairie' }, [
    (c) => `Mairie de ${c.city()}: Les résultats du concours sont publiés: ${c.url('concours-exemple.cm', '/r/' + c.code(4))}`,
  ]),
  g('administrative', 'go_to_place', { due: 's', from: 'name:ELECAM' }, [
    (c) => `ELECAM: Mise à jour du fichier électoral. Présentez-vous au bureau de ${c.city()} avant le ${c.D()} avec votre CNI.`,
  ]),
  g('administrative', 'collect', { src: 'whatsapp', from: 'name:Maître Gisèle Test' }, [
    (c) => `Bonjour, votre casier judiciaire est prêt. Vous pouvez le retirer au greffe du tribunal de ${c.city()}, avec la quittance de ${c.A(500, 2000, 500)}.`,
  ]),

  /* ===================== legal (11) ===================== */
  g('legal', 'go_to_place', { due: 's', src: 'letter', from: 'name:Tribunal' }, [
    (c) => `TRIBUNAL DE PREMIERE INSTANCE DE ${c.city().toUpperCase()}\nCONVOCATION\nVous êtes convoqué(e) à l'audience du ${c.D()} à ${c.time()}, salle ${c.int(1, 6)}, affaire n° ${c.ref('RG-', 5)}.`,
  ]),
  g('legal', 'go_to_place', { due: 'u', from: 'name:Commissariat' }, [
    (c) => `Commissariat de ${c.city()}: Vous êtes convoqué le ${c.D()} à ${c.time()} pour audition. Munissez-vous de votre CNI.`,
  ]),
  g('legal', 'bring_document', { due: 's', from: 'name:Cabinet Me Fictif' }, [
    (c) => `Cabinet Me Fictif: Merci d'apporter les pièces du dossier (titre foncier, plan, reçus) à notre cabinet avant le ${c.D()}.`,
  ]),
  g('legal', 'pay', { u: 'urgent', src: 'letter', from: 'name:Huissier de justice' }, [
    (c) => `ETUDE DE MAITRE ${c.name().toUpperCase()}, HUISSIER DE JUSTICE\nMISE EN DEMEURE de payer la somme de ${c.A(100000, 800000, 5000)} sous huitaine, faute de quoi des poursuites seront engagées.`,
  ]),
  g('legal', 'call', { from: 'name:Greffe' }, [
    (c) => `Greffe du tribunal de ${c.city()}: Pour le dossier n° ${c.ref('RG-', 5)}, appelez le greffier au ${c.land()}.`,
  ]),
  g('legal', 'nothing', { from: 'name:Greffe' }, [
    (c) => `Greffe du tribunal de ${c.city()}: Le jugement du dossier n° ${c.ref('RG-', 5)} a été rendu. Votre dossier est classé.`,
  ]),
  g('legal', 'collect', { from: 'name:Greffe' }, [
    (c) => `Greffe du tribunal de ${c.city()}: La copie de votre jugement est disponible. Retrait au greffe, avec votre CNI.`,
  ]),
  g('legal', 'reply', { due: 'u', from: 'name:Cabinet Me Fictif' }, [
    (c) => `Cabinet Me Fictif: Confirmez par SMS votre présence à l'audience du ${c.D()}. Merci.`,
  ]),
  g('legal', 'pay', { u: 'urgent', sg: ['pay_to_personal_number', 'sender_mismatch', 'time_pressure'], from: 'num' }, [
    (c) => `Gendarmerie: Une plainte a été déposée contre vous. Pour éviter l'arrestation, envoyez ${c.A(20000, 80000, 5000)} au ${c.sn} immédiatement.`,
  ]),
  g('legal', 'call', { u: 'urgent', sg: ['asks_to_call_number', 'time_pressure', 'sender_mismatch'], from: 'num' }, [
    (c) => `TRIBUNAL: Mandat d'arrêt émis contre vous. Appelez immédiatement le ${c.sn}.`,
  ]),
  g('legal', 'go_to_place', { due: 's', from: 'name:Notaire Me Test' }, [
    (c) => `Etude notariale Me Test: Signature de l'acte de vente le ${c.D()} à ${c.time()}. Prière de vous présenter avec votre pièce d'identité.`,
  ]),

  /* ===================== other (6) ===================== */
  g('other', 'unclear', { sg: ['link'], from: 'num' , lvl: 'caution' }, [
    (c) => `Votre colis est en attente. Suivez-le ici: bit.ly/${c.pick(['3AbCdEf', '4XyZkLm', '3QrStUv'])}`,
  ]),
  g('other', 'unclear', { from: 'unk' }, [
    (c) => `Bonjour. Rappel concernant votre dossier en cours. Merci.`,
  ]),
  g('other', 'reply', { src: 'whatsapp', from: 'name:Tante Ruth Fictif' }, [
    (c) => `Salut, tu viens toujours à la fête de samedi? Réponds-moi s'il te plaît pour que je commande la nourriture.`,
  ]),
  g('other', 'call', { src: 'whatsapp', from: 'num' }, [
    (c) => `Bonjour, j'ai trouvé un portefeuille avec votre carte d'identité près du marché. Rappelez-moi au ${c.sn}.`,
  ]),
  g('other', 'nothing', { from: 'name:Société Démo' }, [
    (c) => `La société Démo vous souhaite de joyeuses fêtes de fin d'année et vous remercie de votre fidélité.`,
  ]),
  g('other', 'pay', { sg: ['pay_to_personal_number', 'sender_mismatch'], from: 'num' }, [
    (c) => `Offre d'emploi: gagnez ${c.A(150000, 300000, 50000)} par semaine à domicile. Envoyez ${c.A(5000, 15000, 5000)} pour l'inscription au ${c.sn}.`,
  ]),
];

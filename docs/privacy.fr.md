# Politique de confidentialité de SabiTori

Version 1.0.0. Dernière mise à jour : [DATE].
English: [privacy.md](privacy.md)

## En bref (Facile à lire)

1. SabiTori lit à voix haute les documents officiels pour vous.
2. Vos messages et vos photos restent sur votre téléphone. Nous ne les recevons jamais.
3. Nous ne vendons pas vos données. Nous n'affichons aucune publicité. Nous ne vous suivons pas.
4. Deux fonctions supplémentaires sont désactivées. Vous pouvez les activer. Elles n'envoient jamais vos messages.
5. Vous pouvez les désactiver à tout moment dans les Paramètres.

## 1. Qui nous sommes

SabiTori est publié par NotaNovice Group, [LEGAL NAME], [ADDRESS], Allemagne.
Questions sur la vie privée : [CONTACT EMAIL].
Délégué à la protection des données : [TO CONFIRM : s'il est obligatoire ou désigné. Si oui, nom et contact].

Pour les données décrites à la section 5, nous sommes responsables du traitement au sens du Règlement
général sur la protection des données (RGPD). Nous ne sommes pas responsables des messages et des
photos présents sur votre téléphone, car nous ne les recevons jamais.

## 2. Ce que fait SabiTori

Vous photographiez un document, ou vous partagez son texte avec SabiTori. L'application l'explique
ensuite à voix haute, dans votre langue. Elle repère les dates, les montants, les numéros de téléphone
et les codes. Elle vous prévient lorsqu'un message pourrait être une arnaque. Elle ne dit jamais qu'un
message est sûr.

SabiTori fonctionne hors ligne. Le français et l'anglais sont disponibles aujourd'hui. Le pidgin
camerounais, le duala, l'ewondo, le fulfulde de l'Adamaoua, le lamnso', le limbum et le pinyin sont en
cours d'enregistrement avec des locuteurs natifs. Ils seront ajoutés par mise à jour, dès qu'ils seront prêts.

## 3. Ce qui reste sur votre téléphone

Tout ce qui figure dans cette section est traité uniquement sur votre téléphone. Nous ne le recevons pas.

- Les photos que vous prenez, et le texte que vous partagez avec l'application.
- Le texte lu sur une photo. L'application lit les photos sur le téléphone, avec des données de reconnaissance de caractères hors ligne intégrées à l'application.
- L'explication (la fiche) et la voix.
- Votre historique de fiches. Il est conservé pendant la durée décrite à la section 8.
- Vos réglages, comme la langue et la vitesse de lecture.
- Rappels d'échéance. Si vous touchez « Me rappeler » sur une fiche avec une échéance, l'application programme jusqu'à deux notifications sur votre téléphone : à 9 h la veille de l'échéance, et à 8 h le jour même. Elles affichent l'expéditeur, l'action et la date. Elles ne sont envoyées nulle part. Dans la version web de l'application, « Me rappeler » enregistre à la place un fichier de calendrier (.ics) à l'endroit de votre choix. Ce fichier contient l'échéance et une copie du texte du message : gardez-le aussi privé que le document lui-même.
- Textes ou photos que vous partagez avec SabiTori depuis une autre application. SabiTori garde une copie privée seulement le temps de les lire, puis la supprime. [TO CONFIRM : délai exact de suppression sur l'application compilée.]
- Les packs de langues, alertes arnaque et numéros officiels téléchargés, si vous avez activé les mises à jour.
- [TO CONFIRM : si la photo est conservée sur le téléphone après la lecture de son texte.]

## 4. Ce que nous ne collectons jamais

Nous ne collectons ni ne recevons :

- vos messages, le texte de vos photos, ni vos photos ;
- votre nom, votre compte ou votre adresse e-mail (SabiTori n'a pas de comptes) ;
- votre numéro de téléphone, votre position, vos contacts ou votre agenda ;
- les informations de paiement, mobile money, bancaires ou autres ;
- les identifiants publicitaires, les statistiques d'analyse ou d'usage ;
- la marque ou le modèle de votre téléphone.

SabiTori n'utilise ni cookies de suivi ni identifiants publicitaires.

## 5. Les deux fonctions facultatives

Les deux fonctions sont désactivées par défaut. Une version de l'application ne les contient que si elle
a été préparée avec une adresse de mises à jour ou une adresse de rapports d'erreur. Vous activez chacune
d'elles dans les Paramètres, après une courte explication. Lorsqu'une fonction est désactivée, l'application
n'envoie rien pour elle.

### 5.1 Mises à jour (« Recevoir de nouvelles langues et alertes arnaque »)

**Ce que cela fait.** Elle télécharge des fichiers signés : packs de langues, alertes arnaque et numéros
officiels. Elle vérifie au plus une fois par jour, au démarrage de l'application, en arrière-plan. Elle ne
vérifie pas lorsque votre téléphone indique qu'il utilise les données mobiles. Vous pouvez aussi appuyer sur
« Vérifier maintenant » dans les Paramètres.

**Ce qui est envoyé.** Une requête web ordinaire pour chaque fichier listé dans l'index des mises à jour. La
requête ne contient ni message, ni identifiant, ni cookie, ni référent. Comme toute requête sur internet,
le serveur peut voir votre adresse IP et l'en-tête User-Agent (le nom du moteur web de votre téléphone).

**À qui.** Au serveur des mises à jour : [UPDATE HOST : TO CONFIRM : nom, pays et exploitant du serveur qui
héberge les mises à jour]. Ses journaux d'accès, s'il y en a : [TO CONFIRM : durée de conservation].

**Vérifications.** Chaque mise à jour est contrôlée par une signature numérique et une somme de contrôle avant
d'être utilisée. Une mise à jour échouée ou incomplète ne modifie pas ce que l'application utilise.

**Désactivation.** Désactiver la fonction arrête les vérifications. Les fichiers téléchargés restent utilisés
jusqu'à ce que vous choisissiez « Supprimer les mises à jour téléchargées » dans les Paramètres. Cette action
les supprime. L'application utilise alors les langues et alertes intégrées.

### 5.2 Rapports d'erreur (« Envoyer les rapports d'erreur »)

**Ce que cela fait.** Lorsque l'application rencontre une erreur inattendue ou plante, elle peut envoyer un
rapport, afin que nous puissions corriger le problème.

**Ce qui est envoyé.**

- le type d'erreur et un court message d'erreur, après suppression des données personnelles (voir ci-dessous) ;
- la trace de la pile d'appels : noms des fonctions et des fichiers de l'application, numéros de ligne ;
- la version de l'application et la version de chaque pack de langue ;
- le nom et la version du système d'exploitation (par exemple, Android 14) ;
- l'architecture du processeur (par exemple, arm64) ;
- une étiquette de version (par exemple, production ou beta) ;
- un identifiant d'événement et l'heure de l'erreur.

**Ce qui n'est jamais envoyé.** Les messages, les photos, le texte affiché à l'écran, les nombres de 3 chiffres
ou plus, les montants, les dates, les numéros de téléphone, les adresses e-mail, les liens, les codes USSD, la
marque ou le modèle de votre téléphone, les identifiants d'utilisateur, les détails des requêtes, les
enregistrements d'écran, les sessions, les traces de performance, ni l'historique de navigation dans l'application.

**Suppression des données personnelles.** L'application supprime les données personnelles avant qu'un rapport
ne quitte le téléphone. Elle retire les nombres, montants, dates, numéros de téléphone, adresses e-mail, liens
et codes. Elle retire aussi tout texte correspondant à un message que vous avez eu à l'écran récemment. Cette
mémoire n'existe que dans la mémoire de travail du téléphone, pas sur le disque. Ce traitement est soigneux et
automatique, mais aucun procédé automatique n'est parfait. Si vous voyez une donnée personnelle dans un rapport,
contactez-nous et nous la supprimerons.

**À qui.** Sentry, Inc. (États-Unis), qui traite les rapports pour nous. [TO CONFIRM : la région de données de
notre projet Sentry (UE ou États-Unis). Si États-Unis, la base du transfert, par exemple le Cadre UE-États-Unis
de protection des données ou les clauses contractuelles types.] Les serveurs de Sentry reçoivent la requête comme
toute requête sur internet ; ils voient donc votre adresse IP et votre en-tête User-Agent. [TO CONFIRM : si Sentry
conserve ou supprime les adresses IP pour ce projet.]

**Désactivation.** Désactiver la fonction arrête immédiatement l'envoi des rapports. Plus rien n'est envoyé.

## 6. Autorisations

L'application demande ces autorisations Android. Chacune ne sert qu'au but indiqué, et n'est demandée que lorsque vous utilisez la fonction concernée.

- **Internet.** Utilisée uniquement pour les deux fonctions facultatives de la section 5.
- **Appareil photo.** Demandée uniquement lorsque vous touchez le bouton appareil photo. La photo est prise pour SabiTori et lue sur votre téléphone. Choisir une photo dans votre galerie utilise le sélecteur de photos du téléphone, qui ne demande aucune autorisation à SabiTori.
- **Notifications.** Demandées uniquement lorsque vous touchez « Me rappeler » sur une fiche avec une échéance. Utilisées uniquement pour les rappels de la section 3.

SabiTori ne demande ni votre position, ni vos contacts, ni votre microphone.

[TO CONFIRM : ces autorisations viennent du code actuel de l'application, qui n'est pas encore dans une version validée. Le manifeste validé ne déclare que l'accès à internet. Vérifiez le manifeste fusionné de l'application compilée avant publication, et corrigez cette section s'il diffère.]

## 7. Base juridique (RGPD)

- **Fonctions facultatives (section 5) :** consentement, article 6, paragraphe 1, point a) du RGPD. Vous donnez
  votre consentement en activant une fonction. Vous pouvez le retirer à tout moment en la désactivant, sans avoir
  à donner de motif. Le retrait ne remet pas en cause ce qui était licite auparavant.
- **Rapports d'erreur :** Sentry les traite pour notre compte, en qualité de sous-traitant, au sens de l'article 28 du RGPD.
  [TO CONFIRM : accord de traitement des données signé avec Sentry.]
- **Informations de santé :** un document d'hôpital peut contenir des informations de santé. Il s'agit d'une catégorie
  particulière au sens de l'article 9 du RGPD. Nous ne les recevons jamais, donc nous ne les traitons pas. Elles restent
  sur votre téléphone, sous votre contrôle.
- **Vos messages :** nous ne les détenons pas. Nous ne pouvons donc pas les retrouver, les modifier ni les supprimer pour
  vous. Vous pouvez les supprimer sur votre téléphone.

## 8. Durée de conservation

Sur votre téléphone :

- **Historique des fiches :** 30 jours par défaut. Dans les Paramètres, vous pouvez choisir 7 jours, ou ne rien garder.
- **Mises à jour téléchargées :** jusqu'à ce que vous les supprimiez dans les Paramètres, ou que vous désinstalliez l'application.
- **La désinstallation** de l'application supprime ses données du téléphone. [TO CONFIRM : par un test sur appareil.]

De notre côté :

- Nous ne conservons aucun message ni aucune photo, car nous ne les recevons jamais.
- **Rapports d'erreur :** Sentry les conserve pendant [TO CONFIRM : durée définie dans le projet]. Nous les conservons
  pendant [TO CONFIRM : durée], puis nous les supprimons.
- **Journaux du serveur de mises à jour :** [TO CONFIRM : durée, ou « aucun journal conservé par nous »].

## 9. Qui reçoit les données

- Nous ne vendons pas de données.
- Nous ne partageons pas de données à des fins publicitaires. Il n'y a ni publicité ni outil d'analyse.
- Sous-traitants, uniquement lorsque la fonction est active : Sentry, Inc. (rapports d'erreur, section 5.2) et
  l'exploitant du serveur de mises à jour (requêtes de mise à jour, section 5.1).
- Google Play gère le téléchargement et les mises à jour de l'application elle-même, selon la politique de
  confidentialité de Google.
- Nous ne transmettons des données à une autorité que lorsque la loi l'exige. Nous ne détenons aucune donnée au-delà
  de ce que décrit la section 5.

## 10. Sécurité

- Les connexions sont uniquement en HTTPS. L'application refuse les connexions web non chiffrées.
- Les messages et les photos ne quittent jamais le téléphone.
- Les mises à jour sont vérifiées par une signature numérique et une somme de contrôle avant utilisation.
- Les rapports d'erreur sont nettoyés avant de quitter le téléphone.
- Il n'y a pas de comptes, donc pas de mots de passe à voler.
- Gardez le verrouillage de votre écran et les mises à jour du système activés.

## 11. Enfants

SabiTori est destiné à toute personne qui a besoin d'aide pour lire des documents officiels, y compris les jeunes.
Par défaut, nous ne collectons de données personnelles auprès de personne, y compris les enfants. Si un parent ou un
tuteur pense que les données d'un enfant ont été envoyées dans un rapport d'erreur, qu'il nous contacte : nous les
supprimerons. [TO CONFIRM : âge minimum, et position de l'application au regard de la politique Google Play pour les familles.]

## 12. Vos droits

En vertu du RGPD, vous avez le droit de :

- accéder aux données personnelles que nous détenons à votre sujet ;
- les faire rectifier ou supprimer ;
- limiter ou vous opposer à leur traitement ;
- recevoir vos données dans un format portable ;
- retirer votre consentement à tout moment (section 7) ;
- introduire une réclamation auprès d'une autorité de protection des données. Pour l'Allemagne, il s'agit de l'autorité
  du Land où l'éditeur a son siège : [TO CONFIRM : nom et contact].

Pour exercer ces droits, écrivez à [CONTACT EMAIL]. Si vous avez l'identifiant d'événement d'un rapport, merci de
l'indiquer. Nous pourrons avoir besoin de vérifier votre identité avant d'agir.

## 13. Utilisateurs au Cameroun

[TO CONFIRM : loi camerounaise sur la protection des données personnelles applicable aux utilisateurs au Cameroun, les
droits qu'elle accorde et l'autorité à contacter. Cette section doit être vérifiée au regard de cette loi avant publication.]

## 14. Modifications

Nous mettons à jour cette page lorsque le comportement de l'application change. La version et la date en haut indiquent la
dernière modification. Si une modification ajoute une collecte de données, nous vous demanderons de nouveau votre consentement,
dans l'application, avant qu'elle ne prenne effet. [TO CONFIRM : comment nous annonçons les changements hors de l'application,
par exemple dans la fiche du magasin.]

## 15. Contact

[LEGAL NAME]
[ADDRESS]
[CONTACT EMAIL]

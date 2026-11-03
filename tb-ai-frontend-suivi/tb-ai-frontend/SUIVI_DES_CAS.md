# Suivi des cas, alertes, rappels patient et démo publique

## Ce que fait l'outil
- **Suivi des cas** (menu « Suivi des cas ») : chaque analyse avec un score ≥ 50 % ouvre automatiquement un cas.
  Parcours : Cas ouvert → Test de confirmation demandé → Résultat enregistré → Traitement ou orientation → Clôturé.
  Chaque cas a un responsable, une échéance (7 jours par défaut, remise à zéro à chaque étape) et un journal horodaté.
- **Clôture documentée** : un cas ne se ferme jamais tout seul. Issues : traité (note de traitement obligatoire),
  TB exclue (seulement après un test négatif), ou perdu de vue (motif obligatoire).
  Pour classer « injoignable », il faut avoir consigné au moins **2 tentatives de contact sans réponse**.
- **Alertes automatiques de retard** : un panneau d'alertes en haut de « Suivi des cas », et une **tâche quotidienne**
  (route `/api/cron/alerts`, planifiée dans `vercel.json`) qui journalise chaque nouvelle alerte une seule fois par échéance
  et envoie un **e-mail récapitulatif** à l'équipe si l'envoi est configuré. Au-delà de 7 jours de retard, l'alerte est
  marquée « à remonter au superviseur ».
- **Rappels patient documentés** : le cas propose un **message neutre** (sans mention de la tuberculose), FR ou EN, à copier
  et envoyer par les moyens de l'équipe. L'équipe consigne ensuite la tentative (SMS, WhatsApp, appel, visite à domicile ;
  patient joint ou pas de réponse). **L'outil n'envoie aucun message au patient et ne stocke aucun numéro** : c'est un choix
  de protection des données. Un envoi automatique par SMS demanderait un consentement, un stockage chiffré des numéros
  et une validation éthique : à étudier avec le partenaire de pilote.
- **Indicateurs** : cas ouverts, en retard, sans responsable, délai médian jusqu'au résultat, clôture sous 30 jours,
  motifs de perte de vue, rappels consignés et cas en retard sans rappel. Export CSV.
- **Protection des données** : aucun champ pour un nom ou une adresse ; les notes contenant un numéro de téléphone ou un
  e-mail sont refusées.

## Projet réel (avec double authentification)
1. Ajouter **Upstash Redis** (Vercel → Storage). Sans lui, les cas ne sont pas conservés de façon fiable.
2. Pour les alertes automatiques, ajouter la variable `CRON_SECRET` (une longue valeur aléatoire). Redéployer.
3. Pour recevoir l'e-mail quotidien (facultatif) : `RESEND_API_KEY`, `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO`.
   Sans ces trois variables, les alertes restent visibles dans l'application et dans le journal des cas.
   Remarque : les cas sont suivis par identifiant anonymisé ; l'e-mail ne contient aucune donnée de patient.

## Démo publique, sans identifiant (deuxième projet Vercel, même dépôt GitHub)
1. Vercel → Add New → Project → même dépôt GitHub.
2. Root Directory : `tb-ai-frontend`.
3. Environment Variables : ajouter UNIQUEMENT `DEMO_MODE` = `1`. Ne PAS ajouter AUTH_PASSWORD_HASH / AUTH_TOTP_SECRET /
   AUTH_SESSION_SECRET, ni CRON_SECRET, ni KV_*.
4. Deploy. L'adresse obtenue est la démo à donner aux évaluateurs.
5. Ouvrez l'adresse vous-même : vérifiez que la page « Analyse » s'affiche avec le bandeau « MODE DÉMONSTRATION ».

Dans la démo : analyse de radio **en direct** dans le navigateur (la radio n'est envoyée nulle part), identifiant patient
généré automatiquement, cas ouvert automatiquement si score ≥ 50 %, 44 cas simulés avec retards, alertes et rappels.
Les données restent dans le navigateur du visiteur. Bouton « Réinitialiser la démo ».

Garde-fou : si AUTH_PASSWORD_HASH existe dans un projet, DEMO_MODE est ignoré : le projet réel ne peut pas devenir public
par erreur.

### Radios d'exemple pour les évaluateurs
Voir `public/samples/LISEZ-MOI.txt` : déposez 2 ou 3 radios anonymes et libres de droits dans `public/samples/`, listez-les dans
`manifest.json`. Les boutons « exemple » apparaissent alors sur la page Analyse de la démo.

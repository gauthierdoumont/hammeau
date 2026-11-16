# Journal des versions — Hameau

## 1.7.1 — 2026-11-16 · Corrections (vérification 3)
- ⚔️ Un examen passé reste dans l'agenda gardé : son boss et sa récompense sont encore là quelques jours après,
  et ses dégâts ne passent plus à l'examen suivant.
- 🎯 « Est-ce un examen ? » : touche aussi un événement de Réglages → Agenda, ou le titre d'un boss.
  « Pas un examen » retire le boss ; « C'est un examen » en crée un.
- 🌙 Un cours à 1 h 30 du matin compte pour la veille (la journée de Hameau finit à 4 h), comme une tâche.
- ⚡ Écran plus rapide avec un agenda relié (jour de chaque événement calculé une fois ; aperçu de l'agenda construit quand on l'ouvre).
- 🎲 Restaurer ou importer une copie de la veille ne relance plus la surprise du jour.
- 📅 « Retirer » ou « Changer d'adresse » pendant un téléchargement : l'ancien agenda n'est jamais relié ni enregistré.
- 📊 Bilan : une semaine faite de petits pas affiche « +N XP cette semaine : chaque pas compte ✨ ».
- 📅 Une répétition très fréquente et ancienne (ex. toutes les heures depuis 2015) s'affiche bien, et vite.
- 🧰 Coulisses : réglages du boss et du bilan dans `config.js` (mêmes valeurs) ; graphique du bilan mieux lu par les lecteurs d'écran.

## 1.7.0 — 2026-11-16 · Import de l'appli Muscu
- 💪 Réglages → Mes données → **« Importer mes séances de muscu »** : choisis le fichier exporté par ton appli Muscu.
  Chaque séance des 14 derniers jours devient une tâche faite : XP + 🪨 Pierre (famille Corps), selon sa durée (ou ses km pour la course).
- Une séance n'est jamais comptée deux fois ; aperçu avant (« 4 séances à compter : +135 XP »), copie de sécurité, « Annuler » 5 s.
- Rien d'autre n'est copié de l'appli Muscu (ni poids, ni taille, ni profil).
- 🧪 Tests navigateur plus stables (hasard fixé dans la section qui simule l'appli installée).

## 1.6.2 — 2026-11-16 · Pause encore plus douce
- ⏸️ Une échéance importante qui tombe **pendant une pause** ne provoque plus jamais d'incendie, même après la pause.

## 1.6.1 — 2026-11-16 · Corrections (vérification 2)
- 🔔 Rappels « à quelques minutes près » : Android ne montre plus l'écran « Alarmes et rappels » à chaque programmation.
- 🔒 Le texte envoyé « pour analyse » (données illisibles) ne contient jamais l'adresse secrète de ton agenda.
- 📅 Agenda retiré ou changé pendant un téléchargement : l'ancien agenda n'est plus enregistré.
- ↩️ « Annuler » marche aussi quand l'agenda s'est actualisé tout seul entre-temps (il reste à jour).
- 🔥 Restaurer ou importer une vieille copie ne rallume pas un incendie déjà passé sur le téléphone.
- 🌙 Le rappel du soir ne promet « ta série passe à N jours » que si c'est encore possible ce jour-là ; sinon, un mot positif.
- 🕓 Heures des rappels : de 04:00 à 23:59 (avant 4 h, on est encore la veille dans Hameau).
- 📅 Agenda : un cours qui se répète depuis longtemps (ex. depuis 2010) s'affiche bien.
- 🎯 « Cours interrompu » n'est plus pris pour un examen ; « Interro » et « interrogation » oui.
- 📌 Une journée entière sur plusieurs jours (congé, stage…) s'affiche chaque jour.
- 📅 Un cours déplacé dont l'original n'est pas dans le fichier s'affiche quand même.
- 🧰 Coulisses : numéros des rappels du soir à partir de 100 ; rappels reprogrammés l'un après l'autre ;
  colonnes de la simulation tirées de `config.js`.

## 1.6.0 — 2026-11-16 · Bilan de la semaine
- 📊 **Bilan de la semaine** (Perso → « Bilan de la semaine ») : XP gagnée, tâches finies, jours actifs,
  XP par jour (touche un jour pour le détail) et répartition par famille. « Semaine dernière » ou « Cette semaine ».
- Le lundi, petite carte « Ton bilan de la semaine est prêt » sur Aujourd'hui (✕ = plus tard).
- Toujours positif : « +20 % d'XP », « 5 jours actifs sur 7 », ou « Semaine au calme » — jamais de reproche.
- Graphiques dessinés par l'appli (hors ligne), une seule couleur et chaque barre étiquetée ; « Voir en tableau » pour les chiffres.

## 1.5.0 — 2026-11-16 · Examens = boss
- ⚔️ **Examens à venir** sur Aujourd'hui : chaque examen de ton agenda devient un boss 14 jours avant (compte à rebours, 200 PV).
- 📚 Chaque révision lui fait des dégâts (son XP) : « ⚔️ 30 dégâts à « Interrogation Consolidation » ! ». Annuler rend les PV.
- 🏆 Le jour J, dès le début de l'examen : récompense (+80 📜 +2 💠 si le boss est vaincu, une part sinon — jamais rien).
- Réglages des boss dans `config.js`.

## 1.4.0 — 2026-11-16 · Surprises du jour
- 🎲 Environ un jour sur trois, une **surprise** sur Aujourd'hui — toujours un bonus, jamais une perte :
  - 🧳 **Marchand ambulant** : ta ressource la plus abondante contre la plus rare, avec un bonus de 50 % (« Non merci » ne coûte rien).
  - ⛈️ **Tempête** : un défi — termine 3 tâches dans la journée et le hameau reçoit +30 🪵 +30 🪨. Pas relevé ? Il ne se passe rien.
  - 🎉 **Jour de fête** : les tâches d'une famille rapportent +20 % toute la journée.
- Rien pendant une pause. Réglages du hasard dans `config.js`.

## 1.3.0 — 2026-11-16 · Cours du jour
- 🎓 **Cours du jour** en haut d'Aujourd'hui (lus dans ton agenda, même hors ligne) : heure, lieu, et les journées spéciales (📌 congé…).
- ✋ **« J'y étais »** dès l'heure de début : +25 📜 Savoir (comme une tâche de la catégorie Cours, avec série et Bibliothèque),
  une seule fois par cours. « Annuler » pendant 5 s, comme d'habitude.
- 🎯 Examens repérés tout seuls par le titre ; touche le titre d'un cours pour dire toi-même « examen » ou « pas un examen ».
- 💾 Données version 3 (examens marqués à la main), avec copie de sécurité automatique avant la mise à jour.

## 1.2.1 — 2026-11-16 · Corrections (vérification)
- ↩️ « Annuler » marche à nouveau pendant ses 5 s, même si l'appli fait sa petite vérification de la minute entre-temps.
- 📥 Importer un vieil export ne fait plus payer les jours déjà comptés sur le téléphone (même règle que « Restaurer »).
- ☕ Reprendre puis relancer une pause le même matin : la veille reste couverte par la pause.
- ✅ Cocher deux fois une tâche « fait hier » affiche « Déjà noté pour hier ✅ » (et plus « aujourd'hui »).
- 🔧 Dans « Construire », un bâtiment abîmé explique quoi faire : « À réparer d'abord : touche « Voir » ».
- 🏰 Village : les animations d'un bâtiment remplacé s'arrêtent bien (moins de travail pour le téléphone).
- 🧰 Coulisses : une seule porte pour remplacer toutes les données d'un coup ; seuil d'humeur 😊 et bornes du moral
  dans `config.js` ; durée de garde des événements tirée de la pause rétroactive ; colonnes de la simulation tirées de la Mairie.

## 1.2.0 — 2026-11-16 · Agenda
- 📅 **Mon agenda** (Réglages) : colle l'adresse secrète iCal de ton Google Agenda, Hameau lit tes événements
  (cours qui se répètent, changements d'heure, cours déplacés ou annulés, journées entières).
- Aperçu des 7 prochains jours ; les examens sont repérés tout seuls (examen, exam, interro, test) 🎯.
- Hors ligne : la dernière version gardée reste affichée (« Hors ligne — version gardée à 10:42 »). Actualisé à l'ouverture et avec « Actualiser ».
- L'adresse reste sur le téléphone : jamais réaffichée, jamais dans l'export ni dans les journaux.

## 1.1.0 — 2026-11-16 · Rappels
- 🔔 **Rappels** : le matin ton programme du jour, le soir s'il reste des quotidiennes (« Plus que 2 quotidiennes et ta série passe à 6 jours 🔥 »),
  et la veille d'une échéance. Jamais de reproche, rien pendant une pause.
- Une explication d'abord, puis Android demande l'autorisation ; « Plus tard » = une seule autre proposition quelques jours après.
- Réglages → Rappels : heure du matin et du soir, interrupteurs, « Tester un rappel » (arrive en 10 secondes).
- Toujours à jour : les rappels sont recalculés à chaque tâche cochée et à chaque ouverture. Toucher un rappel ouvre Aujourd'hui.
- Petite icône Hameau dans la barre d'état.

## 1.0.0 — 2026-11-16 · Première version complète
- 🔊 Réglages : interrupteurs **Sons** et **Vibrations** (gardés après redémarrage).
- 🛟 **Sauvegardes automatiques** : la liste des copies (une par semaine + avant chaque opération délicate), avec « Restaurer ».
  Une copie de ton état actuel est faite avant : tu peux toujours revenir en arrière. Les jours déjà comptés ne sont pas rejoués.
- 📦 Petite carte « Petite sauvegarde de ton village ? » sur Aujourd'hui après 14 jours sans export : un tap = export, ✕ = plus tard.
- 🔄 **Vérifier les mises à jour** : seule fonction qui utilise Internet, et uniquement quand tu touches le bouton ; message clair sans réseau.
- 🐞 L'ajout d'une tâche ne vibre plus quand les vibrations sont coupées.

## 0.7.1 — 2026-11-16 · Équilibrage
- ⚖️ Le village se construit plus vite : bâtiments 30 de leur ressource + 5 bois + 5 pierre (× niveau²), Mairie 20 de chaque (× niveau²).
- 🏛️ Niveaux de chef demandés par la Mairie : 1 / 3 / 6 / 9 / 12 (au lieu de 1 / 5 / 10 / 16 / 23).
- 🎯 Village complet en environ 4 mois à rythme régulier (avant : plus de 200 jours).
- 🧪 Les tests calculent les coûts depuis `config.js` : un prochain rééquilibrage ne les cassera plus.

## 0.7.0 — 2026-11-16
- 🔧 Village : un incendie peut abîmer un bâtiment (grisé, fumée, ⚠️) — on le répare pour 30 % de son coût.
- 🗺️ Agrandir le hameau : jusqu'à 3 anneaux de terrain (la rivière et les chemins continuent).
- 🌳 Décorations : arbres, rochers, potager, clôture, puits (ressources) et tours, remparts, porte (💠 gemmes).
- ⚖️ Moteur complet : type de tâche, série, Repos, anti-farm, bonus des bâtiments, moral.
- 🎁 Coffres (10 % des tâches terminées) qui s'ouvrent sous tes yeux ; 🎉 écran de fête à chaque niveau.
- 📅 Les jours passés sont rattrapés en douceur : série et joker, moral, incendies ; message de retour bienveillant.
- ↩️ « Hier, jusqu'à midi » : tu peux encore cocher ce que tu as fait la veille.
- ⏸️ Mode pause (jusqu'à 7 jours en arrière : ce qui a été perdu est rendu).
- ⚡ Prochaine action : une seule tâche proposée, « Pas maintenant » pour la suivante.
- 👤 Perso : série, moral, historique des 7 derniers jours.

## 0.6.0 — 2026-11-16
- 🔨 On construit ! La Mairie d'abord, puis 7 bâtiments qui donnent +5 % de gains par niveau à leur famille de tâches.
- Placement libre : tu choisis la case (fantôme du bâtiment, case verte ou rouge, « Placer ici »), et tu peux déplacer plus tard.
- Fiche de chaque bâtiment : étoiles de niveau, bonus actuel, coût du niveau suivant, ce qui manque et quelles tâches le rapportent.
- Le village vit : bâtiments qui tombent et rebondissent, chantier au marteau, étincelles, bannière « Niveau 2 ! », fumée,
  villageois qui se promènent, nuages, reflets sur la rivière, arbres au vent, ciel qui suit l'heure, fenêtres éclairées la nuit.
- Petits sons (construction, pièces, validation), désactivables.
- Aujourd'hui : tableau de bord en bois et or, carte « Prochain chantier », cartes de tâches en relief, date du jour.
- Écran Perso : niveau du chef, 6 talents, bâtiments du hameau.
- Données version 2 (le village), avec copie de sécurité automatique avant la mise à jour.

## 0.5.0 — 2026-11-16
- 🏘️ Le village est là ! Onglet Village : une île à explorer (glisser pour se promener, pincer pour zoomer).
- Graphismes libres (domaine public) et moteur de jeu intégrés dans l'appli : tout marche hors ligne.
- Le village ne se charge qu'à la 1re ouverture de l'onglet et se met en veille quand on le quitte (rapidité et batterie).
- Menu embelli : barre d'onglets en bois et or avec icônes dessinées, Réglages en liste groupée, crédits dans À propos.

## 0.4.1 — 2026-11-16 (correctifs)
- Un objectif atteint par petites saisies (ex. 10 × 1 minute) arrive bien à 100 % (avant : bloqué à 99,99 %).
- « Tout le reste » termine toujours la tâche.
- Une quotidienne changée en imprévu (ou l'inverse) redevient faisable ; ce qu'elle a rapporté reste acquis.
- Changer la cible ou la taille d'une tâche entamée : les quantités faites sont gardées, le total gagné correspond à la nouvelle taille.
- À 4 h du matin ou au retour sur l'appli, les quotidiennes se réactivent sans devoir la redémarrer.
- Compteurs de ressources : plus de chiffre qui recule quand on coche deux tâches très vite.
- Écran Aujourd'hui plus rapide quand l'historique devient long.

## 0.4.0 — 2026-11-16
- Cocher une tâche rapporte de l'XP et la ressource de sa famille (petite 10 · moyenne 25 · grosse 50) : le gain s'envole vers son compteur, petite vibration.
- Objectif chiffré : bouton + pour saisir « 10 pages » → 50 % des gains ; plusieurs saisies s'additionnent, plafond 100 %.
- Quotidiennes : celles prévues ce jour-là, une fois par jour (la journée finit à 4 h du matin).
- Barre de ressources et barre d'XP avec niveau ; « Annuler » pendant 5 secondes après chaque action.
- Toucher une tâche pour la modifier ou la supprimer (ce qu'elle a rapporté reste acquis).

## 0.3.0 — 2026-11-15
- Nouvelle charte graphique « Taverne » : bois sombre et or, titres en Cinzel (police intégrée, hors ligne).
- Bouton + : ajout express d'une tâche (nom + Enregistrer), catégorie par défaut = la dernière utilisée.
- « Plus d'options » : catégorie (favoris en haut), type (quotidienne avec ses jours, imprévu avec échéance et « important », bonus), taille ou objectif chiffré.
- Catégories perso (nom + emoji + famille), depuis l'ajout ou Réglages → Mes catégories.
- Écran Aujourd'hui : tâches rangées par type (imprévus par échéance).
- Le clavier Android ne cache plus la fenêtre d'ajout.

## 0.2.0 — 2026-11-15
- Modèle de données (version 1) et toutes les valeurs de jeu réunies dans `config.js`.
- Stockage sûr : des données illisibles ne sont jamais écrasées (écran de récupération).
- Réglages → Exporter / Importer mes données (aperçu et confirmation avant de remplacer, l'adresse d'agenda n'est jamais exportée).
- Copies de sécurité automatiques : avant chaque import, et une par semaine (les 4 dernières).
- À propos : taille des données.

## 0.1.0 — 2026-11-15
- Squelette de l'appli Android : écrans Aujourd'hui, Village, Perso, Réglages, À propos.
- Icône et écran de démarrage.
- Compilation automatique de l'APK sur GitHub.

<sub>Créé par Gauthier Doumont</sub>

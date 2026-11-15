# 🏡 Hameau

Appli Android de motivation : chaque tâche de la vraie vie (même faite à moitié) rapporte de l'XP et des ressources, qui servent à construire un village.

100 % hors ligne, aucune donnée envoyée nulle part.

## Installer (première fois)
1. Sur le téléphone, ouvrir la page **Releases** du dépôt (lien à droite sur GitHub, ou `/releases/latest`).
2. Télécharger le fichier `hameau-android-….apk` et l'ouvrir.
3. Android demande d'autoriser l'installation depuis le navigateur → autoriser → **Installer**.
4. Si Play Protect avertit : **Plus de détails → Installer quand même**.

## Mettre à jour
Installer une fois **Obtainium** → **Ajouter une appli** → coller l'adresse de ce dépôt. Il prévient et installe chaque nouvelle version. Les données restent (même clé de signature, même identifiant d'appli).

## Pour développer
- Interface : `www/` (HTML/CSS/JS sans framework), testable dans un navigateur.
- `npm ci` puis `npm test` (vérifications rapides).
- `npm run sync` : met à jour la version et copie `www/` dans le projet Android.
- `npm run icones` : redessine l'icône (seulement si elle change).
- La compilation de l'APK se fait sur GitHub (onglet **Actions**) à chaque push sur `main`. Elle a besoin de 4 secrets : `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

<sub>Créé par Gauthier Doumont</sub>

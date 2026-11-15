/* village.js — Hameau — scène isométrique du village (Phaser 3) — Créé par Gauthier Doumont
 * La scène n'est qu'une VUE : elle dessine l'état (etat.village, en cases de grille) et ne décide de rien.
 * Phaser n'est chargé qu'à la 1re ouverture de l'onglet Village (l'appli démarre aussi vite qu'avant),
 * et le jeu est endormi dès qu'on quitte l'onglet ou l'appli (batterie).
 */
(function () {
  'use strict';
  const CV = window.CATALOGUE_VILLAGE, G = window.VillageGeo;
  const T = CV.tuile;
  const V = {};
  let jeu = null, scene = null, chargement = null, etatCourant = null, ouvert = false;

  const reglage = () => window.CONFIG.village;
  const densite = () => Math.min(window.devicePixelRatio || 1, 2);   // net sur le téléphone, sans écraser les fps
  const conteneur = () => document.getElementById('village');

  /* ===== CHARGEMENT À LA DEMANDE ===== */
  function chargerPhaser() {
    if (window.Phaser) return Promise.resolve();
    return chargement ??= new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = 'lib/phaser.min.js';
      s.onload = ok;
      s.onerror = () => { chargement = null; ko(new Error('Le moteur du village est introuvable.')); };
      document.head.append(s);
    });
  }

  // Le village occupe tout l'espace entre l'en-tête et la barre d'onglets
  function placerConteneur() {
    const haut = document.querySelector('.entete')?.getBoundingClientRect().bottom ?? 0;
    conteneur().style.top = Math.round(haut) + 'px';
  }

  function creerJeu() {
    const el = conteneur(), d = densite();
    jeu = new Phaser.Game({
      type: Phaser.AUTO, parent: el, transparent: true, banner: false,
      width: Math.max(1, el.clientWidth * d), height: Math.max(1, el.clientHeight * d),
      scale: { mode: Phaser.Scale.NONE, zoom: 1 / d },        // dessiné à la densité de l'écran, affiché à la taille CSS
      render: { antialias: true },
      input: { activePointers: 3 },
      scene: [definirScene()],          // la classe de scène est fabriquée ici, une fois Phaser chargé
    });
  }

  function redimensionner() {
    if (!jeu || !ouvert) return;
    placerConteneur();
    const el = conteneur(), d = densite();
    jeu.scale.resize(Math.max(1, el.clientWidth * d), Math.max(1, el.clientHeight * d));
    scene?.reglerCamera(false);
  }

  /* ===== API utilisée par app.js ===== */
  V.ouvrir = async function (etat) {
    etatCourant = etat;
    ouvert = true;
    placerConteneur();
    try {
      await chargerPhaser();
    } catch (x) {
      document.getElementById('village-chargement').textContent = x.message + ' Réinstalle l\'appli si ça continue.';
      return;
    }
    if (!ouvert) return;
    if (!jeu) creerJeu();
    else { jeu.loop.wake(); redimensionner(); scene?.redessiner(etatCourant); }
  };
  V.fermer = function () {
    ouvert = false;
    jeu?.loop.sleep();
  };
  V.actualiser = function (etat) {
    etatCourant = etat;
    if (scene && ouvert) scene.redessiner(etat);
  };
  // Pour les tests dans le navigateur : un bâtiment de chaque type, à des niveaux variés
  V.demo = function () {
    const batiments = [['mairie', 5, 6, 3], ['bibliotheque', 3, 2, 2], ['arene', 4, 6, 7], ['atelier', 2, 1, 7],
      ['taverne', 5, 6, 1], ['scierie', 1, 2, 9], ['banque', 4, 7, 3], ['jardin', 5, 5, 9],
      ['taverne', 1, 1, 2], ['bibliotheque', 5, 7, 7]]
      .map(([type, niveau, x, y], i) => ({ id: 'demo' + i, type, niveau, x, y, endommage: false }));
    V.actualiser({ ...etatCourant, village: { batiments, extensions: 0, decorations: [] } });
  };
  V.estPret = () => !!scene;
  V.tourne = () => !!jeu?.loop.running;
  // Centre la vue sur une case (ex. un bâtiment qu'on vient de construire) ; zoom en taille d'écran
  V.centrer = function (gx, gy, zoom) {
    if (!scene) return;
    const cam = scene.cameras.main, p = G.versEcran(gx, gy, T, 2);
    if (zoom) cam.setZoom(Phaser.Math.Clamp(zoom * densite(), scene.zoomMin, scene.zoomMax));
    cam.centerOn(p.x, p.y);
  };   // pour les tests : le jeu dort-il hors de l'onglet ?

  window.addEventListener('resize', () => requestAnimationFrame(redimensionner));
  document.addEventListener('visibilitychange', () => {
    if (!jeu) return;
    if (document.hidden) jeu.loop.sleep(); else if (ouvert) { jeu.loop.wake(); redimensionner(); }
  });

  /* ===== LA SCÈNE ===== */
  function definirScene() {
    return class extends Phaser.Scene {
      constructor() { super('village'); this.objets = []; }

      preload() {
        this.load.atlas(CV.atlas.cle, CV.atlas.image, CV.atlas.json);
      }

      create() {
        scene = this;
        this.terrain = G.lireCarte(CV.carte, CV.decors);
        this.dessinerTerrain();
        this.redessiner(etatCourant);
        this.reglerCamera(true);
        this.gestes();
        document.getElementById('village-chargement').hidden = true;
        afficherBulle();
      }

      poser(image, gx, gy, h, ordre = 0) {
        const p = G.versEcran(gx, gy, T, h);
        return this.add.image(p.x, p.y, CV.atlas.cle, image).setDepth(G.profondeur(gx, gy, h, ordre));
      }

      // Sol et décors : dessinés une seule fois
      dessinerTerrain() {
        for (const c of this.terrain.cases) {
          this.poser(c.sol, c.gx, c.gy, 0);
          if (c.decor) this.poser(c.decor, c.gx, c.gy, 1);
        }
      }

      // Bâtiments : redessinés à chaque changement de l'état
      redessiner(etat) {
        for (const o of this.objets) o.destroy();
        this.objets = [];
        for (const bat of etat?.village?.batiments || []) {
          G.pieces(bat, CV).forEach((p, i) => this.objets.push(this.poser(p.image, p.gx, p.gy, p.h, 1 + i % 5)));
        }
      }

      reglerCamera(initial) {
        const cam = this.cameras.main, d = densite(), R = reglage();
        const e = G.etendue(this.terrain, T);
        cam.setBounds(e.x, e.y, e.largeur, e.hauteur);
        this.zoomMin = R.zoomMin * d;
        this.zoomMax = R.zoomMax * d;
        if (initial) {
          cam.setZoom(R.zoomDepart * d);
          const centre = G.versEcran(this.terrain.largeur / 2 - 0.5, this.terrain.hauteur / 2 - 0.5, T, 1);
          cam.centerOn(centre.x, centre.y);
        } else {
          cam.setZoom(Phaser.Math.Clamp(cam.zoom, this.zoomMin, this.zoomMax));
        }
      }

      zoomer(facteur) {
        const cam = this.cameras.main;
        cam.setZoom(Phaser.Math.Clamp(cam.zoom * facteur, this.zoomMin, this.zoomMax));
      }

      // Un doigt = se déplacer · deux doigts = zoomer · molette = zoomer (test sur ordinateur)
      gestes() {
        const cam = this.cameras.main;
        this.input.addPointer(1);
        this.distPrec = 0;
        this.pincement = false;
        this.input.on('pointermove', (p) => {
          const a = this.input.pointer1, b = this.input.pointer2;
          if (a.isDown && b.isDown) {
            const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
            if (this.distPrec) this.zoomer(dist / this.distPrec);
            this.distPrec = dist;
            this.pincement = true;
            return;
          }
          if (p.isDown && !this.pincement) {
            cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
            cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
          }
        });
        this.input.on('pointerup', () => {
          // Le pincement reste « bloqué » jusqu'à ce que les deux doigts soient levés (sinon la carte saute)
          if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) { this.distPrec = 0; this.pincement = false; }
        });
        this.input.on('wheel', (p, objets, dx, dy) => this.zoomer(dy > 0 ? 0.9 : 1.1));
      }
    };
  }

  /* ===== BULLE D'ACCUEIL (1re visite) ===== */
  const CLE_BULLE = 'hameau_village_bulle_vue';
  function afficherBulle() {
    let vue = false;
    try { vue = localStorage.getItem(CLE_BULLE) === '1'; } catch {}
    document.getElementById('village-bulle').hidden = vue;
  }
  document.getElementById('village-bulle-ok')?.addEventListener('click', () => {
    document.getElementById('village-bulle').hidden = true;
    try { localStorage.setItem(CLE_BULLE, '1'); } catch {}
  });

  window.Village = V;
})();

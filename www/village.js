/* village.js — Hameau — scène isométrique du village (Phaser 3) — Créé par Gauthier Doumont
 * La scène n'est qu'une VUE : elle dessine l'état (etat.village, en cases de grille) et ne décide de rien.
 * Les règles (coûts, déblocages) sont dans economie.js ; les boutons et fenêtres dans village-ui.js.
 * Phaser n'est chargé qu'à la 1re ouverture de l'onglet Village, et le jeu dort dès qu'on le quitte (batterie).
 * Le rendu « jeu » vient surtout de l'animation : pose qui rebondit, chantier, fumée, villageois, nuages,
 * reflets sur la rivière, ciel qui suit l'heure, fenêtres éclairées la nuit.
 */
(function () {
  'use strict';
  const CV = window.CATALOGUE_VILLAGE, G = window.VillageGeo;
  const T = CV.tuile;
  const V = {};
  let jeu = null, scene = null, chargement = null, etatCourant = null, ouvert = false;
  let rappels = { batiment: null, decoration: null, placement: null };

  const reglage = () => window.CONFIG.village;
  const densite = () => Math.min(window.devicePixelRatio || 1, 2);   // net sur le téléphone, sans écraser les fps
  const conteneur = () => document.getElementById('village');
  const MOUVEMENT_REDUIT = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const PROF = { voile: 900000, lueurs: 910000, nuages: 950000, textes: 990000 };   // calques au-dessus du monde
  const SOL_HAUT = 8;   // le dessus du cube de sol est 8 px sous le centre de l'image

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

  /* ===== API (utilisée par app.js et village-ui.js) ===== */
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
    else { jeu.loop.wake(); redimensionner(); scene?.redessiner(etatCourant); scene?.majAmbiance(); }
  };
  V.fermer = function () {
    ouvert = false;              // (le placement en cours est annulé par village-ui.js, seul responsable)
    jeu?.loop.sleep();
  };
  V.actualiser = function (etat) {
    etatCourant = etat;
    if (scene && ouvert) scene.redessiner(etat);
  };
  V.animer = (quoi, id) => scene?.animer(quoi, id);
  V.surBatiment = (fn) => { rappels.batiment = fn; };            // toucher un bâtiment
  V.surDecoration = (fn) => { rappels.decoration = fn; };        // toucher une décoration
  V.placer = (opts, fn) => { rappels.placement = fn; scene?.entrerPlacement(opts); };
  V.validerPlacement = () => scene?.validerPlacement() ?? null;
  V.quitterPlacement = () => scene?.quitterPlacement();
  V.centrer = function (gx, gy, zoom) {
    if (!scene) return;
    const cam = scene.cameras.main, p = G.versEcran(gx, gy, T, 2);
    if (zoom) cam.setZoom(Phaser.Math.Clamp(zoom * densite(), scene.zoomMin, scene.zoomMax));
    cam.pan(p.x, p.y, MOUVEMENT_REDUIT ? 0 : 450, 'Sine.easeInOut');
  };
  V.forcerAmbiance = (a) => { forcee = a; scene?.majAmbiance(); };   // tests : 'aube' | 'jour' | 'soir' | 'nuit'
  V.terrain = () => scene?.terrain ?? G.lireCarte(CV.carte, CV.decors);
  V.estPret = () => !!scene;
  V.tourne = () => !!jeu?.loop.running;                           // tests : le jeu dort-il hors de l'onglet ?
  // Tests : un bâtiment de chaque type, à des niveaux variés
  V.demo = function () {
    const batiments = [['mairie', 5, 6, 3], ['bibliotheque', 3, 2, 2], ['arene', 4, 6, 7], ['atelier', 2, 1, 7],
      ['taverne', 5, 6, 1], ['scierie', 1, 2, 9], ['banque', 4, 7, 3], ['jardin', 5, 5, 9]]
      .map(([type, niveau, x, y], i) => ({ id: 'demo' + i, type, niveau, x, y, endommage: false }));
    V.actualiser({ ...etatCourant, village: { batiments, extensions: 0, decorations: [] } });
  };

  window.addEventListener('resize', () => requestAnimationFrame(redimensionner));
  document.addEventListener('visibilitychange', () => {
    if (!jeu) return;
    if (document.hidden) jeu.loop.sleep(); else if (ouvert) { jeu.loop.wake(); redimensionner(); scene?.majAmbiance(); }
  });

  /* ===== AMBIANCE SELON L'HEURE ===== */
  let forcee = null;
  function ambianceActuelle() {
    if (forcee) return forcee;
    // Heure locale (Bruxelles) via temps.js, testé pour l'heure d'été / d'hiver
    const h = window.Temps.partiesLocales(window.Appli?.maintenant?.() ?? new Date(), window.CONFIG.jour.fuseau).heure;
    return h >= 6 && h < 8 ? 'aube' : h >= 8 && h < 18 ? 'jour' : h >= 18 && h < 21 ? 'soir' : 'nuit';
  }
  // Voile coloré (mode « multiplier ») posé sur le monde ; les lueurs passent par-dessus
  const VOILES = { aube: [0xffd9b8, 0.35], jour: [0xffffff, 0], soir: [0xffa070, 0.4], nuit: [0x4a5aa8, 0.62] };

  /* ===== TEXTURES DESSINÉES (pas d'image en plus à charger) ===== */
  function textureRadiale(sc, cle, taille, couleur, alphaCentre = 1) {
    if (sc.textures.exists(cle)) return;
    const t = sc.textures.createCanvas(cle, taille, taille), c = t.getContext(), r = taille / 2;
    const g = c.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, `rgba(${couleur},${alphaCentre})`);
    g.addColorStop(0.45, `rgba(${couleur},${alphaCentre * 0.45})`);
    g.addColorStop(1, `rgba(${couleur},0)`);
    c.fillStyle = g; c.fillRect(0, 0, taille, taille); t.refresh();
  }
  function textureEtincelle(sc) {
    if (sc.textures.exists('etincelle')) return;
    const t = sc.textures.createCanvas('etincelle', 24, 24), c = t.getContext();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(12, 0); c.quadraticCurveTo(13.5, 10.5, 24, 12); c.quadraticCurveTo(13.5, 13.5, 12, 24);
    c.quadraticCurveTo(10.5, 13.5, 0, 12); c.quadraticCurveTo(10.5, 10.5, 12, 0); c.fill(); t.refresh();
  }
  function textureNuage(sc, cle, graine) {
    if (sc.textures.exists(cle)) return;
    const L = 260, H = 120, t = sc.textures.createCanvas(cle, L, H), c = t.getContext();
    const bulles = [[70, 75, 42], [120, 58, 52], [175, 70, 44], [215, 82, 30], [40, 88, 26]].map(([x, y, r], i) =>
      [x + ((graine * 13 + i * 7) % 15) - 7, y + ((graine * 7 + i * 5) % 9) - 4, r]);
    c.fillStyle = 'rgba(70,90,120,0.18)';                                     // ombre douce dessous
    for (const [x, y, r] of bulles) { c.beginPath(); c.arc(x, y + 8, r, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#ffffff';
    for (const [x, y, r] of bulles) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
    t.refresh();
  }
  // Petit villageois au style du pack (contour sombre, couleurs plates), dessiné à 2× puis réduit
  const TENUES = ['#e9765d', '#5da9e9', '#7bd389', '#b07ce8', '#f2c14e', '#e8a33d', '#7fd6c2', '#8fa3b8'];
  function textureVillageois(sc, i) {
    const cle = 'villageois-' + i;
    if (sc.textures.exists(cle)) return cle;
    const t = sc.textures.createCanvas(cle, 40, 64), c = t.getContext();
    const contour = '#4a3326';
    c.lineWidth = 3; c.strokeStyle = contour; c.lineJoin = 'round';
    c.fillStyle = '#5a4535';                                                   // jambes
    c.fillRect(13, 46, 6, 14); c.fillRect(21, 46, 6, 14); c.strokeRect(13, 46, 6, 14); c.strokeRect(21, 46, 6, 14);
    c.fillStyle = TENUES[i % TENUES.length];                                   // tunique
    c.beginPath(); c.moveTo(11, 24); c.lineTo(29, 24); c.lineTo(33, 50); c.lineTo(7, 50); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#f3d2b3';                                                   // tête
    c.beginPath(); c.arc(20, 15, 10, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = ['#6b4a2b', '#2f2a26', '#c98a3a', '#8a3b2b'][i % 4];         // cheveux / bonnet
    c.beginPath(); c.arc(20, 12, 10, Math.PI * 1.05, Math.PI * 1.95); c.lineTo(20, 9); c.closePath(); c.fill();
    t.refresh();
    return cle;
  }

  /* ===== LA SCÈNE ===== */
  // Rafale de particules « une fois » : l'émetteur est détruit après sa durée de vie (pas d'accumulation)
  function rafale(sc, x, y, texture, config, n, profondeur) {
    const em = sc.add.particles(x, y, texture, { ...config, emitting: false }).setDepth(profondeur);
    em.explode(n);
    sc.time.delayedCall((config.lifespan || 1000) + 200, () => em.destroy());
    return em;
  }

  function definirScene() {
    return class extends Phaser.Scene {
      constructor() {
        super('village');
        this.parBat = new Map();      // id du bâtiment → { bat, images[], effets[] }
        this.parDeco = new Map();     // id de la décoration → { bat: deco, images[], effets[] }
        this.solObjets = [];          // images du terrain (pour le redessiner quand le hameau s'agrandit)
        this.villageois = new Map();  // id du bâtiment → sprite qui se promène
        this.placement = null;
      }

      preload() {
        this.load.atlas(CV.atlas.cle, CV.atlas.image, CV.atlas.json);
      }

      create() {
        scene = this;
        textureRadiale(this, 'fumee', 48, '235,235,235', 0.9);
        textureRadiale(this, 'poussiere', 40, '226,196,150', 0.9);
        textureRadiale(this, 'lueur', 96, '255,196,110', 0.95);
        textureRadiale(this, 'halo', 160, '255,214,120', 0.7);
        textureEtincelle(this);
        for (let i = 0; i < 3; i++) textureNuage(this, 'nuage' + i, i);
        this.anneaux = etatCourant?.village?.extensions || 0;
        this.terrain = G.lireCarte(CV.carte, CV.decors, this.anneaux);
        this.dessinerTerrain();
        this.creerAmbiance();
        this.redessiner(etatCourant);
        this.reglerCamera(true);
        this.gestes();
        this.time.addEvent({ delay: 60000, loop: true, callback: () => this.majAmbiance() });
        document.getElementById('village-chargement').hidden = true;
        window.dispatchEvent(new CustomEvent('village-pret'));
      }

      poser(image, gx, gy, h, ordre = 0) {
        const p = G.versEcran(gx, gy, T, h);
        return this.add.image(p.x, p.y, CV.atlas.cle, image).setDepth(G.profondeur(gx, gy, h, ordre));
      }

      /* ----- Terrain : sol, décors, reflets sur l'eau (dessinés une seule fois) ----- */
      // nouvelAnneau : numéro de l'anneau qui vient d'être acheté → ses cases montent de sous terre
      dessinerTerrain(nouvelAnneau = 0) {
        const garder = (o) => { this.solObjets.push(o); return o; };
        for (const c of this.terrain.cases) {
          const sol = garder(this.poser(c.sol, c.gx, c.gy, 0));
          let d = null;
          if (nouvelAnneau && c.anneau === nouvelAnneau && !MOUVEMENT_REDUIT) {
            const delai = (Math.abs(c.gx) + Math.abs(c.gy)) * 25 % 900;
            for (const o of [sol]) { const y = o.y; o.setY(y + 140).setAlpha(0); this.tweens.add({ targets: o, y, alpha: 1, duration: 520, delay: delai, ease: 'Back.easeOut' }); }
          }
          if (c.decor) {
            d = garder(this.poser(c.decor, c.gx, c.gy, 1));
            // Les arbres ondulent doucement au vent
            if (!MOUVEMENT_REDUIT && /^tree/.test(c.decor)) {
              d.setOrigin(0.5, 0.78); d.y += (0.78 - 0.5) * d.height;
              this.tweens.add({ targets: d, angle: { from: -1.2, to: 1.2 }, duration: 2400 + ((c.gx * 7 + c.gy * 13) % 9) * 180,
                yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: (c.gx * 97 + c.gy * 31) % 1500 });
            }
            // Nouvel anneau : les arbres apparaissent juste après leur sol
            if (nouvelAnneau && c.anneau === nouvelAnneau && !MOUVEMENT_REDUIT) {
              d.setAlpha(0);
              this.tweens.add({ targets: d, alpha: 1, duration: 400, delay: (Math.abs(c.gx) + Math.abs(c.gy)) * 25 % 900 + 350 });
            }
          }
          // Reflets qui scintillent sur la rivière
          if (!MOUVEMENT_REDUIT && /river/.test(c.sol)) {
            for (let k = 0; k < 2; k++) {
              const p = G.versEcran(c.gx, c.gy, T, 0);
              const e = garder(this.add.image(p.x + (k ? 14 : -12), p.y + SOL_HAUT + (k ? -4 : 5), 'etincelle')
                .setScale(0.35).setAlpha(0).setDepth(G.profondeur(c.gx, c.gy, 0, 6)));
              this.tweens.add({ targets: e, alpha: { from: 0, to: 0.85 }, scale: { from: 0.2, to: 0.45 }, duration: 700,
                yoyo: true, repeat: -1, repeatDelay: 1800 + ((c.gx + c.gy * 3 + k * 5) % 7) * 500, delay: (c.gy * 330 + k * 900) % 3000 });
            }
          }
        }
      }

      // Le hameau s'est agrandi : on redessine le terrain, le nouvel anneau apparaît en vague
      majTerrain(etat) {
        const anneaux = etat?.village?.extensions || 0;
        if (anneaux === this.anneaux) return;
        const nouvel = anneaux > this.anneaux ? anneaux : 0;
        for (const o of this.solObjets) { this.tweens.killTweensOf(o); o.destroy(); }
        this.solObjets = [];
        this.anneaux = anneaux;
        this.terrain = G.lireCarte(CV.carte, CV.decors, anneaux);
        this.dessinerTerrain(nouvel);
        this.etendueMonde = G.etendue(this.terrain, T);
        this.reglerCamera(false);
      }

      /* ----- Ambiance : voile coloré selon l'heure, nuages, lucioles ----- */
      creerAmbiance() {
        const e = G.etendue(this.terrain, T);
        this.etendueMonde = e;
        this.voile = this.add.rectangle(e.x - 3000, e.y - 3000, e.largeur + 6000, e.hauteur + 6000, 0xffffff, 0)
          .setOrigin(0, 0).setDepth(PROF.voile).setBlendMode(Phaser.BlendModes.MULTIPLY);
        // Nuages qui passent lentement
        this.nuages = [];
        for (let i = 0; i < 4; i++) {
          const n = this.add.image(e.x + (i * 0.27 + 0.1) * e.largeur, e.y + 40 + (i % 2) * 120 + i * 30, 'nuage' + (i % 3))
            .setDepth(PROF.nuages).setAlpha(0.85).setScale(0.8 + (i % 3) * 0.2);
          this.nuages.push(n);
          if (!MOUVEMENT_REDUIT) this.deriver(n, true);
        }
        // Lucioles (visibles la nuit, autour des arbres)
        this.lucioles = [];
        if (!MOUVEMENT_REDUIT) {
          const arbres = this.terrain.cases.filter(c => c.decor && /^tree/.test(c.decor));
          for (let i = 0; i < Math.min(14, arbres.length); i++) {
            const a = arbres[(i * 7) % arbres.length], p = G.versEcran(a.gx, a.gy, T, 1);
            const l = this.add.image(p.x, p.y, 'lueur').setScale(0.12).setAlpha(0).setDepth(PROF.lueurs).setBlendMode(Phaser.BlendModes.ADD);
            this.tweens.add({ targets: l, x: p.x + Phaser.Math.Between(-40, 40), y: p.y + Phaser.Math.Between(-50, 10),
              duration: Phaser.Math.Between(2500, 4500), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            this.lucioles.push(l);
          }
        }
        this.majAmbiance();
      }
      deriver(n, debut) {
        const e = this.etendueMonde, fin = e.x + e.largeur + 200, depart = e.x - 300;
        if (!debut) n.x = depart;
        const duree = ((fin - n.x) / (e.largeur + 500)) * Phaser.Math.Between(90000, 130000);
        this.tweens.add({ targets: n, x: fin, duration: duree, onComplete: () => this.deriver(n, false) });
      }
      majAmbiance() {
        if (!this.voile) return;
        const a = ambianceActuelle();
        this.ambiance = a;
        const [couleur, alpha] = VOILES[a];
        this.voile.setFillStyle(couleur, alpha);
        const nuit = a === 'nuit', soir = a === 'soir';
        for (const n of this.nuages) n.setAlpha(nuit ? 0.22 : soir ? 0.6 : 0.85);
        for (const l of this.lucioles) l.setAlpha(nuit ? 0.9 : 0).setVisible(nuit);
        for (const { effets } of this.parBat.values()) for (const f of effets) if (f.lueur) f.setAlpha(nuit ? 0.85 : soir ? 0.45 : 0);
        conteneur().dataset.ambiance = a;   // le ciel (CSS) suit aussi l'heure
      }

      /* ----- Bâtiments : redessinés à chaque changement de l'état ----- */
      redessiner(etat) {
        this.majTerrain(etat);
        const batiments = etat?.village?.batiments || [];
        const signature = b => `${b.type}|${b.niveau}|${b.x}|${b.y}|${b.endommage ? 1 : 0}`;
        const presents = new Set(batiments.map(b => b.id));
        // On ne recrée que les bâtiments nouveaux, déplacés, améliorés ou supprimés
        for (const [id, rec] of this.parBat) {
          const bat = batiments.find(b => b.id === id);
          if (!presents.has(id) || signature(bat) !== rec.signature) { this.effacerBatiment(rec); this.parBat.delete(id); }
        }
        for (const bat of batiments) if (!this.parBat.has(bat.id)) this.dessinerBatiment(bat, signature(bat));
        // Décorations : même principe (seules les nouvelles, déplacées ou retirées sont refaites)
        const decos = etat?.village?.decorations || [];
        const sigDeco = d => `${d.type}|${d.x}|${d.y}`;
        for (const [id, rec] of this.parDeco) {
          const d = decos.find(x => x.id === id);
          if (!d || sigDeco(d) !== rec.signature) { this.effacerBatiment(rec); this.parDeco.delete(id); }
        }
        for (const d of decos) {
          if (this.parDeco.has(d.id)) continue;
          const images = G.piecesDecoration(d, CV).map(p => {
            const img = this.poser(p.image, p.gx, p.gy, p.h, 2);
            img.decoId = d.id;
            img.setInteractive({ pixelPerfect: true });
            return img;
          });
          this.parDeco.set(d.id, { bat: d, images, effets: [], haut: 1, signature: sigDeco(d) });
        }
        this.libres = this.calculerCasesLibres();
        this.synchroniserVillageois(batiments);
        if (this.placement) this.majPlacement();
      }
      effacerBatiment({ images, effets }) {
        images.forEach(o => o.destroy());
        effets.forEach(o => o.destroy());
      }
      dessinerBatiment(bat, signature) {
        const ambiance = this.ambiance || ambianceActuelle();
        const pieces = G.pieces(bat, CV);                 // calculées une seule fois
        if (!pieces.length) return;                       // type inconnu : rien à dessiner
        const images = pieces.map((p, i) => {
          const img = this.poser(p.image, p.gx, p.gy, p.h, 1 + i % 5);
          img.batId = bat.id;
          img.setInteractive({ pixelPerfect: true });
          return img;
        });
        const effets = [];
        const haut = Math.max(...pieces.filter(p => p.gx === bat.x && p.gy === bat.y).map(p => p.h), 1);
        // Fenêtres éclairées le soir et la nuit
        for (const p of pieces) {
          if (!/^building_/.test(p.image)) continue;
          const q = G.versEcran(p.gx, p.gy, T, p.h);
          const l = this.add.image(q.x, q.y + 36, 'lueur').setScale(0.8, 0.45).setDepth(PROF.lueurs).setBlendMode(Phaser.BlendModes.ADD);
          l.lueur = true;
          l.setAlpha(ambiance === 'nuit' ? 0.85 : ambiance === 'soir' ? 0.45 : 0);
          effets.push(l);
        }
        // Fumée des cheminées
        if (!MOUVEMENT_REDUIT && CV.batiments[bat.type]?.fumee) {
          const q = G.versEcran(bat.x, bat.y, T, haut + 0.55);
          const f = this.add.particles(q.x + 18, q.y, 'fumee', {
            speedY: { min: -26, max: -14 }, speedX: { min: -4, max: 8 }, lifespan: 2600,
            alpha: { start: 0.55, end: 0 }, scale: { start: 0.25, end: 0.9 }, frequency: 520, quantity: 1,
          }).setDepth(G.profondeur(bat.x, bat.y, haut + 1, 9));
          effets.push(f);
        }
        // Endommagé : grisé, fumée sombre et petit panneau ⚠️ qui flotte (réparable dans la fiche)
        if (bat.endommage) {
          images.forEach(i => i.setTint(0x9c9c9c));
          const q = G.versEcran(bat.x, bat.y, T, haut + 0.4);
          if (!MOUVEMENT_REDUIT) {
            effets.push(this.add.particles(q.x - 10, q.y + 20, 'fumee', {
              speedY: { min: -30, max: -18 }, speedX: { min: -6, max: 6 }, lifespan: 2200, tint: 0x3a3330,
              alpha: { start: 0.7, end: 0 }, scale: { start: 0.35, end: 1.1 }, frequency: 300, quantity: 1,
            }).setDepth(G.profondeur(bat.x, bat.y, haut + 1, 9)));
          }
          const alerte = this.add.text(q.x, q.y - 26, '⚠️', { fontSize: '30px' }).setOrigin(0.5).setDepth(PROF.textes - 2);
          if (!MOUVEMENT_REDUIT) this.tweens.add({ targets: alerte, y: q.y - 36, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          effets.push(alerte);
        }
        // Niveau max : halo doré qui respire au pied du bâtiment
        if (bat.niveau >= window.CONFIG.batiments.niveauMax) {
          const q = G.versEcran(bat.x, bat.y, T, 0);
          const h = this.add.image(q.x, q.y + SOL_HAUT, 'halo').setScale(0.9, 0.45).setDepth(G.profondeur(bat.x, bat.y, 0, 7))
            .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55);
          if (!MOUVEMENT_REDUIT) this.tweens.add({ targets: h, alpha: { from: 0.3, to: 0.75 }, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          effets.push(h);
        }
        this.parBat.set(bat.id, { bat, images, effets, haut, signature });
      }

      /* ----- Villageois : un par bâtiment, se promène sur l'herbe et les chemins ----- */
      // Cases où les villageois peuvent marcher : recalculées seulement quand les bâtiments changent
      calculerCasesLibres() {
        const occ = G.occupees(this.terrain, etatCourant?.village?.batiments || [], CV, etatCourant?.village?.decorations || []);
        const libres = new Set();
        for (const c of this.terrain.cases) {
          const k = `${c.gx},${c.gy}`;
          const marchable = c.constructible || /path|Bridge/.test(c.sol);
          if (marchable && (!occ.has(k) || /path|Bridge/.test(c.sol))) libres.add(k);
        }
        return libres;
      }
      synchroniserVillageois(batiments) {
        const ids = new Set(batiments.map(b => b.id));
        for (const [id, v] of this.villageois) if (!ids.has(id)) { this.tweens.killTweensOf(v); v.destroy(); this.villageois.delete(id); }
        const libres = this.libres;
        batiments.forEach((bat, i) => {
          if (this.villageois.has(bat.id)) return;
          const depart = this.voisineLibre(bat.x, bat.y, libres, 3);
          if (!depart) return;
          const v = this.add.image(0, 0, textureVillageois(this, i)).setScale(0.58).setOrigin(0.5, 1);
          v.case = depart;
          this.placerVillageois(v, depart.gx, depart.gy);
          this.villageois.set(bat.id, v);
          if (!MOUVEMENT_REDUIT) this.time.delayedCall(Phaser.Math.Between(300, 2500), () => this.promener(v, bat.id));
        });
      }
      voisineLibre(gx, gy, libres, rayon) {
        for (let r = 1; r <= rayon; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
          if (libres.has(`${gx + dx},${gy + dy}`)) return { gx: gx + dx, gy: gy + dy };
        }
        return null;
      }
      placerVillageois(v, gx, gy) {
        const p = G.versEcran(gx, gy, T, 0);
        v.setPosition(p.x, p.y + SOL_HAUT + 6).setDepth(G.profondeur(gx, gy, 1, 0));
      }
      promener(v, batId) {
        if (!v.active || !this.villageois.has(batId)) return;
        const bat = this.parBat.get(batId)?.bat;
        const libres = this.libres;
        const pas = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ gx: v.case.gx + dx, gy: v.case.gy + dy }))
          .filter(c => libres.has(`${c.gx},${c.gy}`) && (!bat || Math.abs(c.gx - bat.x) + Math.abs(c.gy - bat.y) <= 4));
        const suivante = pas.length ? Phaser.Utils.Array.GetRandom(pas) : null;
        const lent = (etatCourant?.joueur?.moral ?? 80) < window.CONFIG.moral.seuilTriste;   // moral bas : plus lents
        if (!suivante) return this.time.delayedCall(2000, () => this.promener(v, batId));
        const dest = G.versEcran(suivante.gx, suivante.gy, T, 0);
        v.setFlipX(dest.x < v.x);
        // Profondeur : la plus « devant » des deux cases pendant le trajet
        const prof = Math.max(G.profondeur(v.case.gx, v.case.gy, 1, 0), G.profondeur(suivante.gx, suivante.gy, 1, 0));
        v.setDepth(prof);
        const duree = (lent ? 1400 : 800) + Phaser.Math.Between(0, 200);
        this.tweens.add({ targets: v, x: dest.x, y: dest.y + SOL_HAUT + 6, duration: duree, ease: 'Sine.easeInOut',
          onComplete: () => {
            v.case = suivante;
            this.placerVillageois(v, suivante.gx, suivante.gy);
            this.time.delayedCall(Phaser.Math.Between(lent ? 2500 : 900, lent ? 6000 : 3800), () => this.promener(v, batId));
          } });
        // Petits sautillements de marche
        this.tweens.add({ targets: v, scaleY: { from: 0.58, to: 0.53 }, duration: duree / 4, yoyo: true, repeat: 1 });
      }

      /* ----- Animations de construction et d'amélioration ----- */
      animer(quoi, id) {
        const b = this.parBat.get(id) || this.parDeco.get(id);
        if (!b) return;
        if (quoi === 'amelioration') return this.chantier(b, () => this.pose(b, true));
        if (quoi === 'reparation') {
          window.Sons?.jouer('valide');
          b.images.forEach(i => i.setTintFill(0xffffff));            // éclair blanc
          this.time.delayedCall(120, () => b.images.forEach(i => i.clearTint()));
          return this.etincelles(b);
        }
        this.pose(b, false);
      }
      // Les étages tombent du ciel l'un après l'autre et rebondissent, nuage de poussière à l'arrivée
      pose(b, amelioration) {
        const q = G.versEcran(b.bat.x, b.bat.y, T, 0);
        const parHauteur = [...b.images].sort((x, y) => x.depth - y.depth);
        parHauteur.forEach((img, i) => {
          const yFinal = img.y;
          if (MOUVEMENT_REDUIT) { img.setAlpha(0); this.tweens.add({ targets: img, alpha: 1, duration: 250 }); return; }
          img.setAlpha(0).setY(yFinal - 90);
          this.tweens.add({ targets: img, y: yFinal, alpha: 1, duration: 420, delay: i * 110, ease: 'Bounce.easeOut',
            onStart: () => window.Sons?.jouer(i === 0 ? 'pose' : 'clic') });
        });
        const fin = parHauteur.length * 110 + 420;
        this.time.delayedCall(MOUVEMENT_REDUIT ? 0 : 380, () => {
          if (!MOUVEMENT_REDUIT) {
            rafale(this, q.x, q.y + SOL_HAUT + 10, 'poussiere', {
              speed: { min: 40, max: 110 }, angle: { min: 160, max: 380 }, lifespan: 700, scale: { start: 0.9, end: 0.2 },
              alpha: { start: 0.8, end: 0 },
            }, 18, G.profondeur(b.bat.x, b.bat.y, 1, 9));
            this.cameras.main.shake(140, 0.0025);
          }
        });
        this.time.delayedCall(fin, () => {
          this.etincelles(b);
          if (amelioration) {
            window.Sons?.jouer('fanfare');
            this.banniere(b, `Niveau ${b.bat.niveau} !`);
          }
        });
      }
      // Chantier : échafaudage en bois, coups de marteau, puis on révèle (animation seulement : aucune attente réelle)
      chantier(b, ensuite) {
        if (MOUVEMENT_REDUIT) return ensuite();
        const haut = b.haut;
        b.images.forEach(img => img.setAlpha(0.35));
        const echafaudage = [];
        for (let h = 1; h <= Math.max(2, haut); h++) {
          const s = this.poser('structure_low_N', b.bat.x, b.bat.y, h, 9).setAlpha(0);
          this.tweens.add({ targets: s, alpha: 1, duration: 150, delay: (h - 1) * 90 });
          echafaudage.push(s);
        }
        [0, 300, 600].forEach(t => this.time.delayedCall(220 + t, () => {
          window.Sons?.jouer('marteau');
          const q = G.versEcran(b.bat.x, b.bat.y, T, 1 + Math.random() * haut);
          rafale(this, q.x + Phaser.Math.Between(-30, 30), q.y, 'etincelle', {
            speed: { min: 60, max: 150 }, lifespan: 380, scale: { start: 0.45, end: 0 }, tint: 0xffd27a,
          }, 6, PROF.textes - 1);
        }));
        this.time.delayedCall(1000, () => {
          echafaudage.forEach(s => this.tweens.add({ targets: s, alpha: 0, y: s.y - 20, duration: 200, onComplete: () => s.destroy() }));
          b.images.forEach(img => img.setAlpha(1));
          ensuite();
        });
      }
      etincelles(b) {
        if (MOUVEMENT_REDUIT) return;
        const q = G.versEcran(b.bat.x, b.bat.y, T, 2);
        rafale(this, q.x, q.y, 'etincelle', {
          speed: { min: 80, max: 220 }, lifespan: 900, scale: { start: 0.6, end: 0 }, gravityY: 160,
          tint: [0xffd27a, 0xffffff, 0xe8a33d],
        }, 26, PROF.textes - 1);
      }
      banniere(b, texte) {
        const q = G.versEcran(b.bat.x, b.bat.y, T, 3.5);
        const t = this.add.text(q.x, q.y, texte, {
          fontFamily: 'Cinzel, Georgia, serif', fontStyle: 'bold', fontSize: '30px', color: '#ffe3a3',
          stroke: '#3b2a20', strokeThickness: 7,
        }).setOrigin(0.5).setDepth(PROF.textes).setScale(0.4);
        this.tweens.add({ targets: t, scale: 1, duration: 380, ease: 'Back.easeOut' });
        this.tweens.add({ targets: t, y: q.y - 60, alpha: 0, delay: 1300, duration: 700, onComplete: () => t.destroy() });
      }

      /* ----- Placement libre : fantôme + case verte / rouge ----- */
      // { type, batId? } pour un bâtiment ; { deco: true, type, decoId? } pour une décoration
      entrerPlacement({ type, batId, deco = false, decoId }) {
        this.quitterPlacement();
        const rec = deco ? (decoId ? this.parDeco.get(decoId) : null) : (batId ? this.parBat.get(batId) : null);
        const existant = rec?.bat ?? null;
        const niveau = existant?.niveau ?? 1;
        const empreinte = deco ? [1, 1] : (CV.batiments[type]?.empreinte || [1, 1]);
        this.placement = { type, batId, deco, decoId, niveau, empreinte, images: [], marque: this.add.graphics() };
        if (rec) rec.images.forEach(i => i.setAlpha(0.25));
        // Départ : la case libre la plus proche du centre de l'écran (ou la place actuelle si on déplace)
        const cam = this.cameras.main;
        const centre = G.versGrille(cam.midPoint.x, cam.midPoint.y - SOL_HAUT, T);
        const depart = existant ? { gx: existant.x, gy: existant.y } : this.caseLibreProche(centre.gx, centre.gy);
        this.deplacerFantome(depart.gx, depart.gy);
      }
      caseLibreProche(gx, gy) {
        for (let r = 0; r < 14; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.estLibre(gx + dx, gy + dy)) return { gx: gx + dx, gy: gy + dy };
        }
        return { gx, gy };
      }
      estLibre(gx, gy) {
        const p = this.placement;
        if (!p) return false;
        const autres = (etatCourant?.village?.batiments || []).filter(b => b.id !== p.batId);
        const autresDecos = (etatCourant?.village?.decorations || []).filter(d => d.id !== p.decoId);
        const occ = G.occupees(this.terrain, autres, CV, autresDecos);
        for (let dx = 0; dx < p.empreinte[0]; dx++) for (let dy = 0; dy < p.empreinte[1]; dy++) {
          const k = `${gx + dx},${gy + dy}`;
          const c = this.terrain.cases.find(x => x.gx === gx + dx && x.gy === gy + dy);
          if (!c || !c.constructible || occ.has(k)) return false;
        }
        // Pas sous les pieds d'un villageois ? Ils s'écartent tout seuls : on ne bloque pas pour eux.
        return true;
      }
      deplacerFantome(gx, gy) {
        const p = this.placement;
        p.gx = gx; p.gy = gy;
        this.majPlacement();
        rappels.placement?.({ gx, gy, libre: p.libre });
      }
      majPlacement() {
        const p = this.placement;
        p.images.forEach(i => i.destroy());
        p.libre = this.estLibre(p.gx, p.gy);
        const pieces = p.deco ? G.piecesDecoration({ type: p.type, x: p.gx, y: p.gy }, CV)
          : G.pieces({ type: p.type, niveau: p.niveau, x: p.gx, y: p.gy }, CV);
        p.images = pieces.map((q, i) => this.poser(q.image, q.gx, q.gy, q.h, 8 + (i % 2)).setAlpha(0.8));
        if (!p.libre) p.images.forEach(i => i.setTint(0xff9a8a));
        // Losange(s) de couleur sous le fantôme
        p.marque.clear().setDepth(G.profondeur(p.gx, p.gy, 0, 9));
        const couleur = p.libre ? 0x7bd389 : 0xf28b6e;
        for (let dx = 0; dx < p.empreinte[0]; dx++) for (let dy = 0; dy < p.empreinte[1]; dy++) {
          const c = G.versEcran(p.gx + dx, p.gy + dy, T, 0);
          const y = c.y + SOL_HAUT, demiL = T.largeur / 2, demiH = T.hauteur / 2;
          const losange = [{ x: c.x, y: y - demiH }, { x: c.x + demiL, y }, { x: c.x, y: y + demiH }, { x: c.x - demiL, y }];
          p.marque.fillStyle(couleur, 0.45).fillPoints(losange, true);
          p.marque.lineStyle(3, couleur, 0.95).strokePoints(losange, true);
        }
      }
      validerPlacement() {
        const p = this.placement;
        if (!p || !p.libre) return null;
        return { gx: p.gx, gy: p.gy, type: p.type, batId: p.batId, deco: p.deco, decoId: p.decoId };
      }
      quitterPlacement() {
        const p = this.placement;
        if (!p) return;
        p.images.forEach(i => i.destroy());
        p.marque.destroy();
        if (p.batId) this.parBat.get(p.batId)?.images.forEach(i => i.setAlpha(1));
        if (p.decoId) this.parDeco.get(p.decoId)?.images.forEach(i => i.setAlpha(1));
        this.placement = null;
      }

      /* ----- Caméra ----- */
      reglerCamera(initial) {
        const cam = this.cameras.main, d = densite(), R = reglage();
        const e = G.etendue(this.terrain, T);
        cam.setBounds(e.x, e.y, e.largeur, e.hauteur);
        this.zoomMin = R.zoomMin * d;
        this.zoomMax = R.zoomMax * d;
        if (initial) {
          cam.setZoom(R.zoomDepart * d);
          const m = this.terrain.min, M = this.terrain.max;
          const centre = G.versEcran((m.gx + M.gx) / 2, (m.gy + M.gy) / 2, T, 1);
          cam.centerOn(centre.x, centre.y);
        } else {
          cam.setZoom(Phaser.Math.Clamp(cam.zoom, this.zoomMin, this.zoomMax));
        }
      }
      zoomer(facteur) {
        const cam = this.cameras.main;
        cam.setZoom(Phaser.Math.Clamp(cam.zoom * facteur, this.zoomMin, this.zoomMax));
      }

      /* ----- Gestes : un doigt = se déplacer · deux doigts = zoomer · toucher = choisir ----- */
      gestes() {
        const cam = this.cameras.main;
        this.input.addPointer(1);
        this.distPrec = 0;
        this.pincement = false;
        this.input.on('pointerdown', (p) => { p.departX = p.x; p.departY = p.y; });
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
        this.input.on('pointerup', (p) => {
          const etaitPincement = this.pincement;
          if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) { this.distPrec = 0; this.pincement = false; }
          // Un « toucher » = le doigt n'a presque pas bougé (sinon c'était un glissement)
          const bouge = Phaser.Math.Distance.Between(p.departX ?? p.x, p.departY ?? p.y, p.x, p.y);
          if (etaitPincement || bouge > 10 * densite()) return;
          this.toucher(p);
        });
        this.input.on('wheel', (p, objets, dx, dy) => this.zoomer(dy > 0 ? 0.9 : 1.1));
      }
      toucher(p) {
        if (this.placement) {
          const c = G.versGrille(p.worldX, p.worldY - SOL_HAUT, T);
          window.Sons?.jouer('clic');
          return this.deplacerFantome(c.gx, c.gy);
        }
        const touches = this.input.hitTestPointer(p).filter(o => o.batId || o.decoId);
        if (!touches.length) return;
        const devant = touches.reduce((a, b) => (b.depth > a.depth ? b : a));
        const b = devant.batId ? this.parBat.get(devant.batId) : this.parDeco.get(devant.decoId);
        if (!b) return;
        // Petit rebond de réponse au toucher
        if (!MOUVEMENT_REDUIT) this.tweens.add({ targets: b.images, scaleY: { from: 0.94, to: 1 }, duration: 260, ease: 'Back.easeOut' });
        window.Sons?.jouer('clic');
        if (devant.batId) rappels.batiment?.(b.bat.id); else rappels.decoration?.(b.bat.id);
      }
    };
  }

  window.Village = V;
})();

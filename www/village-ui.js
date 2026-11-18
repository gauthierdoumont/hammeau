/* village-ui.js — Hameau — boutons et fenêtres du village (par-dessus la scène) — Créé par Gauthier Doumont
 * Construire (liste des 8 bâtiments), placement libre (fantôme + « Placer ici »), fiche d'un bâtiment (améliorer, déplacer).
 * Les règles viennent d'economie.js ; l'écriture passe par Appli.modifier (une seule porte d'écriture, cf. app.js).
 * Ton : jamais de bouton grisé sans explication, toujours « il manque X » et un lien vers la vraie vie.
 */
(function () {
  'use strict';
  const C = window.CONFIG, E = window.Economie, CV = window.CATALOGUE_VILLAGE;
  const A = () => window.Appli;
  let placement = null;            // { type, batId? } pendant qu'on choisit une case
  let ficheOuverte = null;         // id du bâtiment (ou de la décoration) affiché dans la fiche
  let ficheMode = 'batiment';      // 'batiment' | 'decoration'
  let onglet = 'batiments';        // onglet de la fenêtre Construire
  let marche = { recoit: null, donne: null, lots: 1 };   // choix en cours au marché

  const $ = (id) => document.getElementById(id);
  const res = (id) => C.ressources.find(r => r.id === id);
  const famille = (id) => C.familles.find(f => f.id === id);
  // Aides partagées avec app.js (une seule version de chaque)
  const el = (...a) => A().el(...a);
  const nombre = (n) => A().nombre(n);
  const MAX = () => C.batiments.niveauMax;

  /* ===== TEXTES ===== */
  function effetTexte(type) {
    if (type === 'mairie') return 'Débloque les autres bâtiments et leurs niveaux';
    const f = famille(E.famille(type, C));
    const r = f?.ressource ? res(f.ressource) : null;
    return r ? `+${Math.round(C.batiments.bonusParNiveau * 100)} % de ${r.emoji} ${r.nom} par niveau (tâches ${f.emoji} ${f.nom})`
      : `+${Math.round(C.batiments.bonusParNiveau * 100)} % d'XP par niveau (tâches ${f.emoji} ${f.nom})`;
  }
  function raisonTexte(p) {
    if (p.bloque === 'mairie') return p.action === 'construire' ? '🔒 Construis d\'abord la Mairie' : `🔒 Monte la Mairie au niveau ${p.requis}`;
    if (p.bloque === 'niveauJoueur') return `🔒 Demande le niveau ${p.requis} de chef`;
    if (p.bloque === 'max') return '⭐ Niveau maximum atteint';
    if (p.bloque === 'endommage') return '🔧 À réparer d\'abord : touche « Voir » pour le remettre sur pied';   // carte grisée sinon muette
    return '';
  }
  // Pastilles de coût : vert si assez, rouge doux + « il manque » sinon
  function couts(p) {
    return el('div', { class: 'couts' }, ...Object.entries(p.cout).map(([r, q]) => {
      const manque = p.manque[r];
      return el('span', { class: 'cout' + (manque ? ' manque' : ''), title: res(r).nom },
        `${res(r).emoji} ${nombre(q)}`, manque ? el('small', {}, ` (−${nombre(manque)})`) : '');
    }));
  }
  // Conseil concret : quelles tâches font gagner ce qui manque
  function conseil(p) {
    const manques = Object.keys(p.manque);
    if (!manques.length) return '';
    const fams = manques.map(r => C.familles.find(f => f.ressource === r)).filter(Boolean);
    return `Encore un effort : des tâches ${fams.map(f => `${f.emoji} ${f.nom}`).join(', ')} et c'est à toi !`;
  }

  /* ===== BARRE DES RESSOURCES (en haut du village) ===== */
  function rendreHud(etat) {
    const j = etat.joueur;
    $('village-hud').replaceChildren(...C.ressources
      .filter(r => r.id !== 'gemmes' || j.ressources.gemmes > 0)
      .map(r => el('span', { class: 'hud-res', title: r.nom }, el('span', { 'aria-hidden': 'true' }, r.emoji), el('b', {}, nombre(j.ressources[r.id] || 0)))));
  }

  /* ===== FENÊTRE « CONSTRUIRE » ===== */
  function ouvrirConstruire(choix = onglet) {
    // Le village doit être prêt (sinon le placement n'aurait pas de scène où se faire)
    if (!window.Village.estPret()) return A().toast('Le village se prépare… encore une seconde.');
    onglet = choix;
    for (const b of document.querySelectorAll('#onglets-construire button')) b.setAttribute('aria-selected', String(b.dataset.onglet === onglet));
    if (onglet === 'decorations') rendreDecorations();
    else if (onglet === 'terrain') rendreTerrain();
    else if (onglet === 'marche') rendreMarche();
    else rendreBatiments();
    if (!$('feuille-construire').open) $('feuille-construire').showModal();
  }
  function rendreBatiments() {
    const etat = A().etat();
    const cartes = C.batiments.ordre.filter(type => CV.batiments[type]).map(type => {
      const def = CV.batiments[type], p = E.possibilite(etat, type, C), bat = E.batiment(etat, type);
      const fam = E.famille(type, C);
      const carte = el('div', { class: 'bat-carte' + (p.bloque && p.bloque !== 'max' ? ' verrou' : '') });
      carte.style.setProperty('--famille', fam ? `var(--${fam})` : 'var(--accent)');
      const texte = el('div', { class: 'bat-texte' },
        el('div', { class: 'bat-titre' }, el('b', {}, def.nom), el('span', { class: 'bat-niveau' }, `Niv. ${bat?.niveau ?? 0}/${MAX()}`)),
        el('small', {}, effetTexte(type)),
        p.action !== 'max' ? couts(p) : '',
        raisonTexte(p) ? el('p', { class: 'bat-raison' }, raisonTexte(p)) : '');
      let bouton;
      if (bat) bouton = el('button', { type: 'button', class: 'bouton', 'data-voir': bat.id }, 'Voir');
      else if (!p.bloque) bouton = el('button', { type: 'button', class: 'bouton principal', 'data-construire': type }, 'Construire');
      carte.append(el('div', { class: 'bat-icone', 'aria-hidden': 'true' }, def.emoji), texte, bouton || '');
      return carte;
    });
    $('liste-construire').replaceChildren(...cartes);
  }

  // Décorations : communes (ressources) et rares (gemmes, trouvées dans les coffres)
  function rendreDecorations() {
    const etat = A().etat();
    const cartes = Object.entries(C.decorations).map(([type, def]) => {
      const manque = E.manque(etat, def.cout);
      const p = { cout: def.cout, manque };
      const carte = el('div', { class: 'bat-carte deco' + (def.rare ? ' rare' : '') });
      carte.style.setProperty('--famille', def.rare ? 'var(--creation)' : 'var(--discipline)');
      carte.append(
        el('div', { class: 'bat-icone', 'aria-hidden': 'true' }, def.emoji),
        el('div', { class: 'bat-texte' },
          el('div', { class: 'bat-titre' }, el('b', {}, def.nom), def.rare ? el('span', { class: 'bat-niveau' }, '💠 Rare') : ''),
          couts(p)),
        el('button', { type: 'button', class: 'bouton' + (Object.keys(manque).length ? '' : ' principal'), 'data-decoration': type }, 'Placer'));
      return carte;
    });
    $('liste-construire').replaceChildren(el('p', { class: 'discret aide' }, 'Pour le plaisir des yeux ✨ Les décorations rares se paient en 💠 gemmes, trouvées dans les coffres.'), ...cartes);
  }

  // Terrain : agrandir le hameau d'un anneau
  function rendreTerrain() {
    const etat = A().etat();
    const p = E.possibiliteExtension(etat, C);
    const carte = el('div', { class: 'bat-carte terrain' });
    carte.style.setProperty('--famille', 'var(--repos)');
    const texte = el('div', { class: 'bat-texte' },
      el('div', { class: 'bat-titre' }, el('b', {}, 'Agrandir le hameau'), el('span', { class: 'bat-niveau' }, `${p.n}/${C.extensions.max}`)),
      el('small', {}, 'Une bande de terrain en plus tout autour : de la place pour tes décorations, et la rivière et les chemins qui continuent.'),
      p.max ? el('p', { class: 'bat-raison' }, '⭐ Ton hameau a atteint sa taille maximale') : couts(p));
    const bouton = p.max ? '' : el('button', { type: 'button', class: 'bouton' + (Object.keys(p.manque).length ? '' : ' principal'), id: 'btn-agrandir' }, 'Agrandir');
    carte.append(el('div', { class: 'bat-icone', 'aria-hidden': 'true' }, '🗺️'), texte, bouton);
    $('liste-construire').replaceChildren(carte);
  }

  /* ===== MARCHÉ (toujours ouvert, même avant la Mairie) ===== */
  // Choix proposé à l'ouverture : de quoi finir le prochain chantier, sinon donner le plus abondant pour le plus rare
  function preparerMarche(etat) {
    const ids = E.ressourcesMarche(C), r = etat.joueur.ressources;
    const ch = E.prochainChantier(etat, C);
    const plan = ch && E.planMarche(etat, ch.possibilite.cout, C);
    if (plan) return { recoit: plan[0].recoit, donne: plan[0].donne, lots: plan[0].lots };
    const tri = [...ids].sort((a, b) => (r[a] || 0) - (r[b] || 0));
    return { recoit: tri[0], donne: tri[tri.length - 1], lots: 1 };
  }
  function rendreMarche() {
    const etat = A().etat(), r = etat.joueur.ressources, ids = E.ressourcesMarche(C);
    if (!marche.recoit || !ids.includes(marche.recoit)) marche = preparerMarche(etat);
    const max = marche.donne && marche.donne !== marche.recoit ? E.lotsPossibles(etat, marche.donne, C) : 0;
    marche.lots = Math.max(1, Math.min(marche.lots, max || 1));
    const grille = (attr, choisi, desactive) => el('div', { class: 'segments grille-marche' }, ...ids.map(id => {
      const b = el('button', { type: 'button', [attr]: id, 'aria-pressed': String(id === choisi), 'aria-label': `${res(id).nom} (${r[id] || 0})` },
        `${res(id).emoji} ${nombre(r[id] || 0)}`);
      if (desactive(id)) b.disabled = true;
      return b;
    }));
    const prix = marche.lots * E.prixLot(C), recu = marche.lots * C.marche.lot;
    const possible = max >= marche.lots;
    const bouton = el('button', { type: 'button', class: 'bouton principal large', id: 'btn-echanger' },
      possible ? `💱 Échanger ${nombre(prix)} ${res(marche.donne).emoji} → ${nombre(recu)} ${res(marche.recoit).emoji}` : 'Choisis quoi donner');
    if (!possible) bouton.disabled = true;
    $('liste-construire').replaceChildren(
      el('p', { class: 'discret aide' }, `Le marchand du hameau échange ${C.marche.taux} contre 1 (${nombre(E.prixLot(C))} → ${nombre(C.marche.lot)}). Pratique quand une famille de tâches est plus calme.`),
      el('h3', { class: 'intertitre' }, 'Je reçois'),
      grille('data-marche-recoit', marche.recoit, () => false),
      el('h3', { class: 'intertitre' }, 'Je donne'),
      grille('data-marche-donne', marche.donne, id => id === marche.recoit || E.lotsPossibles(etat, id, C) < 1),
      el('div', { class: 'marche-lots' },
        el('button', { type: 'button', class: 'bouton', 'data-marche-lots': '-1', 'aria-label': 'Un lot de moins', ...(marche.lots <= 1 ? { disabled: '' } : {}) }, '−'),
        el('b', { id: 'marche-nb-lots' }, `${marche.lots} lot${marche.lots > 1 ? 's' : ''}`),
        el('button', { type: 'button', class: 'bouton', 'data-marche-lots': '1', 'aria-label': 'Un lot de plus', ...(marche.lots >= max ? { disabled: '' } : {}) }, '+')),
      bouton);
  }
  function echanger() {
    const app = A();
    let r;
    const ok = app.modifier(e => { r = E.echanger(e, marche.donne, marche.recoit, marche.lots, C); if (!r.ok) throw app.refus(r.erreur); });
    if (!ok) return;
    window.Sons?.jouer('pieces');
    app.vibrer('LIGHT');
    const [[d, qd]] = Object.entries(r.donne), [[g, qg]] = Object.entries(r.recoit);
    app.toast(`💱 Échange fait : −${nombre(qd)} ${res(d).emoji} · +${nombre(qg)} ${res(g).emoji}`);
    marche.lots = 1;
    rendreMarche();
  }
  // « Il manque… » : conseil de tâches, et le marché s'il suffit (bouton qui y mène, déjà réglé)
  async function dialogueManque(titre, p) {
    const plan = E.planMarche(A().etat(), p.cout, C);
    const texteMarche = plan ? `<p class="discret">💱 Ou tout de suite au marché : ${plan.map(x =>
      `${nombre(x.lots * E.prixLot(C))} ${res(x.donne).emoji} → ${nombre(x.lots * C.marche.lot)} ${res(x.recoit).emoji}`).join(' · ')}.</p>` : '';
    const choix = await A().dialogue(titre,
      `<p>Il manque encore : ${Object.entries(p.manque).map(([r, q]) => `<b>${nombre(q)} ${res(r).emoji}</b>`).join(', ')}.</p>` +
      `<p class="discret">${p.manque.gemmes ? 'Les 💠 gemmes se trouvent dans les coffres, au hasard des tâches terminées.' : conseil(p)}</p>` + texteMarche,
      plan ? [{ texte: 'Compris', valeur: false }, { texte: '💱 Au marché', valeur: 'marche', principal: true }]
        : [{ texte: 'Compris', valeur: true, principal: true }]);
    if (choix === 'marche') { marche = { recoit: plan[0].recoit, donne: plan[0].donne, lots: plan[0].lots }; ouvrirConstruire('marche'); }
  }

  // Fiche d'un bâtiment (améliorer, réparer) : si le marché suffit à combler ce qui manque, on le dit et on y mène
  let planFiche = null;
  function lienMarche(etat, cout) {
    planFiche = E.planMarche(etat, cout, C);
    if (!planFiche) return '';
    return el('div', { class: 'lien-marche' },
      el('p', { class: 'discret' }, '💱 Ou tout de suite au marché : ' + planFiche.map(x =>
        `${nombre(x.lots * E.prixLot(C))} ${res(x.donne).emoji} → ${nombre(x.lots * C.marche.lot)} ${res(x.recoit).emoji}`).join(' · ')),
      el('button', { type: 'button', class: 'bouton', id: 'btn-fiche-marche' }, '💱 Au marché'));
  }

  function decorationChoisie(type) {
    const etat = A().etat(), def = C.decorations[type];
    const manque = E.manque(etat, def.cout);
    $('feuille-construire').close();
    if (Object.keys(manque).length) { dialogueManque(`${def.emoji} ${def.nom}`, { manque, cout: def.cout }); return; }
    commencerPlacement({ type, deco: true });
  }

  function agrandir() {
    const app = A();
    let r;
    const ok = app.modifier(e => { r = E.agrandir(e, C); if (!r.ok) throw app.refus(r.erreur); });
    $('feuille-construire').close();
    if (!ok) return;
    window.Sons?.jouer('fanfare');
    app.vibrer('MEDIUM');
    const t = window.Village.terrain();
    window.Village.centrer((t.min.gx + t.max.gx) / 2, (t.min.gy + t.max.gy) / 2, 0.42);
    app.toast(`🌄 Le hameau s'agrandit ! (${r.extensions}/${C.extensions.max})`);
  }

  function construireChoisi(type) {
    const etat = A().etat();
    const p = E.possibilite(etat, type, C);
    $('feuille-construire').close();
    if (!E.faisable(p)) {
      // On laisse quand même choisir l'emplacement ? Non : on explique ce qui manque, avec un conseil (et le marché)
      dialogueManque(`${CV.batiments[type].emoji} ${CV.batiments[type].nom}`, p);
      return;
    }
    commencerPlacement({ type });
  }

  /* ===== PLACEMENT LIBRE ===== */
  function commencerPlacement({ type, batId, deco = false, decoId }) {
    if (!window.Village.estPret()) return A().toast('Le village se prépare… encore une seconde.');
    placement = { type, batId, deco, decoId };
    const def = deco ? C.decorations[type] : CV.batiments[type];
    document.body.classList.add('village-placement-actif');
    $('village-placement').hidden = false;
    $('placement-titre').textContent = `${def.emoji} ${batId || decoId ? 'Déplacer' : 'Placer'} : ${def.nom}`;
    window.Village.placer({ type, batId, deco, decoId }, ({ libre }) => {
      $('placement-texte').textContent = libre ? 'Bel emplacement ✨ Valide quand tu veux.' : 'Case occupée : touche une autre case.';
      $('btn-placer').disabled = !libre;
    });
  }
  function finirPlacement() {
    placement = null;
    window.Village.quitterPlacement();
    $('village-placement').hidden = true;
    document.body.classList.remove('village-placement-actif');
  }
  function validerPlacement() {
    const choix = window.Village.validerPlacement();
    if (!choix || !placement) return;
    const { type, batId, deco, decoId } = placement;
    const app = A();
    let r;
    if (deco) {
      const def = C.decorations[type];
      const id = decoId || app.nouvelId();
      const ok = app.modifier(e => {
        r = decoId ? E.deplacerDecoration(e, decoId, choix.gx, choix.gy)
          : E.acheterDecoration(e, type, choix.gx, choix.gy, { id }, C);
        if (!r.ok) throw app.refus(r.erreur);
      });
      finirPlacement();
      if (!ok) return;
      if (!decoId) window.Sons?.jouer('pieces');
      window.Village.animer('pose', id);
      app.toast(decoId ? `${def.emoji} ${def.nom} a changé de place` : `${def.emoji} ${def.nom} : joli !`);
      return;
    }
    if (batId) {
      const ok = app.modifier(e => { r = E.deplacer(e, batId, choix.gx, choix.gy); if (!r.ok) throw app.refus(r.erreur); });
      finirPlacement();
      if (ok) { window.Village.animer('pose', batId); app.toast(`${CV.batiments[type].emoji} ${CV.batiments[type].nom} a changé de place`); }
      return;
    }
    const id = app.nouvelId();
    const ok = app.modifier(e => {
      r = E.construire(e, type, choix.gx, choix.gy, { id, quand: app.maintenant().toISOString() }, C);
      if (!r.ok) throw app.refus(r.erreur);
    });
    finirPlacement();
    if (!ok) return;
    window.Sons?.jouer('pieces');
    app.vibrer('MEDIUM');
    window.Village.animer('pose', id);
    const def = CV.batiments[type];
    app.toast(type === 'mairie' ? `${def.emoji} Ta Mairie est construite ! Les autres chantiers sont ouverts.` : `${def.emoji} ${def.nom} : c'est construit ! ${effetTexte(type).split(' (')[0]}`);
  }

  /* ===== FICHE D'UN BÂTIMENT ===== */
  function ouvrirFiche(id) {
    const etat = A().etat();
    const bat = (etat.village?.batiments || []).find(b => b.id === id);
    if (!bat) return;
    ficheOuverte = id;
    const def = CV.batiments[bat.type], p = E.possibilite(etat, bat.type, C), fam = E.famille(bat.type, C);
    const f = famille(fam);
    $('fiche-icone').textContent = def.emoji;
    $('feuille-batiment').style.setProperty('--famille', fam ? `var(--${fam})` : 'var(--accent)');
    $('fiche-nom').textContent = def.nom;
    $('fiche-etoiles').replaceChildren(...Array.from({ length: MAX() }, (_, i) => el('span', { class: i < bat.niveau ? 'pleine' : '' }, '★')));
    $('fiche-etoiles').setAttribute('aria-label', `Niveau ${bat.niveau} sur ${MAX()}`);
    // Effet actuel
    let effet;
    if (bat.type === 'mairie') effet = `Les autres bâtiments peuvent monter jusqu'au niveau ${bat.niveau}.`;
    else {
      const bonus = E.bonus(etat, fam, C);
      const r = f.ressource ? res(f.ressource) : null;
      effet = bonus > 0 ? `Tes tâches ${f.emoji} ${f.nom} rapportent +${Math.round(bonus * 100)} % ${r ? r.emoji : 'XP'}.`
        : bat.endommage ? 'Bonus en pause : le bâtiment a besoin d\'une réparation.'
          : 'Bonus en pause tant que le moral est bas : une petite tâche 🌿 Repos ?';
    }
    $('fiche-effet').textContent = effet;
    // Niveau suivant (ou réparation d'abord)
    const zone = $('fiche-suite');
    ficheMode = 'batiment';
    $('btn-deplacer').hidden = false;
    if (bat.endommage) {
      const cout = E.coutReparation(bat.type, bat.niveau, C), manque = E.manque(etat, cout);
      const bouton = el('button', { type: 'button', class: 'bouton principal large', id: 'btn-reparer' }, '🔧 Réparer');
      if (Object.keys(manque).length) bouton.disabled = true;
      zone.replaceChildren(
        el('p', { class: 'bat-raison' }, '⚠️ Abîmé par un incendie : son bonus reviendra dès la réparation.'),
        el('h3', { class: 'intertitre' }, 'Réparation'),
        couts({ cout, manque }),
        Object.keys(manque).length ? el('p', { class: 'discret' }, conseil({ manque })) : '',
        lienMarche(etat, cout),
        bouton);
    } else if (p.action === 'max') {
      zone.replaceChildren(el('p', { class: 'fiche-max' }, '⭐ Niveau maximum. Superbe travail !'));
    } else {
      const bouton = el('button', { type: 'button', class: 'bouton principal large', id: 'btn-ameliorer' }, `⬆️ Améliorer au niveau ${p.niveauCible}`);
      const faisable = E.faisable(p);
      if (!faisable) bouton.disabled = true;
      zone.replaceChildren(
        el('h3', { class: 'intertitre' }, `Niveau ${p.niveauCible}`),
        couts(p),
        raisonTexte(p) ? el('p', { class: 'bat-raison' }, raisonTexte(p)) : (!faisable ? el('p', { class: 'discret' }, conseil(p)) : ''),
        p.bloque ? '' : lienMarche(etat, p.cout),
        bouton);
    }
    $('feuille-batiment').showModal();
  }

  function ameliorer() {
    const app = A();
    const id = ficheOuverte;
    let r;
    const ok = app.modifier(e => { r = E.ameliorer(e, id, C); if (!r.ok) throw app.refus(r.erreur); });
    $('feuille-batiment').close();
    if (!ok) return;
    window.Sons?.jouer('pieces');
    app.vibrer('MEDIUM');
    window.Village.animer('amelioration', id);
    const def = CV.batiments[r.batiment.type];
    app.toast(`${def.emoji} ${def.nom} : niveau ${r.batiment.niveau} !`);
  }

  // Fiche d'une décoration : la même feuille, en plus simple
  function ouvrirFicheDecoration(id) {
    const d = (A().etat().village?.decorations || []).find(x => x.id === id);
    if (!d) return;
    const def = C.decorations[d.type];
    ficheOuverte = id;
    ficheMode = 'decoration';
    $('feuille-batiment').style.setProperty('--famille', def.rare ? 'var(--creation)' : 'var(--discipline)');
    $('fiche-icone').textContent = def.emoji;
    $('fiche-nom').textContent = def.nom;
    $('fiche-etoiles').replaceChildren(el('span', { class: 'fiche-type' }, def.rare ? '💠 Décoration rare' : 'Décoration'));
    $('fiche-etoiles').removeAttribute('aria-label');
    $('fiche-effet').textContent = 'Pour le plaisir des yeux ✨ Tu peux la déplacer quand tu veux.';
    $('btn-deplacer').hidden = false;
    $('fiche-suite').replaceChildren(el('button', { type: 'button', class: 'lien danger', id: 'btn-retirer' }, '🗑️ Retirer cette décoration'));
    $('feuille-batiment').showModal();
  }
  async function retirerDecoration() {
    const app = A();
    const id = ficheOuverte;
    const ok = await app.dialogue('Retirer la décoration ?', '<p class="discret">Elle disparaît du hameau (ce qu\'elle a coûté n\'est pas rendu).</p>',
      [{ texte: 'Garder', valeur: false }, { texte: 'Retirer', valeur: true, principal: true }]);
    if (!ok) return;
    $('feuille-batiment').close();
    let r;
    if (app.modifier(e => { r = E.retirerDecoration(e, id); if (!r.ok) throw app.refus(r.erreur); })) app.toast('Décoration retirée');
  }
  function reparer() {
    const app = A();
    const id = ficheOuverte;
    let r;
    const ok = app.modifier(e => { r = E.reparer(e, id, C); if (!r.ok) throw app.refus(r.erreur); });
    $('feuille-batiment').close();
    if (!ok) return;
    window.Village.animer('reparation', id);
    app.vibrer('MEDIUM');
    const def = CV.batiments[r.batiment.type];
    app.toast(`🔧 ${def.emoji} ${def.nom} est comme neuf ! Son bonus est de retour.`);
  }

  /* ===== BULLE D'ACCUEIL (1re visite) ===== */
  const CLE_BULLE = 'hameau_village_bulle_vue';
  function afficherBulle() {
    let vue = false;
    try { vue = localStorage.getItem(CLE_BULLE) === '1'; } catch {}
    $('village-bulle').hidden = vue;
  }

  /* ===== ÉVÉNEMENTS ===== */
  window.addEventListener('village-pret', afficherBulle);
  $('village-bulle-ok')?.addEventListener('click', () => {
    $('village-bulle').hidden = true;
    try { localStorage.setItem(CLE_BULLE, '1'); } catch {}
  });
  $('btn-construire').addEventListener('click', () => { window.Sons?.jouer('clic'); ouvrirConstruire(); });
  $('onglets-construire').addEventListener('click', (e) => {
    const b = e.target.closest('[data-onglet]');
    if (b) { window.Sons?.jouer('clic'); ouvrirConstruire(b.dataset.onglet); }
  });
  $('liste-construire').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.construire) construireChoisi(b.dataset.construire);
    if (b?.dataset.decoration) decorationChoisie(b.dataset.decoration);
    if (b?.dataset.marcheRecoit) { marche.recoit = b.dataset.marcheRecoit; if (marche.donne === marche.recoit) marche.donne = null; rendreMarche(); }
    if (b?.dataset.marcheDonne) { marche.donne = b.dataset.marcheDonne; rendreMarche(); }
    if (b?.dataset.marcheLots) { marche.lots += Number(b.dataset.marcheLots); rendreMarche(); }
    if (b?.id === 'btn-echanger') echanger();
    if (b?.id === 'btn-agrandir') {
      const p = E.possibiliteExtension(A().etat(), C);
      if (Object.keys(p.manque).length) {
        $('feuille-construire').close();
        dialogueManque('🗺️ Agrandir le hameau', p);
      } else agrandir();
    }
    if (b?.dataset.voir) {
      $('feuille-construire').close();
      const bat = A().etat().village.batiments.find(x => x.id === b.dataset.voir);
      window.Village.centrer(bat.x, bat.y);
      ouvrirFiche(bat.id);
    }
  });
  $('btn-placer').addEventListener('click', validerPlacement);
  $('btn-placement-annuler').addEventListener('click', finirPlacement);
  $('feuille-batiment').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) return e.currentTarget.close();
    if (e.target.closest('#btn-ameliorer')) ameliorer();
    if (e.target.closest('#btn-fiche-marche') && planFiche) {
      $('feuille-batiment').close();
      marche = { recoit: planFiche[0].recoit, donne: planFiche[0].donne, lots: planFiche[0].lots };
      ouvrirConstruire('marche');
    }
    if (e.target.closest('#btn-reparer')) reparer();
    if (e.target.closest('#btn-retirer')) retirerDecoration();
    if (e.target.closest('#btn-deplacer')) {
      $('feuille-batiment').close();
      if (ficheMode === 'decoration') {
        const d = A().etat().village.decorations.find(x => x.id === ficheOuverte);
        if (d) commencerPlacement({ type: d.type, deco: true, decoId: d.id });
      } else {
        const bat = A().etat().village.batiments.find(x => x.id === ficheOuverte);
        if (bat) commencerPlacement({ type: bat.type, batId: bat.id });
      }
    }
  });
  $('feuille-construire').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  window.Village.surBatiment((id) => { if (!placement) ouvrirFiche(id); });
  window.Village.surDecoration((id) => { if (!placement) ouvrirFicheDecoration(id); });

  window.VillageUI = {
    rendre(etat) { rendreHud(etat); },
    // Bouton retour Android : d'abord annuler un placement en cours
    retour() { if (placement) { finirPlacement(); return true; } return false; },
    quitter() { if (placement) finirPlacement(); },
  };
})();

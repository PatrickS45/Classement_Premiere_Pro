# Cahier des charges — Plugin UXP Premiere Pro : audit, nettoyage & rangement de projet

> Document de spécification destiné à Claude Code.
> Nom de travail : à définir (gamme cohérente avec ClipKeeper, voir §11).
> Objectif : un plugin **UXP** pour Premiere Pro qui audite un projet, retire les médias inutilisés, et range automatiquement les clips en chutiers (bins) selon des règles configurables.

---

## 1. Contexte et décision d'architecture

L'auteur édite sous Premiere Pro 2026 (Windows 11) et possède déjà **ClipKeeper**, un plugin de re-link écrit en **CEP/ExtendScript**.

**Décision arrêtée : ce nouvel outil est un plugin UXP AUTONOME.**
- Il ne fusionne PAS avec ClipKeeper. CEP et UXP sont deux runtimes incompatibles ; on ne greffe pas un module UXP sur un plugin CEP.
- ClipKeeper n'est pas modifié par ce projet. Sa migration éventuelle vers UXP est un sujet séparé et ultérieur (lié à la fin de support CEP/ExtendScript en septembre 2026), hors périmètre ici.
- Le lien avec ClipKeeper est **de marque et d'UI** (identité visuelle, conventions d'interface communes), PAS de code. Voir §11.

**Critère de périmètre (anti « usine à gaz ») :** deux fonctions cohabitent dans ce plugin seulement si l'utilisateur les exécute dans le même moment de travail. Nettoyer et ranger relèvent du même moment (« entretien du projet ») → un seul plugin. Le re-link relève d'un autre moment (« réparer une urgence ») → reste dans ClipKeeper, hors de ce plugin.

---

## 2. Plateforme technique

- **Techno : UXP** (Unified Extensibility Platform), pas CEP.
- **Cible de développement : Premiere Pro 2026 (build 26.x), Windows 11.**
- **API utilisées :**
  - **Premiere DOM API** (`require("premierepro")`) — accès au projet, bins, projectItems, séquences, trackItems.
  - **UXP Core API** — interface du panneau (HTML/CSS/JS ou composants Adobe Spectrum), accès fichier (`require("fs")`) pour la config et l'export de rapports.
- **Déclarations TypeScript :** utiliser le package officiel `@adobe/premierepro` (canal stable : `npm install -D @adobe/premierepro`) pour l'autocomplétion et la vérification des API disponibles.
- **Outils :** UXP Developer Tool pour charger/recharger le plugin ; mode développeur activé dans Premiere (Settings → Plugins → Enable developer mode).

### ⚠️ Contrainte de versioning (critique pour un produit vendu)
La version de Premiere détermine les API DOM disponibles ; la version UXP intégrée détermine les API Core disponibles (ex. Premiere 25.6 = UXP 8.1). Un plugin qui appelle une API absente de la version de l'utilisateur **plante**.
- Déclarer une **version minimale de Premiere** supportée dans le `manifest.json`.
- Ne cibler que des API présentes dans cette version minimale, OU prévoir une logique de repli (`if (typeof api === "function")`) pour les API récentes.
- Tester sur la version minimale annoncée, pas seulement sur 2026.

---

## 3. ⚠️ TÂCHE N°0 — à valider AVANT tout le reste

**Récupérer de façon fiable la liste de tous les clips réellement utilisés dans toutes les séquences du projet.**

C'est la fondation de l'audit et du nettoyage. Si ce calcul est faux, l'outil retire des clips utilisés → désastre pour un produit vendu.

### Difficultés à traiter explicitement
1. Parcourir **toutes les séquences**, **toutes les pistes** (vidéo + audio), **tous les trackItems**.
2. Remonter chaque trackItem à son `projectItem` source.
3. **Séquences imbriquées** : un clip utilisé uniquement dans une séquence A, elle-même posée dans une séquence B, est utilisé. Gérer la récursion.
4. **Séquences elles-mêmes inutilisées** : décider du traitement (une séquence dans aucune autre séquence est-elle « inutilisée » ? Par défaut : NON, une séquence n'est jamais auto-supprimée — voir §6 garde-fous).
5. Clips multicam, clips fusionnés (merged clips), sous-éléments : à inventorier et tester.

### Livrable de la tâche n°0
Une fonction `getUsedProjectItems()` retournant l'ensemble des projectItems référencés par au moins une séquence (récursion incluse), + un jeu de tests sur un projet réel contenant : séquences imbriquées, multicam, doublons. **Ne pas construire l'UI ni le nettoyage tant que cette fonction n'est pas prouvée correcte.**

---

## 4. Périmètre fonctionnel — 3 modules

Un panneau, trois onglets : **Audit → Nettoyage → Rangement**. Ils s'enchaînent logiquement.

### Module A — Audit (lecture seule, ne modifie rien)
Scanne le projet et affiche un rapport :
- Clips **orphelins** : projectItems présents dans aucune séquence (résultat de la tâche n°0, inversé).
- **Doublons** : même fichier source importé plusieurs fois. Peut s'appuyer sur la fonction native « Consolidate Duplicate Footage » de Premiere si exposée en UXP, sinon comparaison par chemin de média.
- Médias **hors-ligne** (offline).
- **Bins vides**.
- Compteurs et taille estimée.
Aucune action destructive dans cet onglet. C'est un diagnostic.

### Module B — Nettoyage (action, avec garde-fous §6)
À partir de l'audit, l'utilisateur coche ce qu'il retire :
- Clips orphelins.
- Bins vides.
- Doublons (en gardant une occurrence).
**Toujours : retrait du PROJET uniquement. Jamais de suppression sur le disque.**
Aperçu obligatoire (liste de ce qui sera retiré) + confirmation avant exécution.

### Module C — Rangement automatique en chutiers (bins)
Crée des bins et y déplace les clips selon une **hiérarchie de critères configurable**.

Critères demandés (l'utilisateur choisit lesquels activer ET leur ordre) :
1. **Type** : vidéo / audio / image / graphique (MOGRT, titres).
2. **Résolution / fréquence d'image** : ex. `1920x1080_25`, `3840x2160_30`.
3. **Nom / préfixe** : regrouper par préfixe de nom de fichier (ex. `interview_*`, `broll_*`).

La hiérarchie produit une arborescence de bins imbriqués. Exemple avec ordre [Type → Résolution → Préfixe] :
```
Vidéo/
  1920x1080_25/
    interview_/   ← clips interview_001, interview_002…
    broll_/
  3840x2160_30/
Audio/
Images/
```
L'utilisateur doit pouvoir **réordonner les critères** (Type d'abord ou Préfixe d'abord change toute l'arbo) et **désactiver** ceux qu'il ne veut pas.

---

## 5. Configuration éditable

Toute la config dans un fichier JSON séparé (chargé via UXP `fs`), facilement modifiable, idéalement éditable depuis l'UI :

```json
{
  "rangement": {
    "ordre_criteres": ["type", "resolution_fps", "prefixe"],
    "criteres_actifs": { "type": true, "resolution_fps": true, "prefixe": true },
    "prefixe": { "separateur": "_", "longueur_min": 2 }
  },
  "nettoyage": {
    "retirer_orphelins": true,
    "retirer_bins_vides": true,
    "gerer_doublons": "garder_un",
    "jamais_supprimer_disque": true
  },
  "compatibilite": {
    "version_premiere_min": "25.0"
  }
}
```

---

## 6. Garde-fous (NON négociables — produit vendu)

Un outil payant qui retire des éléments doit être à toute épreuve. Un faux positif = avis négatif immédiat.

- **JAMAIS de suppression sur le disque.** Le plugin retire des projectItems du projet ; les fichiers restent intacts. À documenter clairement pour l'utilisateur.
- **Aperçu + confirmation obligatoires** avant toute action des modules B et C.
- **Aucune séquence n'est jamais retirée automatiquement**, même si elle n'est utilisée nulle part (une séquence « inutilisée » est souvent un livrable ou un travail en cours).
- **Gérer les séquences imbriquées** dès la v1 (cf. tâche n°0). C'est le cas où un faux positif détruit la confiance.
- **Rapport post-action** : liste exacte de ce qui a été retiré / déplacé, avec statut par élément. Aucune opération silencieuse.
- **Mode simulation (dry-run)** : pouvoir lancer audit + aperçu sans rien modifier.
- Idéalement : sauvegarde du projet (ou invitation à sauvegarder) avant une opération de nettoyage.

---

## 7. Interface (panneau UXP)

- Panneau persistant (Window → UXP Plugins → [nom]).
- Trois onglets : Audit / Nettoyage / Rangement.
- **Audit** : bouton « Scanner », puis listes par catégorie (orphelins, doublons, offline, bins vides) avec compteurs.
- **Nettoyage** : cases à cocher par catégorie + zone d'aperçu de ce qui sera retiré + bouton « Nettoyer » + confirmation.
- **Rangement** : éditeur d'ordre des critères (drag ou flèches), cases d'activation, **aperçu de l'arborescence de bins générée** avant exécution, bouton « Ranger ».
- Zone de compte-rendu commune après chaque action.
- Composants : privilégier Adobe Spectrum (cohérence visuelle native UXP) + identité de marque commune avec ClipKeeper (§11).

---

## 8. Étapes de développement (ordre imposé)

0. **Tâche n°0** : `getUsedProjectItems()` + tests. Bloquant.
1. Squelette UXP : `manifest.json` (permissions fs, version min), panneau vide qui charge dans Premiere 2026, accès `require("premierepro")` vérifié par un appel trivial (lister les projectItems racine).
2. Module Audit (lecture seule) : orphelins (depuis tâche n°0), bins vides, offline, doublons.
3. Aperçu + compte-rendu (UI commune).
4. Module Nettoyage : retrait projet + garde-fous + confirmation.
5. Module Rangement : moteur de classification (type / résolution-fps / préfixe), création de bins imbriqués, aperçu d'arbo, déplacement.
6. Config JSON + édition depuis l'UI.
7. Gestion du versioning / compatibilité (repli sur API récentes).
8. Habillage visuel cohérent avec ClipKeeper.

---

## 9. Critères d'acceptation

- [ ] Tâche n°0 prouvée : aucun clip utilisé (y compris via séquence imbriquée) n'est jamais classé orphelin.
- [ ] Audit liste correctement orphelins, doublons, offline, bins vides sans rien modifier.
- [ ] Nettoyage retire uniquement ce qui est coché, du projet seulement, jamais du disque.
- [ ] Aucune séquence n'est jamais retirée automatiquement.
- [ ] Rangement crée l'arborescence de bins conforme à l'ordre de critères choisi ; aperçu fidèle avant exécution.
- [ ] L'ordre des critères est réordonnable et chaque critère désactivable.
- [ ] Config éditable sans recompiler.
- [ ] Compte-rendu lisible après chaque action ; mode dry-run fonctionnel.
- [ ] Le plugin déclare une version Premiere minimale et ne plante pas sur cette version.

---

## 10. Points à confirmer par l'utilisateur

1. **Nom du plugin** et version Premiere minimale à supporter commercialement (impacte le ciblage d'API).
2. Comportement sur les **doublons** : garder la première occurrence, ou demander à chaque fois ?
3. Que faire d'un clip qui ne matche **aucun critère** de rangement : le laisser à la racine, ou créer un bin « Non classé » ?
4. Les **séquences** doivent-elles être rangées elles aussi (dans un bin « Séquences »), ou laissées telles quelles ?

---

## 11. Cohérence avec ClipKeeper (marque, pas code)

- **Pas de couplage de code** : plugin indépendant, runtime UXP distinct de ClipKeeper (CEP).
- **Cohérence visuelle** : reprendre l'identité de ClipKeeper (palette, logo, conventions de boutons et de libellés) pour que les deux se perçoivent comme une gamme.
- **Positionnement gamme** : « outils de gestion de projet Premiere » regroupant ClipKeeper (re-link) + ce plugin (nettoyage/rangement). Possibilité de bundle commercial plus tard, sans fusion technique.
- **Migration ClipKeeper → UXP** : hors périmètre de ce projet. À considérer séparément avant septembre 2026 (fin de support CEP/ExtendScript annoncée), une fois l'expérience UXP acquise sur ce plugin-ci.

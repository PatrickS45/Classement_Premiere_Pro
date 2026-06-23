# Plan de conception — BinKeeper (plugin UXP Premiere Pro)

Référence : `cdc-plugin-rangement-premiere-uxp.md`. Ce document fige les choix
techniques après vérification de l'API UXP réelle, et trace la route §8.

## Verdict de faisabilité

**Faisable.** Toutes les exigences correspondent à des API UXP existantes depuis
**Premiere 25.0**. Un seul vrai trou d'API : la **résolution** des clips (voir
§Risque). Décisions §10 actées : bin **« Non classé »** pour les clips sans
critère ; **séquences laissées telles quelles** (jamais rangées ni supprimées).

## Architecture

Séparation stricte **logique pure ↔ accès Premiere**, pour rendre la tâche n°0
prouvable hors de Premiere :

```
src/core/usedItems.js   logique PURE : used set, orphelins, doublons, offline, bins vides
src/core/classify.js    logique PURE : moteur de rangement (critères réordonnables)
src/api/pproAdapter.js   COUCHE FINE : require("premierepro") -> ProjectModel + actions
src/index.html|main.js   panneau 3 onglets
test/*.test.js           tests Node (node --test) — exécutables SANS Premiere
```

Toute mutation (modules B/C) passe par le pattern **Action + Transaction** :
`create…Action()` → aperçu → `project.executeTransaction(...)`. Bénéfices natifs :
aperçu fidèle, **annulation d'un seul Ctrl+Z**, zéro opération silencieuse (CDC §6).

## Mapping CDC → API UXP confirmée

| Besoin (CDC) | API UXP |
|---|---|
| Toutes les séquences | `Project.getSequences()` |
| Pistes / trackItems | `Sequence.getVideoTrackCount/getVideoTrack(i)`, idem audio ; `Track.getTrackItems(Clip,false)` |
| trackItem → source | `TrackItem.getProjectItem()` |
| Séquence imbriquée | source = projectItem séquence → `ClipProjectItem.isSequence()` → récursion |
| Multicam / merged | `isMulticamClip()` / `isMergedClip()` |
| Doublons | `ClipProjectItem.getMediaFilePath()` (comparaison normalisée) |
| Hors-ligne | `ClipProjectItem.isOffline()` |
| Bins vides | `FolderItem.getItems().length === 0` |
| Retrait projet (pas disque) | `FolderItem.createRemoveItemAction(item)` dans transaction |
| Créer bin | `FolderItem.createBinAction(name, makeUnique)` |
| Déplacer clip | `FolderItem.createMoveItemAction(item, newParent)` |
| fps | `FootageInterpretation.getFrameRate()` |
| Annulation | `Project.executeTransaction(cb, undoString)` |

## ⚠️ Risque unique à lever : la résolution

`FootageInterpretation` expose `getFrameRate()` et `getPixelAspectRatio()` mais
**pas** width/height. Le critère de rangement `resolution_fps` (CDC §4) en dépend.
- **Piste** : `getProjectColumnsMetadata()` → parser la colonne « Video Info »
  (`"1920 x 1080"`), ou via `getMedia()`.
- **Repli propre** : le critère `resolution_fps` est désactivable (déjà géré par
  `classify.js`) ; un clip sans résolution saute simplement ce niveau.
- **Action** : prototyper cette extraction sur projet réel **avant** le module C.

## Garde-fous (CDC §6) — comment ils sont tenus

- Jamais de suppression disque : on n'appelle que `createRemoveItemAction` (retrait projet).
- Aperçu + confirmation : actions générées et listées avant `executeTransaction`.
- Séquences jamais auto-retirées : `findOrphans` exclut `kind === 'sequence'`.
- Imbrication gérée dès v1 : prouvée par tests (cycles inclus).
- Dry-run : générer l'aperçu sans exécuter la transaction.

## État d'avancement (ordre §8)

- [x] **0. Tâche n°0** — `getUsedProjectItemIds` + audit + classification, **22 tests verts**.
- [x] **1. Squelette UXP** — `manifest.json` (minVersion 25.0, perms fs), panneau
  3 onglets, Audit branché sur l'adaptateur (`require("premierepro")` trivial).
- [x] **2. Module Audit** — affichage par catégorie (orphelins, doublons, offline, bins vides).
- [x] **3. Aperçu + compte-rendu** communs (dry-run gating des boutons + zone report).
- [x] **4. Module Nettoyage** — `planCleanup` (testé) + `executeCleanup` (transaction, confirmation).
- [x] **5. Module Rangement** — `planArrange` (testé) + `executeArrange` (createBin/move en transaction).
      Parsing résolution prototypé et testé (`resolution.js`) ; reste à valider `getProjectColumnsMetadata` en Premiere.
- [ ] **6. Config JSON éditable depuis l'UI** (défauts en place via `config.js` ; persistance fs à câbler).
- [ ] **7. Compatibilité / repli API récentes.**
- [ ] **8. Habillage cohérent ClipKeeper.**

> Les modules 4/5 sont fonctionnellement complets mais leur couche d'exécution
> (`pproAdapter`) n'est pas exécutable hors de Premiere : à valider via UXP
> Developer Tool avant mise en vente (cf. §Vérifications).

## Vérifications à faire dans Premiere (UXP Developer Tool)

L'adaptateur est la seule couche non testable ici. À confirmer sur 25.0 :
1. Cast `ProjectItem` → `FolderItem` / `ClipProjectItem` (signatures de `cast`).
2. Chargement du panneau + un scan réel (Audit) sans erreur.
3. Extraction résolution (cf. §Risque).

## Tests

```
npm test    # node --test  → 14/14
```

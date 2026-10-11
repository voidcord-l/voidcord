# VoidCord

VoidCord est un mod de client Discord basé sur [Equicord](https://github.com/Equicord/Equicord), lui-même un fork de [Vencord](https://github.com/Vendicated/Vencord). Il ajoute un système de plugins à Discord (bureau et navigateur) et embarque un ensemble de plugins personnalisés.

## Contenu du dépôt

| Dossier | Rôle |
| --- | --- |
| `src/plugins` | Plugins intégrés (Vencord) |
| `src/equicordplugins` | Plugins intégrés (Equicord) |
| `src/userplugins` | Plugins personnalisés de VoidCord |
| `src/api`, `src/components`, `src/utils`, `src/webpack` | Cœur du mod : APIs, composants, utilitaires, patching webpack |
| `src/main`, `src/preload.ts` | Code côté Electron (processus principal et preload) |
| `browser/` | Extension navigateur et userscript |
| `scripts/` | Scripts de build, lint et génération |
| `packages/` | Types Discord / Vencord |
| `misc/` | Documentation interne et script d'installation |

## Prérequis

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) 22 ou plus
- [pnpm](https://pnpm.io/) : `npm i -g pnpm`

> Ne lance **pas** les commandes suivantes en administrateur/root, cela peut casser ton installation de Discord.

## Installation

```shell
git clone https://github.com/<ton-organisation>/VoidCord.git
cd VoidCord
pnpm install --frozen-lockfile
```

## Utilisation

| Commande | Description |
| --- | --- |
| `pnpm build` | Compile le mod pour le client bureau |
| `pnpm watch` | Recompile automatiquement à chaque modification |
| `pnpm inject` | Injecte le mod dans ton client Discord |
| `pnpm uninject` | Retire le mod de Discord |
| `pnpm repair` | Répare une injection cassée |
| `pnpm buildWeb` | Compile l'extension navigateur (ZIP dans `dist/`) |
| `pnpm lint` | Vérifie le style du code |
| `pnpm testTsc` | Vérifie les types TypeScript |
| `pnpm test` | Lance l'ensemble des vérifications |

Pour un premier lancement :

```shell
pnpm build
pnpm inject
```

Redémarre ensuite Discord. Pour l'extension navigateur, utilise `pnpm buildWeb` puis charge le ZIP généré dans `dist/` selon la procédure de ton navigateur (Firefox nécessite la version Developer Edition).

## Créer un plugin

Ajoute un dossier dans `src/userplugins/<nomDuPlugin>/` avec un fichier `index.ts(x)` qui exporte un plugin via `definePlugin`, puis relance `pnpm build`. Consulte [CONTRIBUTING.md](./CONTRIBUTING.md) pour les conventions.

## Crédits

- [Equicord](https://github.com/Equicord/Equicord) et [Vencord](https://github.com/Vendicated/Vencord), sur lesquels VoidCord est basé.

## Licence

Distribué sous licence GPL-3.0-or-later, voir [LICENSE](./LICENSE).

## Avertissement

Discord est une marque de Discord Inc., mentionnée uniquement à titre descriptif, sans affiliation ni approbation de leur part.

Les modifications de client sont contraires aux conditions d'utilisation de Discord. Le risque de sanction est faible en pratique, mais utilise ce projet à tes risques et périls.

# <img src="https://avatars.githubusercontent.com/u/340958005?s=60&v=4" width="40" align="center" /> VoidCord

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
| `app/` | Application de bureau portable (coque Electron dérivée d'Equibop) |

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

## Application portable (.exe)

VoidCord existe aussi en application autonome, sur le modèle d'[Equibop](https://github.com/Equicord/Equibop) : un exécutable Windows portable qui lance Discord avec le mod et tous les plugins VoidCord **déjà intégrés**. Pas d'installation, pas de droits administrateur, rien n'est injecté dans un Discord installé.

### Utilisation

1. Télécharge `VoidCord-Portable-x.y.z.exe` depuis la page [Releases](../../releases).
2. Double-clique dessus. Au premier lancement, un assistant de configuration s'affiche, puis Discord s'ouvre avec les plugins.
3. Tes réglages, plugins, thèmes et ta session sont stockés dans un dossier `VoidCord-Data` créé **à côté de l'exe**. Pour le transporter (clé USB, autre PC), copie l'exe et ce dossier ensemble.

L'exe contient le mod : il n'y a pas de mise à jour automatique. Pour mettre à jour, télécharge la nouvelle version.

> L'exe n'est pas signé : Windows SmartScreen peut afficher un avertissement au premier lancement (« Informations complémentaires » puis « Exécuter quand même »).

### Compiler l'exe soi-même

Prérequis : Node.js 22+, [pnpm](https://pnpm.io/) et [Bun](https://bun.sh/).

```shell
# 1. Compiler le mod (génère dist/equibop.asar, embarqué dans l'exe)
pnpm install --frozen-lockfile
pnpm build

# 2. Empaqueter l'application
cd app
bun install
bunx electron-builder --win portable --x64
```

Résultat : `app/dist/VoidCord-Portable-<version>.exe`. Pour tester sans empaqueter : `bun run start` dans `app/`.

À chaque modification d'un plugin, refais l'étape 1 puis l'étape 2 pour que l'exe intègre le changement.

### Publier une version

Le fichier `.exe` dépasse la limite de 100 Mo de GitHub : il ne se commit pas (`dist/` est ignoré). Crée une *Release* GitHub et joins-y l'exe.

## Créer un plugin

Ajoute un dossier dans `src/userplugins/<nomDuPlugin>/` avec un fichier `index.ts(x)` qui exporte un plugin via `definePlugin`, puis relance `pnpm build`. Consulte [CONTRIBUTING.md](./CONTRIBUTING.md) pour les conventions.

## Crédits

- [Equicord](https://github.com/Equicord/Equicord) et [Vencord](https://github.com/Vendicated/Vencord), sur lesquels VoidCord est basé.
- [Equibop](https://github.com/Equicord/Equibop) (et [Vesktop](https://github.com/Vencord/Vesktop)), dont la coque desktop dans `app/` est dérivée.
- [Nightcord](https://nightcord.st), sur lesquels j'ai repris des plugins.

## Licence

Distribué sous licence GPL-3.0-or-later, voir [LICENSE](./LICENSE).

## Avertissement

Discord est une marque de Discord Inc., mentionnée uniquement à titre descriptif, sans affiliation ni approbation de leur part.

Les modifications de client sont contraires aux conditions d'utilisation de Discord. Le risque de sanction est faible en pratique, mais utilise ce projet à tes risques et périls.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dist-ssr', '**/.next/**', '**/next-env.d.ts']),
  // Le bloc `**/*.{js,jsx}` qui vivait ici couvrait l'app v1 (Vite/JSX,
  // src/App.jsx) : globals navigateur, parser JSX et react-refresh/configs.vite.
  // Le scaffold v1 étant décommissionné, il ne restait plus un seul .jsx dans
  // le dépôt — et ce fichier de configuration était le dernier .js, linté avec
  // des globals navigateur qui n'avaient aucun sens pour lui.
  // Remplacé par le strict nécessaire : Node, pas de JSX, pas de react-refresh
  // (dépendance retirée du package.json racine avec le reste du scaffold).
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  // packages/* + apps/web (TypeScript) — le bloc ci-dessus ne matche pas
  // .ts/.tsx.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  // apps/pipeline (Phase 7A) — scripts .mjs Node purs (aucun DOM/browser),
  // ni .js/.jsx ni .ts/.tsx, non couverts par les deux blocs ci-dessus.
  // Périmètre volontairement restreint à apps/pipeline : d'autres .mjs
  // préexistants ailleurs dans le repo (postcss.config.mjs) ne sont pas
  // concernés par ce lot.
  {
    files: ['apps/pipeline/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      // ignoreRestSiblings : scraper-bringo.mjs déstructure volontairement
      // ({ _key, discount, discount_rate, ...d }) pour les EXCLURE du rest
      // spread — jamais des variables mortes, code du scraper inchangé
      // (Phase 7A, "déménagement pas réécriture").
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', ignoreRestSiblings: true }],
    },
  },
])

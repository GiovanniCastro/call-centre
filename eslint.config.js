// Los invariantes que un linter puede sostener. Ver docs/00-CANON.md §Parte 2 y
// docs/Propuesta-Desarrollo-Por-Fases.md §5.
//
// Cada bloque de reglas dice qué invariante defiende y en qué fase se activó. No
// se relaja una regla para que pase un cambio: o el cambio está mal, o la regla
// está mal, y las dos cosas se discuten antes de tocarlas.

// Sin `@eslint/js`: las reglas base que hacen falta se declaran a mano, para no
// añadir un paquete más al conjunto aprobado en la fase 0.
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

/** Identificadores que delatan aritmética de precios. */
const PALABRAS_DE_PRECIO = '/(precio|tarifa|coste|costo|kwh|vatios|amortiz)/i';

/** Un mensaje que explica el porqué, no solo el qué. */
const MENSAJE_COSTEO =
  'Aritmética de precios fuera de src/core/costeo/. El costeo tiene una sola ' +
  'fuente: importa `costear` desde src/core/costeo/costear.ts. La calculadora ' +
  'de la fase 6B lo importa, no lo reimplementa.';

const SDKS_DE_PROVEEDOR = [
  'openai',
  '@anthropic-ai/sdk',
  '@anthropic-ai/claude-agent-sdk',
  'ollama',
  '@google/genai',
  '@google-cloud/vertexai',
  'cohere-ai',
  '@mistralai/mistralai',
];

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'docs/**',
      'bitacoras/**',
      // El panel es React y llega en la fase 6, con su propia configuración.
      'panel/**',
    ],
  },

  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: {} },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,

      // Invariante de higiene: sin `any`. En `error`, no en `warn`.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // `no-undef` es cosa del compilador de TypeScript, no de ESLint.
      'no-undef': 'off',
      // El intérprete de TypeScript de Node exige sintaxis borrable.
      '@typescript-eslint/no-namespace': 'error',
      '@typescript-eslint/no-empty-object-type': 'error',

      // Reglas base, declaradas a mano en lugar de heredar `@eslint/js`.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['error', 'warn'] }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-constant-condition': 'error',
      'no-self-compare': 'error',
      'no-unused-private-class-members': 'error',
      'require-atomic-updates': 'error',
    },
  },

  // ── Invariante 4 · Agnóstico al proveedor ────────────────────────────────
  // El dominio no conoce a nadie. dependency-cruiser vigila lo mismo sobre el
  // grafo completo; esto lo detiene ya en el editor.
  {
    files: ['src/core/**/*.ts', 'src/channels/**/*.ts', 'src/repos/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: SDKS_DE_PROVEEDOR.map((name) => ({
            name,
            message:
              'Invariante 4: ninguna clase del dominio importa el SDK de un ' +
              'proveedor. Va detrás de la interfaz común, en src/providers/.',
          })),
          patterns: [
            {
              group: ['**/providers/**', 'react', 'react-dom', '**/panel/**'],
              message:
                'El dominio no depende de adaptadores de proveedor ni del panel. ' +
                'La dependencia va en el sentido contrario.',
            },
          ],
        },
      ],
    },
  },

  // ── Fuente única de costo ────────────────────────────────────────────────
  // Criterio de aceptación de la fase 0: un lint falla si aparece aritmética de
  // precios fuera del módulo de costeo.
  {
    files: ['src/**/*.ts', 'proyeccion/**/*.ts', 'lote/**/*.ts'],
    ignores: ['src/core/costeo/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `BinaryExpression[operator="*"] > Identifier[name=${PALABRAS_DE_PRECIO}]`,
          message: MENSAJE_COSTEO,
        },
        {
          selector: `BinaryExpression[operator="/"] > Identifier[name=${PALABRAS_DE_PRECIO}]`,
          message: MENSAJE_COSTEO,
        },
        {
          selector: `BinaryExpression[operator="*"] > MemberExpression[property.name=${PALABRAS_DE_PRECIO}]`,
          message: MENSAJE_COSTEO,
        },
        {
          selector: `BinaryExpression[operator="/"] > MemberExpression[property.name=${PALABRAS_DE_PRECIO}]`,
          message: MENSAJE_COSTEO,
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/config/precios.json', '**/precios.ts'],
              message: MENSAJE_COSTEO,
            },
          ],
        },
      ],
    },
  },

  // Las pruebas ejercitan las reglas; se les permite mirar los precios de frente.
  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      'no-restricted-imports': 'off',
      'no-console': 'off',
    },
  },
];

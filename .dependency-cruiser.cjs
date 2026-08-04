/**
 * Invariante 4 y las fronteras de módulo, sobre el grafo completo de dependencias.
 *
 * ESLint detiene un import prohibido en el archivo donde se escribe. Esto detiene
 * el camino de tres saltos que ESLint no ve: `core → utilidad → adaptador → SDK`.
 * Son dos redes distintas, y por eso están las dos.
 *
 * Cada regla nombra el invariante que defiende. Ver docs/00-CANON.md §Parte 2.
 */

/** SDKs de proveedor de inferencia. Ninguno puede alcanzarse desde el dominio. */
const SDKS_DE_PROVEEDOR =
  '^(openai|@anthropic-ai/|ollama|@google/genai|@google-cloud/vertexai|cohere-ai|@mistralai/)';

/**
 * Todas las formas en que un paquete puede aparecer, esté instalado o no.
 *
 * Sin esto, `dependencyTypes: ['npm']` solo casa con paquetes que se resuelven.
 * Un import de un SDK que todavía no está en `node_modules` se clasifica como
 * `unknown`, escapa a la regla que le corresponde, y acaba atrapado por la regla
 * genérica de dependencias no declaradas. Sigue habiendo error —el merge se
 * bloquea igual— pero acusando la infracción equivocada, y un check que señala
 * lo que no es manda a quien lo lee a arreglar lo que no está roto.
 *
 * Comprobado: `import OpenAI from 'openai'` sin el paquete instalado llega aquí
 * como `dependencyTypes: ['unknown']`, no como `npm-no-pkg`.
 */
const CUALQUIER_PAQUETE = [
  'npm',
  'npm-dev',
  'npm-optional',
  'npm-peer',
  'npm-bundled',
  'npm-no-pkg',
  'npm-unknown',
  'unknown',
  'undetermined',
];

module.exports = {
  forbidden: [
    {
      name: 'nucleo-sin-sdk-de-proveedor',
      comment:
        'Invariante 4 · Agnóstico al proveedor. Ninguna clase del dominio importa ' +
        'el SDK de un proveedor, ni directamente ni por una cadena de imports. ' +
        'El SDK vive detrás de la interfaz común, en src/providers/.',
      severity: 'error',
      from: { path: '^src/(core|channels|repos|telemetry|borde)/' },
      to: { dependencyTypes: CUALQUIER_PAQUETE, path: SDKS_DE_PROVEEDOR },
    },
    {
      name: 'nucleo-sin-adaptadores',
      comment:
        'Invariante 4 · La dependencia va del adaptador al dominio, nunca al revés. ' +
        'src/core define la interfaz; src/providers la implementa.',
      severity: 'error',
      from: { path: '^src/(core|channels|repos|telemetry|borde)/' },
      to: { path: '^src/providers/' },
    },
    {
      name: 'nucleo-sin-canal-concreto',
      comment:
        'Criterio de aceptación de la fase 1: el núcleo no importa nada específico ' +
        'de WhatsApp. Se verifica con este check, no leyendo código. La fase 3B ' +
        '(Telegram) es la prueba de que la abstracción `Canal` funciona.',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/channels/' },
    },
    {
      name: 'nucleo-sin-almacen-concreto',
      comment:
        'Fase 2 · src/core/conocimiento define las interfaces Embeddings y ' +
        'AlmacenVectorial; src/conocimiento/ las implementa y las cablea. Si el ' +
        'núcleo pudiera importar el almacén concreto, el criterio «los embeddings ' +
        'se generan local o en nube sin tocar el código de recuperación» se ' +
        'verificaría leyendo código en lugar de por construcción.',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/conocimiento/' },
    },
    {
      name: 'solo-repos-habla-con-sql',
      comment:
        'src/repos/ es la única capa con acceso a PostgreSQL, y toda función que ' +
        'exporta recibe un AlcanceContacto. Si el cliente de SQL se puede importar ' +
        'desde cualquier sitio, el filtro de contacto es una convención, no una ' +
        'garantía. Se activa de verdad en la fase 1.',
      severity: 'error',
      from: { pathNot: '^src/repos/' },
      to: { dependencyTypes: CUALQUIER_PAQUETE, path: '^(pg|postgres|drizzle-orm|knex)$' },
    },
    {
      name: 'perimetro-sin-firebase',
      comment:
        'Invariante 8 · La proyección es de un solo sentido. El publicador de ' +
        'proyeccion/ es el único componente con credencial de escritura sobre ' +
        'Firestore. Ningún módulo del perímetro importa el SDK de Firebase.',
      severity: 'error',
      from: { pathNot: '^proyeccion/' },
      to: { dependencyTypes: CUALQUIER_PAQUETE, path: '^(firebase-admin|firebase|@firebase/)' },
    },
    {
      name: 'el-perimetro-no-depende-de-su-proyeccion',
      comment:
        'Invariante 8, en la otra dirección. `proyeccion/` lee del perímetro; el ' +
        'perímetro no sabe que existe. Un `src/` que importara del publicador ' +
        'crearía el camino de vuelta que el invariante prohíbe — y lo crearía por ' +
        'dentro, donde ninguna regla de Firestore llega.',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: '^proyeccion/' },
    },
    {
      name: 'perimetro-no-depende-del-panel',
      comment:
        'El panel es React y lee la proyección de Firestore, nunca el perímetro. ' +
        'src/ no importa panel/ ni React.',
      severity: 'error',
      from: { path: '^(src|proyeccion|lote)/' },
      to: { path: '^panel/' },
    },
    {
      name: 'perimetro-sin-react',
      comment:
        'React vive solo bajo panel/. El núcleo no tiene framework de interfaz.',
      severity: 'error',
      from: { path: '^(src|proyeccion|lote)/' },
      to: { dependencyTypes: CUALQUIER_PAQUETE, path: '^(react|react-dom|next)($|/)' },
    },
    {
      name: 'costeo-es-fuente-unica',
      comment:
        'Criterio de aceptación de la fase 0: la función de costeo es la única ' +
        'fuente de costo del sistema. Solo src/core/costeo/ lee la tabla de precios.',
      severity: 'error',
      from: { pathNot: '^src/core/costeo/' },
      to: { path: '^config/precios\\.json$' },
    },
    {
      name: 'solo-salida-habla-con-internet',
      comment:
        'Invariante 3 · Cero salida de datos sin pasar por la capa de saneo y la ' +
        'lista blanca. src/salida/ es el único módulo que abre una conexión. ESLint ' +
        'detiene el `fetch` global en el archivo; esto detiene la vuelta por un ' +
        'cliente HTTP empaquetado, que ESLint no vería.',
      severity: 'error',
      from: { pathNot: '^src/salida/' },
      to: {
        dependencyTypes: CUALQUIER_PAQUETE,
        path: '^(undici|node-fetch|axios|got|superagent|request|cross-fetch|ky)$',
      },
    },
    {
      name: 'sdk-de-proveedor-solo-en-adaptadores',
      comment:
        'El SDK de un proveedor vive en src/providers/, detrás de la interfaz común. ' +
        'La regla `nucleo-sin-sdk-de-proveedor` cubre el dominio; esta cubre el resto ' +
        'del perímetro —conocimiento, salida, el arranque— para que no se cuele por ' +
        'una carpeta que nadie había pensado en nombrar.',
      severity: 'error',
      from: { pathNot: '^src/providers/' },
      to: { dependencyTypes: CUALQUIER_PAQUETE, path: SDKS_DE_PROVEEDOR },
    },
    {
      name: 'demo-sin-inferencia',
      comment:
        'Criterio de aceptación de la fase 8: «la demo pública no realiza ninguna ' +
        'llamada de inferencia» (R-009). Las pruebas comprueban que hoy no la hace; ' +
        'esta regla comprueba que no PUEDE hacerla. El publicador y la demo derivan ' +
        'de archivos ya grabados: no alcanzan a ningún adaptador de proveedor, ni al ' +
        'módulo de salida, ni a la recuperación —que también sale a la red a por ' +
        'embeddings—. Los imports de solo tipo se permiten: un tipo no ejecuta nada, ' +
        'y sin esa distinción la demo no podría ni nombrar la forma de un resultado ' +
        'del corredor.',
      severity: 'error',
      from: { path: '^proyeccion/' },
      to: {
        path: '^src/(providers|salida|conocimiento)/',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'el-informe-propone-no-aplica',
      comment:
        'Criterio de aceptación de la fase 9: «el informe propone; nunca aplica». Las ' +
        'pruebas comprueban que hoy no aplica nada; esta regla comprueba que no PUEDE. ' +
        'src/core/fallas/ no alcanza al repositorio, ni al módulo de salida, ni a ningún ' +
        'adaptador de proveedor, ni a las acciones o el CRM — que son las cuatro formas ' +
        'que tiene este sistema de cambiar algo. Sus entradas son datos y su salida es ' +
        'texto. Sin esto, «propone» sería una promesa sobre el código de hoy.',
      severity: 'error',
      from: { path: '^src/core/fallas/' },
      to: { path: '^src/(repos|salida|providers|conocimiento|core/(acciones|crm))/' },
    },
    {
      name: 'sin-ciclos',
      comment:
        'Un ciclo de dependencias hace que «qué depende de qué» deje de tener ' +
        'respuesta, y con ella se va la posibilidad de razonar sobre las fronteras.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'sin-huerfanos',
      comment: 'Módulo que nadie importa: o falta cablearlo, o sobra.',
      severity: 'warn',
      from: { orphan: true, pathNot: '\\.d\\.ts$' },
      to: {},
    },
    {
      name: 'sin-dependencias-no-declaradas',
      comment:
        'Un paquete que se usa sin estar en package.json funciona hasta que alguien ' +
        'clona el repositorio. Y toda dependencia nueva se propone y se aprueba.',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['unknown', 'undetermined', 'npm-no-pkg', 'npm-unknown'] },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(node_modules|dist|coverage|panel|docs|bitacoras)/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.js', '.json'],
      mainFields: ['module', 'main', 'types'],
      // `firebase-admin/app` y `firebase-admin/firestore` son subrutas
      // declaradas en el mapa de `exports` del paquete, no carpetas reales. Sin
      // esto el resolvedor no las encuentra, las clasifica como dependencia no
      // declarada y la regla `sin-dependencias-no-declaradas` las acusa de algo
      // que no es: el paquete SÍ está en package.json. Se enseña al resolvedor a
      // leer el mapa en vez de relajar la regla — un check que señala lo que no
      // es manda a quien lo lee a arreglar lo que no está roto.
      exportsFields: ['exports'],
      conditionNames: ['node', 'import', 'require', 'default', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};

# 🚀 DESPLIEGUE — de cero a demo pública

> **Estado a 4‑ago‑2026.** La mitad autoalojada de este documento **está
> ejecutada y verificada** (fase 8A). La mitad de nube —Hosting, App Check,
> Auth, despliegue por etiqueta— está escrita y **no ejecutada**: espera un
> proyecto de Firebase. Cada sección dice en qué estado está; ninguna dice
> «listo» sin haberlo estado.

Este documento es un runbook: se sigue de arriba abajo y cada paso se puede
comprobar. Lo que no se pueda comprobar no está hecho.

Ver [[00-CANON]] para qué es cada plano y [[Propuesta-Desarrollo-Por-Fases]] §8
para los criterios de aceptación de esta fase.

---

## 0. Los dos planos, y qué se despliega en cada uno

```
┌─ PERÍMETRO (tu máquina) ──────────────────────────────┐
│  Node 24 · PostgreSQL · Redis · Qdrant · Ollama       │
│  webhook expuesto con TLS  ·  respaldos  ·  secretos  │
│                    publicador ──────────────┐         │
└─────────────────────────────────────────────│─────────┘
                                              ▼
┌─ PRESENTACIÓN (Firebase) ─────────────────────────────┐
│  Hosting (panel + demo) · Firestore (solo lectura)    │
│  Auth (operadores) · App Check (demo pública)         │
└───────────────────────────────────────────────────────┘
```

**La demo pública no ejecuta nada.** Sirve lo que el corredor de la fase 7 dejó
grabado. No consume presupuesto por visitante, no expone el webhook y **no
depende de que el perímetro esté encendido** — se puede apagar la máquina y la
demo sigue en pie.

---

## 1. La máquina del perímetro · ESTADO: ejecutado en desarrollo

Requisitos:

| Pieza | Versión | Por qué esa |
|---|---|---|
| Node.js | ≥ 22.18 (se usa 24) | Ejecuta TypeScript sin compilar (R‑015) |
| Docker + Compose | 29.x / v5.x | PostgreSQL 16, Redis 7 y Qdrant 1.12.4, en las **mismas versiones que el CI** |
| Ollama | cualquiera reciente | Inferencia local y embeddings `bge-m3` |
| Java | 21 | Solo para el emulador de Firestore, en pruebas |

```bash
git clone https://github.com/GiovanniCastro/call-centre
cd call-centre
npm ci
cp .env.ejemplo .env          # y rellenar; ver §2
npm run servicios             # PostgreSQL, Redis y Qdrant en contenedores
npm run conocimiento:ingerir  # el corpus de Nimbo Seguros al índice
npm run arrancar
```

**Comprobación.** El arranque imprime el parte de canales y el parte de
secretos. Ninguno de los dos puede imprimir un valor de credencial: si ves uno,
es un defecto y se arregla antes de seguir.

> **De aquí salen las cifras de costo local.** `config/maquina-referencia.json`
> sigue en `PROVISIONAL`: mientras lo esté, todo costo local sale marcado como
> provisional y el panel está obligado a decirlo. Caracterizar la máquina
> —equipo, precio, vatios, tarifa eléctrica, mantenimiento— es lo que convierte
> «$0.0000» en una cifra defendible. Ver R‑017.

---

## 2. Secretos · ESTADO: ejecutado

Ninguno vive en el repositorio. `.env` está en `.gitignore`, `gitleaks` corre en
cada PR y GitHub tiene *push protection* activo.

```bash
node -e "import('./src/operacion/secretos.ts').then(m=>console.log(m.parteDeSecretos()))"
```

Dice qué hay puesto, qué falta, **qué se pierde por faltar** y de dónde sale cada
cosa. Nunca un valor.

En producción, los secretos van al gestor del anfitrión (variables de entorno del
servicio, `systemd` con `EnvironmentFile` de permisos `600`, o el gestor de la
nube donde corra), **no a un `.env` en el disco compartido**.

Todo lo que el sistema imprime pasa por `redactar()`, en dos capas: por valor
—los secretos declarados— y por forma —lo que parece credencial aunque nadie lo
haya declarado—. Una prueba estructural recorre el árbol sintáctico y **falla si
aparece una variable con forma de credencial que no esté declarada**.

---

## 3. Respaldos · ESTADO: ejecutado y verificado

```bash
npm run respaldo
```

Una sola orden que **vuelca, restaura en una base aparte y compara los recuentos
tabla por tabla**. No hay una orden para respaldar y otra para comprobar: un
comprobante que hay que acordarse de ejecutar es uno que nadie ejecuta.

Ejecutado el 4‑ago‑2026 contra PostgreSQL 16.14: **14 tablas, 1016 filas,
restauradas y verificadas.**

- Los volcados van a `respaldos/`, que está en `.gitignore`. Un respaldo es la
  base de datos entera: el único sitio donde no puede acabar es el repositorio.
- Retención en `config/respaldos.json` (14 días). Se poda al crear uno nuevo.
- La restauración de prueba **se niega a correr contra la base de producción**.
  Comprobación explícita antes de cualquier `DROP DATABASE`.

**En producción**, programar a diario. En Linux:

```cron
30 3 * * *  cd /ruta/al/perimetro && /usr/bin/npm run respaldo >> /var/log/perimetro-respaldo.log 2>&1
```

Y sacar los volcados de la máquina: un respaldo que vive en el mismo disco que
la base no sobrevive a la avería que lo hace falta.

---

## 3 bis. El informe de salud · ESTADO: ejecutado

```bash
npm run salud                  # sobre la corrida más reciente, modo local
npm run salud -- --json        # la estructura, para un agente de código
npm run salud -- --modo nube   # otro modo de la misma corrida
```

**No pide base de datos, ni Ollama, ni red.** Se compone sobre lo que el corredor
del lote dejó grabado, igual que la demo pública: un informe de salud que
exigiera el sistema encendido sería inútil justo el día que hace falta.

Trae disponibilidad, tasa de error, tiempo medio de recuperación y presupuesto de
error consumido — **y no los imprime si no hay observaciones suficientes**. Por
debajo del mínimo de `config/salud.json` dice que no es concluyente y enseña el
denominador. Los hallazgos agrupados sí salen igualmente.

**El informe propone; no aplica nada**, y no por buena voluntad: el módulo que lo
genera no alcanza al repositorio, ni a la salida, ni a ningún adaptador. Lo
vigilan una regla del grafo de dependencias y una prueba sobre el árbol
sintáctico.

Lo que **no** cubre, y lo dice él mismo en su última sección: los incidentes de
seguridad, que no se agrupan y viven uno a uno; y los escalados correctos, que no
son fallas.

---

## 4. El webhook expuesto · ESTADO: no ejecutado (8B)

El perímetro escucha en `PUERTO` (8787 por omisión) sin TLS. Telegram exige
HTTPS, así que hace falta un proxy inverso delante — Caddy, nginx o un túnel.

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://tu-dominio/webhook/telegram" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

**Comprobación obligatoria contra el despliegue real** — es un criterio de
aceptación, y no se da por bueno con las pruebas:

```bash
# Sin cabecera de secreto: tiene que rechazar, y NO encolar nada.
curl -i -X POST https://tu-dominio/webhook/telegram \
  -H 'content-type: application/json' -d '{"update_id":1}'

# Con el secreto correcto: acepta.
curl -i -X POST https://tu-dominio/webhook/telegram \
  -H 'content-type: application/json' \
  -H 'X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>' \
  -d '{"update_id":1}'
```

Pendiente hasta que exista la máquina expuesta. Ver §7.

---

## 5. La proyección · ESTADO: archivos ejecutado · Firestore no ejecutado (8B)

El publicador es **el único componente con permiso de escritura sobre la
proyección**, y corre dentro del perímetro. Invariante 8.

```bash
npm run publicar        # agregados desde PostgreSQL
npm run publicar:demo   # la demo pública, desde lote/resultados/
```

Sin `FIREBASE_PROYECTO` escribe en `proyeccion/salida/` como archivos JSON. Con
él, en Firestore por el Admin SDK.

`npm run publicar:demo` **no pide `DATABASE_URL`**, y eso no es un descuido: la
demo se publica desde archivos grabados, sin tocar el perímetro y sin encender
nada.

Para Firestore:

```bash
# consola de Firebase → Configuración → Cuentas de servicio → generar clave
export FIREBASE_PROYECTO=perimetro-xxxxx
export GOOGLE_APPLICATION_CREDENTIALS=/ruta/segura/serviceAccountKey.json
npm run publicar:demo
```

La clave privada **no va al repositorio** — `.gitignore` cubre
`serviceAccountKey*.json` y `firebase-adminsdk*.json`.

### Reglas de Firestore

```bash
npm run test:reglas                    # contra el emulador, sin cuenta
firebase deploy --only firestore:rules # a producción (8B)
```

Las reglas están **probadas contra el emulador** desde la fase 8A: seis pruebas
que comprueban que ningún cliente autenticado escribe, que el rol de métricas no
lee trazas, y que la demo pública se lee sin cuenta y no da acceso a nada más.

---

## 6. Hosting, Auth y App Check · ESTADO: no ejecutado (8B)

Lo que falta, en orden:

1. Crear el proyecto de Firebase y anotar su identificador.
2. `firebase deploy --only firestore:rules`.
3. `npm run panel:construir` y `firebase deploy --only hosting`.
4. Auth: habilitar el proveedor, crear los operadores y asignar los *custom
   claims* `metricas` y `trazas`. **Ver métricas no es ver contenido**: son dos
   permisos, no dos escalones de uno.
5. App Check sobre la demo pública. Un endpoint público sin freno es una factura
   esperando a ocurrir.
6. Workflow de despliegue por etiqueta en GitHub Actions.

---

## 7. Lista de verificación del despliegue completo

Un despliegue no está hecho hasta que estas casillas están marcadas **por
observación**, no por deducción.

- [x] `npm run verificar` pasa entero, incluidas las reglas en el emulador
- [x] Los servicios levantan en las versiones del CI
- [x] El corpus está indexado y una consulta devuelve cita
- [x] El arranque declara qué canales y qué secretos faltan, sin imprimir ninguno
- [x] **Un respaldo se ha restaurado y verificado** — 14 tablas, 1016 filas
- [x] La demo pública se publica sin base de datos y sin una sola llamada de red
- [x] Ningún identificador del lote llega a la colección pública
- [ ] El webhook de producción rechaza toda petición sin firma válida
- [ ] El panel está desplegado en Hosting con dominio y TLS
- [ ] Los dos roles existen en Auth y se han probado con cuentas reales
- [ ] App Check protege los endpoints públicos
- [ ] El despliegue se ha ejecutado entero desde cero, una vez

Las cuatro últimas son 8B y dependen de que exista el proyecto de Firebase y la
máquina expuesta.

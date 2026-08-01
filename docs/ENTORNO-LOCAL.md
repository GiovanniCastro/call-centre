# Entorno local

Qué hace falta para ejecutar el perímetro y sus pruebas en tu máquina, y qué pasa
si no lo tienes.

---

## Lo mínimo: solo Node

```bash
npm ci
npm run verificar     # tipos, lint, arquitectura y pruebas
npm run dev           # servidor en http://localhost:8787, recarga al guardar
```

Esto funciona **sin instalar nada más**. Lo que no funciona es todo lo que necesita
un servicio real: las pruebas que tocan Redis, PostgreSQL o Qdrant **se omiten**, y
el corredor lo dice:

```
almacén Redis — omitido: no hay REDIS_URL en el entorno
persistencia — omitida: no hay DATABASE_URL en el entorno
```

> **Una prueba omitida no es una prueba aprobada.** Es un «no se ha comprobado».
> El CI sí las ejecuta, con contenedores reales, así que nada llega a `main` sin
> haber pasado por ellas — pero mientras desarrollas estás a ciegas sobre esa
> parte, y el ciclo de corrección se alarga de segundos a minutos.

---

## Lo recomendado: Docker

Con Docker, un comando levanta PostgreSQL, Redis y Qdrant **en las mismas
versiones que el CI**:

```bash
docker compose up -d
```

Después, copia `.env.ejemplo` a `.env` y descomenta las tres URL de servicio. A
partir de ahí `npm run verificar` ejecuta la suite completa, sin omitidas, igual
que el CI.

```bash
docker compose down      # parar, conservando los datos
docker compose down -v   # parar y BORRAR los datos
```

Las versiones de `docker-compose.yml` y las de `.github/workflows/ci.yml` tienen
que coincidir. Un local con PostgreSQL 15 y un CI con el 16 produce el fallo más
caro de diagnosticar: el que solo pasa en un sitio.

---

## Instalar Docker en Windows 11

> **En la máquina de desarrollo ya está hecho** (31‑jul‑2026): Docker 29.6.2 y
> Docker Compose v5.3.1. Los tres servicios levantan sanos y `npm run verificar`
> pasa **99 pruebas con 0 omitidas**, que es la primera vez que la suite completa
> se ejecuta fuera del CI. Lo que sigue queda como receta para la próxima máquina.

**Hace falta permiso de administrador y un reinicio.** No es algo que el agente
pueda hacer por ti.

Estado comprobado antes de instalar:

| | |
|---|---|
| Windows 11 Pro | ✅ compatible |
| Virtualización en firmware | ✅ activada |
| WSL | ❌ no instalado |
| Docker Desktop | ❌ no instalado |
| Sesión con permisos de administrador | ❌ no |

### Los dos comandos

Abre **PowerShell como administrador** —clic derecho en el menú de inicio →
«Terminal (administrador)»— y ejecuta:

```powershell
wsl --install
```

Eso instala el Subsistema de Windows para Linux y una Ubuntu por omisión.
**Reinicia** cuando lo pida. Al volver, Ubuntu terminará de configurarse y pedirá
un usuario y una contraseña; sirven cualesquiera.

Después, en la misma terminal elevada:

```powershell
winget install --id Docker.DockerDesktop -e
```

Al terminar, **abre Docker Desktop una vez** desde el menú de inicio y espera a que
el icono de la ballena deje de moverse. La primera vez tarda un par de minutos.

### Comprobar que funcionó

```bash
docker --version
docker compose version
docker run --rm hello-world
```

Si los tres responden, ya está. Vuelve a la carpeta del proyecto y:

```bash
docker compose up -d
cp .env.ejemplo .env      # y descomenta las URL de servicio
npm run verificar
```

Deberías ver **0 omitidas**.

### Si `wsl --install` falla

Casi siempre es la virtualización desactivada en la BIOS. En esta máquina está
activada, así que no debería ocurrir. Si ocurre, el mensaje de error de `wsl` dice
cuál de las dos características de Windows falta y cómo activarla.

---

## Alternativa sin Docker

Existe: PostgreSQL y Qdrant publican binarios nativos para Windows, y hay
versiones de Redis para Windows mantenidas por la comunidad.

**No la recomiendo, y no está soportada aquí.** Tres servicios instalados a mano
divergen de los del CI en versión y en configuración, y entonces el entorno local
deja de responder a la pregunta que tiene que responder —«¿pasará esto en el
CI?»— para responder a otra que no le importa a nadie.

Si no puedes instalar Docker, es mejor trabajar sin servicios y apoyarse en el CI
que montar un tercer entorno distinto.

---

## Variables de entorno

Todas son opcionales. Sin ellas, el sistema arranca y avisa de lo que le falta.

| Variable | Para qué | Si falta |
|---|---|---|
| `PUERTO` | Puerto del webhook | 8787 |
| `REDIS_URL` | Repetición, caudal y agrupación | Almacén en memoria; se pierde al reiniciar |
| `DATABASE_URL` | Conversaciones y mensajes | **No se guarda nada** |
| `QDRANT_URL` | Base de conocimiento (fase 2) | Sin recuperación |
| `TELEGRAM_BOT_TOKEN` | Canal primario | Canal declarado, sin configurar |
| `TELEGRAM_WEBHOOK_SECRET` | Verificación de entrega | Igual |
| `WHATSAPP_*` | Conector de WhatsApp | Conector declarado, sin configurar |

El arranque imprime el estado de cada canal y lo que le falta a cada uno. Si algo
no está configurado, lo dice; no falla en silencio.

---

## Hablar con el bot de Telegram de verdad

El webhook tiene que ser alcanzable desde internet, así que hace falta un túnel:

```bash
cloudflared tunnel --url http://localhost:8787
# o
ngrok http 8787
```

Con la URL pública que devuelva:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://TU-TUNEL/webhook/telegram" \
  -d "secret_token=<TU_SECRETO>"
```

> A fecha de hoy, **el bot recibirá el mensaje y no contestará nada**. El sistema
> lo verifica, lo agrupa y lo guarda; responder es la fase 3, que necesita el
> enrutador y el modelo. Esto no es un fallo de configuración.

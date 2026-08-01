# Perímetro · 31 de julio de 2026 — entorno local

> Parte de la jornada. Toda cifra está medida contra el repositorio o contra una
> ejecución registrada; ninguna está estimada.

Tercera bitácora del día. Cierra el punto que la fase 1 dejó abierto: **«sin
Docker en la máquina de desarrollo — conviene resolverlo antes de la fase 2, que
trae Qdrant»**.

---

## Qué se hizo

Docker quedó instalado en la máquina de desarrollo: **Docker 29.6.2, Docker
Compose v5.3.1**. Los tres servicios de `docker-compose.yml` levantan y pasan su
comprobación de salud: PostgreSQL 16, Redis 7 y Qdrant 1.12.4 — las mismas
versiones que el CI.

Se añadieron a `.env` las tres URL de servicio que `.env.ejemplo` deja
comentadas.

### Un desajuste entre documento y código, corregido

[[ENTORNO-LOCAL]] prometía que, con `.env` en su sitio, `npm run verificar`
ejecutaba la suite completa sin omitidas. No era cierto: `dev` y `arrancar`
llevaban `--env-file-if-exists=.env`, y `test` no. La primera ejecución local
dio **2 omitidas** con los tres contenedores sanos, que es el peor resultado
posible — parece que falta un servicio cuando lo que falta es cargar el archivo.

El script de pruebas pasa a cargar `.env` igual que los otros dos. En el CI el
archivo no existe, así que la bandera no hace nada y las variables siguen
llegando por `env:` del workflow.

## Qué quedó medido

| | Antes | Ahora |
|---|---|---|
| Pruebas ejecutadas en local | 86 | **99** |
| Omitidas | 2 | **0** |
| Fallos | 0 | 0 |

Las once pruebas que aparecen son las que tocan Redis y PostgreSQL: hasta hoy
solo se habían ejecutado en el CI. **Ninguna falló al ejecutarse por primera vez
en esta máquina**, lo cual dice algo bueno de los contenedores del CI y nada
sobre el código que no supiéramos ya.

`npm run verificar` completo —tipos, lint, arquitectura y pruebas— en verde.

### Primer arranque del proceso contra servicios reales

```
Redis conectado en redis://localhost:6379
PostgreSQL conectado en postgres://…/perimetro (esquema al día)
Canales:
  ✓ telegram — activo
  ✗ whatsapp — declarado, sin configurar (faltan 4 de 4 requisitos)
```

`GET /salud` responde `ok`. El ejecutor de migraciones aplicó `001_inicial.sql`
sobre una base vacía sin intervención, y el conector de WhatsApp se comportó como
exige su criterio de aceptación: arrancó sin credenciales, no se registró y dijo
qué le falta y cómo obtenerlo.

## Qué NO se hizo

- **Qdrant está levantado pero no se usa todavía.** `QDRANT_URL` está en `.env`
  y ninguna línea de código la lee: la base de conocimiento es la fase 2. El
  contenedor está para no descubrir en mitad de esa fase que la imagen no arranca.
- **El CI no gana una variable `QDRANT_URL`.** Se añadirá cuando exista una
  prueba que la necesite, no antes.
- **Nada de la fase 2.** Esto es entorno, no producto.

## Entradas de manual generadas

Ninguna. No hay decisión nueva que registrar: es la ejecución de lo ya decidido
en el commit de infraestructura (#13) y la corrección de un documento que se
había adelantado al código.

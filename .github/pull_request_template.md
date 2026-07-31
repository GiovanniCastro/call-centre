<!--
Un PR por fase. La rama es la unidad de retroceso: si la fase no pasa sus
criterios al tercer intento, se descarta la rama entera, no se parchea `main`.
Ver docs/Propuesta-Desarrollo-Por-Fases.md §9, «Protocolo de fracaso».
-->

## Fase

<!-- Número y nombre, tal como aparecen en la propuesta por fases. -->

**Fase N — nombre**

## Criterios de aceptación

<!--
Copia aquí, como casillas, los criterios de aceptación de la fase desde
docs/Propuesta-Desarrollo-Por-Fases.md §8. Cada casilla marcada apunta a la
prueba automatizada que la cubre: `tests/archivo.test.ts::nombre de la prueba`.

Un criterio marcado sin prueba que lo ejercite es una casilla, no una garantía.
-->

- [ ] Criterio — `tests/…`
- [ ] Criterio — `tests/…`

## Qué invariante toca este PR

<!--
Obligatorio. Los ocho están en docs/00-CANON.md §Parte 2. Si este PR no toca
ninguno, dilo explícitamente: «ninguno» es una respuesta válida y verificable;
dejarlo en blanco no lo es.

Si el PR relaja o modifica una comprobación de CI, explícalo aquí y abre el
issue correspondiente. Un check ablandado en silencio es deuda invisible.
-->

## Qué quedó fuera y por qué

<!--
Obligatorio. Es la mitad del «definición de terminado» del manual que se pierde
si no se escribe. Lo que pertenece a otra fase va a un issue con la etiqueta de
la fase destino, no a este PR.
-->

## Dependencias nuevas

<!--
Cada paquete nuevo se propone y se aprueba antes de instalarse. Lista aquí los
que añade este PR, con una línea de para qué. Si no añade ninguno, «ninguna».
-->

---

- [ ] `npm run verificar` pasa en local
- [ ] No rompe pruebas de fases anteriores
- [ ] La documentación afectada está corregida el mismo día (`docs/CALL_CENTRE_DOCS.md`)

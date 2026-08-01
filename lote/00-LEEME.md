# Lote

Casos que entran al sistema **por el mismo camino que Telegram**: debounce,
normalización, alcance de contacto. No es un atajo de pruebas, y esa es toda la
idea — un camino paralelo puede divergir del real sin que nadie se entere.

`ejemplo.json` son cuatro casos, uno de cada clase que importa:

| Caso | Qué ejercita |
|---|---|
| 001 | Consulta de catálogo con la respuesta en dos documentos: la cita tiene que señalar uno |
| 002 | La excepción de cancelación, que contradice la regla general dos secciones antes |
| 003 | Un hueco deliberado del corpus (motocicletas): tiene que escalar, no inventar |
| 004 | Sensibilidad alta: la regla dura lo retiene en local |

**No es el lote de la fase 7.** Aquel son de cincuenta a cien casos escritos a
mano contra el corpus, con casos de sensibilidad alta en cantidad suficiente para
que el vigía de perímetro tenga denominador. Este sirve para que el formato se
vea y para tener contra qué probar el adaptador.

El campo `esperado` lo lee el corredor de la fase 7; **el canal lo ignora**. Que
el canal no lo mire es lo que impide que una expectativa acabe influyendo en la
ejecución que debería juzgar. Hay una prueba de eso.

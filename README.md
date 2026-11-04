# Apuestas de fútbol

App web sencilla (HTML + CSS + JS, sin dependencias) que muestra los próximos partidos de fútbol, su horario
(en tu zona horaria) y las apuestas clasificadas en **Recomendadas**, **Más "seguras"** y **Más riesgosas**.

## Cómo usarla

1. Consigue una API key gratis en https://the-odds-api.com (botón "Get API Key", plan gratuito de 500 créditos al mes). Te llega por correo.
2. Abre `index.html` en tu navegador (doble clic), o sírvela con `npx serve .` / `python3 -m http.server`.
3. Pega la clave en el campo "API key", elige la liga y pulsa **Cargar partidos**. La clave se guarda solo en tu navegador.

Sin clave, la app funciona en **modo demo** con datos de ejemplo.

Cada carga consume 4 créditos (2 mercados × 2 regiones), así que el plan gratis da para unas 125 cargas al mes.

### Córners, tarjetas y más mercados

Cada partido tiene el botón **➕ Córners, tarjetas y más**, que carga bajo demanda:

- Ambos marcan, doble oportunidad y empate no válido
- Córners: más/menos (varias líneas) y qué equipo saca más córners
- Tarjetas: más/menos (varias líneas)

La API solo da estos mercados partido por partido, y cobra por cada mercado que devuelve × 3 regiones (eu, uk, us).
Un clic puede costar hasta 18 créditos, por eso no se cargan automáticamente.
No todas las casas ofrecen córners y tarjetas, y suelen aparecer más cerca del partido; si no hay datos, la app lo avisa.

## Cómo se clasifican

- Se convierten las cuotas decimales en probabilidad implícita (1/cuota), se quita el margen de cada casa y se promedia entre casas.
- **Más "segura"**: mayor probabilidad (cuota más baja).
- **Más riesgosa**: menor probabilidad (cuota más alta).
- **Recomendada**: mejor valor esperado (probabilidad × mejor cuota − 1) entre opciones con al menos 30 % de probabilidad.

Mercados base: resultado 1X2 y más/menos 2.5 goles. Para la "segura" y la "riesgosa" se ignoran cuotas menores de 1.20 o mayores de 15, que no tiene sentido sugerir (aparecen igual en la tabla completa).

## Juego responsable

Solo informativo. Ninguna apuesta es segura; apuesta solo lo que puedas perder, si eres mayor de edad y es legal donde vives.

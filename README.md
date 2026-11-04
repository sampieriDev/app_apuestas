# Apuestas de fútbol

App web sencilla (HTML + CSS + JS, sin dependencias) que muestra los próximos partidos de fútbol, su horario
(en tu zona horaria) y las apuestas clasificadas en **Recomendadas**, **Más "seguras"** y **Más riesgosas**.

## Cómo usarla

1. Consigue una API key gratis en https://the-odds-api.com (botón "Get API Key", plan gratuito de 500 créditos al mes). Te llega por correo.
2. Abre `index.html` en tu navegador (doble clic), o sírvela con `npx serve .` / `python3 -m http.server`.
3. Pega la clave en el campo "API key", elige la liga y pulsa **Cargar partidos**. La clave se guarda solo en tu navegador.

Sin clave, la app funciona en **modo demo** con datos de ejemplo.

Cada carga consume 4 créditos (2 mercados × 2 regiones), así que el plan gratis da para unas 125 cargas al mes.

## Cómo se clasifican

- Se convierten las cuotas decimales en probabilidad implícita (1/cuota), se quita el margen de cada casa y se promedia entre casas.
- **Más "segura"**: mayor probabilidad (cuota más baja).
- **Más riesgosa**: menor probabilidad (cuota más alta).
- **Recomendada**: mejor valor esperado (probabilidad × mejor cuota − 1) entre opciones con al menos 30 % de probabilidad.

Mercados: resultado 1X2 y más/menos 2.5 goles.

## Juego responsable

Solo informativo. Ninguna apuesta es segura; apuesta solo lo que puedas perder, si eres mayor de edad y es legal donde vives.

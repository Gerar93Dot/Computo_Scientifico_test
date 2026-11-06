# Buruburu · Gastos compartidos

Primera versión móvil basada en la aplicación de escritorio de gastos compartida por el usuario. Es una **aplicación web instalable (PWA)** para Android y iPhone, desarrollada con React y TypeScript. El servidor de grupos usa Node.js y SQLite.

El código de la aplicación está en esta carpeta (`mobile/`). Las carpetas originales de cómputo científico se conservan.

## Qué puedes hacer

- Crear personas y registrar productos o gastos directos.
- Fotografiar un ticket con la cámara o elegir una imagen de la galería.
- Leer texto en español e inglés en el propio dispositivo mediante Tesseract.js.
- Revisar productos, corregir sus importes y seleccionar quién comparte cada uno.
- Consultar saldos y transferencias sugeridas, calculados en centavos enteros.
- Archivar gastos por evento y restaurarlos.
- Trabajar en modo personal, con almacenamiento local, o en un grupo compartido mediante un código de invitación.
- Exportar copias JSON e importar `gastos.json` de las versiones anteriores.

## Ejecutar

Requisito: **Node.js 24 o posterior** y npm. Desde la raíz del repositorio:

```bash
cd mobile
npm ci
npm run build
npm start
```

El servidor sirve la aplicación compilada y la API en el puerto 3001, por defecto en `127.0.0.1`. `HOST`, `PORT` y `DB_PATH` permiten ajustar dirección, puerto y ubicación de la base de datos. Para aceptar conexiones desde otro equipo en una red de desarrollo, configura `HOST=0.0.0.0`. Para instalarla y habilitar sus capacidades en teléfonos reales, sírvela con **HTTPS**.

Desarrollo, en dos terminales dentro de `mobile/`:

```bash
npm run assets
npm run server
```

```bash
npm run dev
```

Vite reenvía `/api` al servidor del puerto 3001. Las bibliotecas OCR y sus modelos se copian desde dependencias fijadas en `package-lock.json`; no se necesitan claves de OCR ni se envían fotos a terceros. `public/ocr/` y `dist/` son generados y no se versionan.

## Uso

1. En **Grupo**, añade las personas y elige la moneda antes del primer gasto.
2. En **Ticket**, toma una foto, abre la galería o escribe productos manualmente.
3. Selecciona quién pagó. Revisa nombres e importes; el importe corresponde al total del renglón, no al precio unitario.
4. Marca quién consumió cada producto. Seleccionar varias personas lo divide por partes iguales.
5. Confirma la revisión y pulsa **Guardar y repartir**. En **Saldos** aparecen las transferencias sugeridas.

En **Grupo → Crear grupo compartido**, se crea una copia en el servidor. Comparte el código o enlace con los demás. Todos los que tienen el código pueden ver y editar; no hay cuentas ni roles de administrador. Los cambios se consultan cada cinco segundos. Una edición concurrente se rechaza y carga la versión actual; el usuario debe volver a aplicar su cambio. La sesión compartida sobrevive una recarga en la misma pestaña; guarda el código para volver a entrar después de cerrar la sesión del navegador. La copia personal permanece separada.

Para instalar: Android, menú de Chrome → **Instalar aplicación**; iPhone, Safari → Compartir → **Añadir a pantalla de inicio**. No se han generado paquetes APK/IPA ni publicado en tiendas.

## Datos y lectura de tickets

- Modo personal: se almacena en `localStorage`; borrar datos del navegador puede eliminarlo. Usa **Exportar gastos** para respaldarlo. Funciona sin conexión después de cargar la app y completar la caché del service worker.
- OCR: necesita cargar los modelos la primera vez; luego pueden reutilizarse desde caché. La cámara y el selector dependen del navegador/dispositivo. Una imagen HEIC que el navegador no decodifique debe convertirse a JPEG/PNG.
- Los renglones detectados son **propuestas**, nunca gastos guardados automáticamente. Fotos borrosas, columnas, cantidades, descuentos, impuestos y propinas requieren revisión. Los descuentos no se añaden como compras positivas: ajusta los importes antes de guardar. El total leído se compara con los productos y una diferencia se muestra al usuario; la confirmación permite guardar los importes revisados.
- El reparto es igualitario entre las personas marcadas. Las cantidades desiguales, proporciones por persona y descuentos automáticos quedan fuera de esta primera versión.
- Las fotos y el texto OCR solo viven en memoria durante la revisión; no se guardan ni sincronizan.
- Archivar retira gastos del saldo activo y conserva su historial; **no significa que las deudas se hayan pagado**.
- Los miembros vinculados a gastos no pueden eliminarse para evitar referencias huérfanas.
- Un archivo antiguo con pagadores «Sin asignar» se rechaza con un mensaje: corrige esas referencias en una copia antes de importarlo.

## Publicar el modo compartido

Necesita un servidor Node.js persistente, un dominio con HTTPS y un volumen para SQLite (`DB_PATH`). Esta implementación usa una sola instancia del servidor; no coloques SQLite sobre un sistema efímero ni despliegues múltiples réplicas independientes. Haz copias con las herramientas de backup de SQLite, incluyendo correctamente el estado WAL. Conserva el código de acceso de cada grupo como una credencial; no lo publiques. Antes de un lanzamiento abierto conviene añadir cuentas, revocación de invitaciones, controles de administración y límites de creación adaptados al proveedor. El limitador incluido usa la dirección del socket; ajusta la configuración de proxy de confianza si se despliega detrás de uno.

No se ha publicado el servicio ni verificado cámara física, Safari/iOS o instalación en teléfonos reales. La prueba de OCR utiliza un ticket sintético nítido y no mide precisión sobre tickets reales.

## Pruebas

```bash
cd mobile
npm test
npm run build
npm run test:browser
```

Las pruebas de navegador requieren Chromium en `/usr/bin/chromium` o la ruta indicada por `CHROMIUM_PATH`. Cubren registro y archivo de gastos, lectura real de una imagen con OCR, sincronización entre dos navegadores y uso personal sin conexión. Los tests de dominio/API cubren reparto exacto, importación, exclusión de totales del ticket, control de acceso, conflictos y persistencia al reiniciar. Usan bases temporales fuera de los datos reales.

## Versiones originales revisadas

`gastos.py` aportó el modelo más completo (personas, gastos directos y productos, historial y un OCR que detectaba el total). `gastosburuburu.py` y `gastosburuburu1.0.py` son versiones anteriores de la interfaz de escritorio. `Untitled-1.py` contiene un ejemplo de fechas independiente. Los adjuntos originales no se modificaron ni se ejecutaron.

## Publicar una prueba en Render

La raíz del repositorio incluye `render.yaml`, que prepara un servicio **Free** con la aplicación completa. No pide claves de OCR ni una base de datos externa.

1. Entra en Render con tu cuenta y conecta este repositorio de GitHub.
2. En el panel, elige **New → Blueprint** y selecciona la rama `codex/buruburu-mobile-demo`.
3. Comprueba que el servicio indica **Free** y crea el despliegue.
4. Espera a que termine y abre la dirección HTTPS que Render asigne al servicio. Esa es la dirección para abrir en Chrome/Android o Safari/iPhone y compartir con tu grupo.

La instancia gratuita puede suspenderse por inactividad y tardar en responder al volver a abrirla. Su disco es temporal: los grupos compartidos pueden desaparecer en reinicios o despliegues. La aplicación muestra un aviso y permite exportar los gastos. Los datos del modo personal permanecen en el navegador. Para datos compartidos duraderos se necesita almacenamiento persistente y revisar el coste del proveedor; esta plantilla no activa un plan de pago.

Preparar o subir esta plantilla no publica por sí solo la aplicación. El enlace público existe únicamente después de crear el servicio en la cuenta de Render.

## Probar sin crear otra cuenta: GitHub Pages

La rama `gh-pages` contiene una compilación de prueba para el modo personal. Usa la cuenta de GitHub existente; no necesita Render ni claves de OCR. Los productos, repartos e historial se guardan en cada navegador; esta publicación estática no incluye sincronización entre teléfonos.

Para activarla, en GitHub abre **Settings → Pages → Build and deployment → Deploy from a branch**, elige **gh-pages**, carpeta **/(root)** y pulsa **Save**. GitHub indicará el enlace cuando termine de publicar. Si el repositorio es privado y el plan no permite Pages, no cambies su visibilidad sin revisar primero qué archivos se harían públicos.

La dirección prevista es `https://gerar93dot.github.io/Computo_Scientifico_test/`. Subir la rama no confirma por sí solo que Pages esté activado.

Para regenerar y probar esta versión:

```bash
cd mobile
npm ci
npm run build:pages
npx playwright test -c playwright.pages.config.ts
```

Publica únicamente el contenido de `mobile/dist/` en la raíz de la rama `gh-pages`; no incluyas bases de datos ni archivos personales. La versión completa con servidor se sigue compilando con `npm run build`.

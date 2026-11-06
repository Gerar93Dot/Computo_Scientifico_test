# Validación de Buruburu móvil

La implementación adapta los modelos de las versiones Python adjuntas a una PWA. No reutiliza CustomTkinter porque esa interfaz es de escritorio.

## Alcance verificado en el entorno

- Node.js 24, TypeScript y compilación de producción con Vite.
- Cálculos exactos de reparto, incluidos sobrantes de un centavo; aplicación de transferencias hasta saldos cero.
- Archivos históricos fuera del saldo activo y gastos directos asignados a una persona.
- Validación de datos de miembros/gastos, importación del JSON antiguo y rechazo de referencias huérfanas.
- Parser que separa artículos de total, subtotal, pagos y descuentos.
- API con código de acceso, rechazo de ediciones concurrentes y persistencia de SQLite después de reiniciar.
- Chromium con pantalla de 390 × 844: alta de personas, gasto compartido, recarga, saldos, archivo y restauración.
- OCR real en navegador sobre `mobile/tests/receipt.png`: PAN 20.00, LECHE 35.50; total 55.50. Revisión y asignación antes de guardar.
- Dos contextos independientes de navegador compartiendo un grupo y recuperando sesión al recargar.
- Modo personal sin conexión después de completar la caché de instalación.

## Límites de esta validación

El ticket de prueba es sintético y nítido. No se mide precisión sobre tickets fotografiados, arrugados, largos, con descuentos o formatos variables. La revisión manual es parte del flujo. No se probó una cámara física, Safari/iOS, la instalación desde tiendas o el despliegue HTTPS público. No hay paquetes APK/IPA.

Los tests de navegador escriben capturas en `mobile/test-results/`, excluido de Git. La base de esos tests está bajo `/tmp`; no se modifica una base de usuarios. Para repetir, consulta `mobile/README.md`.

# Prepara tus alarmas — diseño

## Por qué
La alarma es el objetivo de la app: tiene que sonar y verse en pantalla completa en
cualquier marca de teléfono. Hoy los permisos se piden con alertas encadenadas
(`ensureAlarmPermissions`): cansan, y si la persona toca "Cancelar" en cualquiera,
**no se guarda el medicamento**. Además, los permisos propios de cada marca (inicio
automático, "mostrar en pantalla de bloqueo") no se pueden comprobar.

## Objetivos
- Pedir todos los permisos en **una sola pantalla**, mostrando solo lo que falta;
  lo concedido aparece con ✅ y nunca se vuelve a pedir.
- **Nunca perder** lo que la persona escribió: guardar el medicamento siempre.
- Comprobar de verdad en todas las marcas con una **alarma de prueba**.
- Insistir hasta que esté listo: aviso persistente en Inicio.

## No objetivos
- Detectar si estás en la pantalla de inicio o en otra app (requiere "acceso de uso").
  Con el teléfono desbloqueado la alarma sigue saliendo como notificación con sonido
  y botones (decidido en esta sesión; así lo hace el reloj de Android).
- iOS: no tiene pantalla completa; allí la pantalla solo cubre notificaciones.

## Enfoque elegido (A)
- **A — guardar siempre + pantalla de preparación (elegido):** el medicamento se
  guarda y enseguida se abre "Prepara tus alarmas" si falta algo.
- B — bloquear el guardado hasta tener todo (descartado: puede perder lo escrito y
  frustra; con A la app igual insiste).
- Mantener alertas encadenadas (descartado: es lo que cansa hoy).

## Cómo funciona
1. **Pantalla "Prepara tus alarmas"** (`BottomSheet` compartido), una fila por paso,
   en lenguaje sencillo:
   - Notificaciones (+ canal de alarmas silenciado) — comprobable.
   - Alarmas a la hora exacta (Android 12+) — comprobable.
   - Mostrar sobre la pantalla bloqueada (Android 14+, full-screen intent) — comprobable.
   - Que no la apague el ahorro de batería — comprobable.
   - Inicio automático (solo marcas que lo necesitan) — **no comprobable**: botón
     "Abrir ajustes" + la persona lo marca como hecho ("Ya lo activé").
   Cada fila: ✅ si está, o botón "Activar" que abre el ajuste exacto. Al volver a la
   app (AppState `active`) se vuelve a comprobar todo y las filas se marcan solas.
2. **Probar alarma:** programa una alarma real en 10 s con un id que no es de
   medicamento (sus botones no registran tomas) y pide bloquear el teléfono.
   Al volver pregunta "¿Viste la alarma en pantalla completa?":
   - Sí → se guarda "alarma probada en este teléfono" y la pantalla termina.
   - No → muestra los pasos propios de la marca (Honor/Huawei, Xiaomi, Samsung,
     Oppo/Realme, Vivo, otros) con botón a esos ajustes, y permite probar de nuevo.
3. **Cuándo aparece:** después de guardar o activar un medicamento propio con
   alarmas, si falta algún paso comprobable o la alarma nunca se probó en este
   teléfono. Ya no se bloquea el guardado (MedicationFormSheet, MedicationsScreen,
   DependentSheets).
4. **Aviso persistente:** `AlarmStatusCard` usa el mismo estado; mientras falte algo,
   "Tus alarmas podrían no sonar · Resolver" abre la misma pantalla.
5. **Nativo:** `AlarmActivity` se muestra sobre la pantalla bloqueada sin pedir PIN
   (hecho). El permiso del sistema para notificaciones sigue siendo el diálogo nativo.

## Lo que queda a criterio del implementador
- Textos exactos de cada marca, estilos y orden visual de las filas.
- Dónde se guarda el estado "probada"/"inicio automático hecho" (AppStorage, por
  dispositivo; se limpia al reinstalar).

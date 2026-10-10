# PHANTOM

## Equipos e invitaciones

Los equipos nuevos se comparten entre dispositivos mediante Supabase. Cada equipo recibe un enlace único para invitar integrantes: al abrirlo, la persona escribe su nombre y se incorpora al equipo compartido. La postulación guarda el nombre del equipo, integrantes, capitán, logo PNG/WebP, Discord, nombre de juego, perfil de Tracker y rango del capitán. Si se configura Resend, cada alta de equipo y cada nuevo integrante también genera un correo a `juanojeda0219@gmail.com`.

La página sigue funcionando en modo local si no se configura `notificationEndpoint`, pero en ese modo las invitaciones compartidas no están disponibles.

### Configuración de Supabase y Resend

1. Crea un proyecto en Supabase. Resend es opcional y solo se necesita para recibir avisos por correo; si se usa, verifica el dominio que usarás como remitente.
2. Instala Supabase CLI, inicia sesión y vincula el proyecto. Desde la raíz del repositorio, aplica las migraciones que crean la tabla compartida, los campos de postulación y la operación segura para unirse:

   ```powershell
   supabase login
   supabase link --project-ref <PROJECT_REF>
   supabase db push
   ```

3. En **Supabase → Project Settings → API**, copia la clave `service_role` y configúrala como secreto (nunca la pongas en el JavaScript del sitio ni la publiques). La función valida y limita los logos a PNG/WebP de hasta 500 KB:

   ```powershell
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> ALLOWED_ORIGIN=https://lordshadow-code.github.io
   supabase functions deploy notify-team-registration
   ```

   `SUPABASE_URL` lo proporciona Supabase al ejecutar la función. `ALLOWED_ORIGIN` debe ser el origen exacto del sitio publicado (esquema y dominio, sin `/PHANTOM-LEAGUE/`).
   Para activar correos, configura además `RESEND_API_KEY` y `RESEND_FROM_EMAIL` con un remitente verificado:

   ```powershell
   supabase secrets set RESEND_API_KEY=<RESEND_API_KEY> RESEND_FROM_EMAIL="PHANTOM <noreply@tu-dominio-verificado.com>"
   ```
4. En `index.html`, asigna a `notificationEndpoint` la URL de la función desplegada para activar el registro compartido:

   ```js
   const notificationEndpoint = "https://jlyqgwpyozpeewgjaykv.supabase.co/functions/v1/notify-team-registration";
   ```

5. Publica los cambios en GitHub Pages. Crea un equipo de prueba, copia el enlace desde la lista y ábrelo en una ventana/dispositivo distinto para comprobar que el nuevo integrante se comparte.

La tabla tiene Row Level Security habilitado y no permite acceso público directo. La función valida los datos y realiza la unión en una transacción protegida para evitar altas duplicadas por enlaces compartidos simultáneamente. El enlace es una invitación transferible: quien lo posea puede intentar unirse. CORS no sustituye la protección contra automatización; antes de aceptar tráfico público, configura límites de solicitudes y protección contra spam. Las notificaciones requieren un dominio de remitente verificado en Resend.

Los equipos antiguos guardados en `localStorage` no se migran automáticamente a Supabase; vuelve a registrarlos después de configurar la integración si necesitas compartirlos.

## Dar acceso de edición del repositorio

El acceso de edición se concede en GitHub, no desde la página publicada: abre `lordshadow-code/PHANTOM-LEAGUE` → **Settings** → **Collaborators** (o **Collaborators and teams**) → **Add people**, busca `juanojeda0219@gmail.com` y envía la invitación con el permiso de escritura adecuado. Debe aceptarla desde su cuenta de GitHub. Esto requiere que quien envía la invitación tenga permisos de administración del repositorio.

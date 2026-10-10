# PHANTOM

## Equipos e invitaciones

Los equipos nuevos se comparten entre dispositivos mediante Supabase. Cada equipo recibe un enlace único para invitar integrantes: al abrirlo, la persona escribe su nombre y su Tracker y se incorpora al equipo compartido. Al crear el equipo, se solicita el Tracker de cada integrante. El capitán inicia sesión con Discord para registrar el equipo y consultar su enlace privado. El Discord del capitán se guarda en Supabase, no se envía a los navegadores de los capitanes ni integrantes y solo aparece en el panel de administración después de validar la cuenta Discord autorizada en el servidor. La postulación también guarda el nombre del equipo, integrantes, capitán, logo PNG/WebP, nombre de juego y rango actual del capitán. Si se configura Resend, cada alta de equipo y cada nuevo integrante genera un correo a `juanojeda0219@gmail.com`; el correo no incluye el Discord.

La página sigue funcionando en modo local si no se configura `notificationEndpoint`, pero en ese modo las invitaciones compartidas no están disponibles.

### Configuración de Supabase y Resend

1. Crea un proyecto en Supabase. Resend es opcional y solo se necesita para recibir avisos por correo; si se usa, verifica el dominio que usarás como remitente.
2. Configura Discord OAuth:
   - En Discord Developer Portal, crea una aplicación y añade como OAuth2 redirect URL `https://jlyqgwpyozpeewgjaykv.supabase.co/auth/v1/callback`.
   - En Supabase → Authentication → Sign In / Providers → Discord, habilita Discord y configura el Client ID y Client Secret de esa aplicación.
   - En Supabase → Authentication → URL Configuration, permite `https://lordshadow-code.github.io/PHANTOM-LEAGUE/` como redirect URL.
   - Mantén el Client Secret solo en Supabase; nunca lo publiques ni lo añadas al frontend.
3. Instala Supabase CLI, inicia sesión y vincula el proyecto. Desde la raíz del repositorio, aplica las migraciones que crean la tabla compartida, los campos de postulación, la propiedad del capitán, los Trackers de integrantes y la operación segura para unirse:

   ```powershell
   supabase login
   supabase link --project-ref jlyqgwpyozpeewgjaykv
   supabase db push
   ```

4. En **Supabase → Project Settings → API**, copia la clave `service_role` y configúrala como secreto (nunca la pongas en el JavaScript del sitio ni la publiques). La función valida y limita los logos a PNG/WebP de hasta 500 KB:

   ```powershell
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> ALLOWED_ORIGIN=https://lordshadow-code.github.io
   supabase secrets set PHANTOM_ADMIN_DISCORD_ID=<DISCORD_USER_ID>
   supabase functions deploy notify-team-registration
   ```

   Configura `PHANTOM_ADMIN_DISCORD_ID` con el ID numérico de la cuenta Discord administradora; se compara en el servidor y no se publica en el frontend. `SUPABASE_URL` lo proporciona Supabase al ejecutar la función. `ALLOWED_ORIGIN` debe ser el origen exacto del sitio publicado (esquema y dominio, sin `/PHANTOM-LEAGUE/`).
   Para activar correos, configura además `RESEND_API_KEY` y `RESEND_FROM_EMAIL` con un remitente verificado:

   ```powershell
   supabase secrets set RESEND_API_KEY=<RESEND_API_KEY> RESEND_FROM_EMAIL="PHANTOM <noreply@tu-dominio-verificado.com>"
   ```
5. La clave pública `publishable` usada por el cliente se configura en `index.html`; es apta para frontend. Nunca añadas la clave `service_role` ni el Client Secret al sitio.
6. Publica los cambios en GitHub Pages. El endpoint comparte solo el token de invitación con la cuenta Discord que creó el equipo. La acción de unirse no devuelve el token en su respuesta.

La tabla tiene Row Level Security habilitado y no permite acceso público directo. La función valida la sesión Discord del capitán antes de crear un equipo, y solo entrega Discord y todas las postulaciones a la cuenta administradora configurada. Las operaciones de unión guardan el Tracker de cada nuevo integrante en una transacción protegida y evitan altas duplicadas por enlaces compartidos simultáneamente. Los equipos existentes conservan el Tracker del capitán, pero sus integrantes anteriores deben volver a completar su perfil para añadir los enlaces que faltan. El enlace es transferible: quien lo reciba puede intentar unirse o reenviarlo. CORS no sustituye la protección contra automatización; antes de aceptar tráfico público, configura límites de solicitudes y protección contra spam. Las notificaciones requieren un dominio de remitente verificado en Resend.

Los equipos antiguos guardados en `localStorage` no se migran automáticamente a Supabase. Los equipos compartidos creados antes de aplicar la migración de propiedad tampoco quedan vinculados automáticamente a una cuenta Discord y su invitación no se mostrará; registra de nuevo esos equipos con la cuenta Discord del capitán después del despliegue.

## Dar acceso de edición del repositorio

El acceso de edición se concede en GitHub, no desde la página publicada: abre `lordshadow-code/PHANTOM-LEAGUE` → **Settings** → **Collaborators** (o **Collaborators and teams**) → **Add people**, busca `juanojeda0219@gmail.com` y envía la invitación con el permiso de escritura adecuado. Debe aceptarla desde su cuenta de GitHub. Esto requiere que quien envía la invitación tenga permisos de administración del repositorio.

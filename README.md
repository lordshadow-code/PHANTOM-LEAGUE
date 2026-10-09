# PHANTOM

## Notificaciones de registro de equipos

La página estática puede guardar equipos en el navegador, pero ese almacenamiento no es compartido entre visitantes. Para enviar una notificación por cada equipo nuevo a `juanojeda0219@gmail.com`, se incluye la función Supabase Edge `notify-team-registration`, que entrega el mensaje a través de Resend. Las claves privadas se configuran únicamente como secretos de Supabase.

### Configuración

1. Crea un proyecto en Supabase y una cuenta en Resend. Verifica en Resend el dominio que usarás como remitente.
2. Instala e inicia sesión en Supabase CLI, vincula el proyecto y configura los secretos:

   ```powershell
   supabase login
   supabase link --project-ref <PROJECT_REF>
   supabase secrets set RESEND_API_KEY=<RESEND_API_KEY> RESEND_FROM_EMAIL="PHANTOM <noreply@tu-dominio-verificado.com>" ALLOWED_ORIGIN=https://lordshadow-code.github.io
   supabase functions deploy notify-team-registration
   ```

   Usa la URL de origen exacta de GitHub Pages si difiere de `https://lordshadow-code.github.io`. `ALLOWED_ORIGIN` es el origen (esquema y dominio), no incluye la ruta `/PHANTOM-LEAGUE/`.
3. En `index.html`, asigna a `notificationEndpoint` la URL de la función desplegada:

   ```js
   const notificationEndpoint = "https://<PROJECT_REF>.supabase.co/functions/v1/notify-team-registration";
   ```

4. Publica los cambios en GitHub Pages. Envía un equipo de prueba y confirma que llega el correo. Si la URL no está configurada, el formulario sigue guardando localmente y avisa que no se enviaron notificaciones.

La función valida los datos recibidos, restringe los orígenes del navegador y no expone la clave de Resend en el sitio. La restricción de origen no evita solicitudes directas automatizadas; antes de aceptar registros públicos, agrega protección contra spam (por ejemplo, Cloudflare Turnstile) y límites de envío en tu cuenta de correo.

Los equipos que ya existan en el `localStorage` de los visitantes no se pueden importar ni notificar automáticamente; esos datos están guardados en sus respectivos navegadores.

## Dar acceso de edición del repositorio

El acceso de edición se concede en GitHub, no desde la página publicada: abre `lordshadow-code/PHANTOM-LEAGUE` → **Settings** → **Collaborators** (o **Collaborators and teams**) → **Add people**, busca `juanojeda0219@gmail.com` y envía la invitación con el permiso de escritura adecuado. Debe aceptarla desde su cuenta de GitHub. Esto requiere que quien envía la invitación tenga permisos de administración del repositorio.
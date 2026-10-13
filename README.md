# PHANTOM LEAGUE

Sitio público en GitHub Pages. Los equipos se mantienen como datos versionados en [`equipos.json`](./equipos.json), porque cambian rara vez. El calendario y sus resultados se mantienen en [`partidos.json`](./partidos.json). La página consulta ambos archivos usando la API pública de GitHub Contents; no requiere base de datos, Apps Script, login, claves API ni secretos en el navegador.

## Cómo se actualizan los datos

### Equipos — `equipos.json`

Edita `equipos.json` en el repositorio y crea un commit en `main`. GitHub Pages publicará la nueva lista después de ejecutar el workflow.

Formato:

```json
{
  "version": 1,
  "teams": [
    {
      "id": "midnight-crew",
      "name": "Midnight Crew",
      "captain": "Nombre del capitán",
      "members": ["Jugador 1", "Jugador 2"],
      "logo": "images/midnight-crew.svg",
      "playerName": "Nombre de juego del capitán",
      "rank": "Rango actual",
      "trackers": {
        "Jugador 1": "https://tracker.example/perfil-1",
        "Jugador 2": "https://tracker.example/perfil-2"
      },
      "active": true
    }
  ]
}
```

Campos requeridos: `id` único, `name`, `captain` y `members` (lista de nombres). Los demás son opcionales:

- `logo`: URL HTTPS o ruta pública del repositorio, por ejemplo `images/mi-equipo.svg`.
- `playerName` y `rank`: texto que aparece en la ficha del equipo.
- `trackers`: objeto con nombre de integrante como clave y URL HTTP(S) como valor.
- `active`: `true` por defecto; usa `false` para conservar un equipo en el archivo pero ocultarlo del sitio y de la tabla.

No pongas en este archivo direcciones privadas, credenciales, tokens de invitación ni el Discord privado de capitanes. Todo contenido de `equipos.json` es público. Los IDs de los equipos son referencias estables usadas por `partidos.json`; conserva el ID cuando cambies el nombre.

### Partidos y resultados — `partidos.json`

El administrador con permiso de escritura en GitHub abre [`partidos.json`](https://github.com/lordshadow-code/PHANTOM-LEAGUE/edit/main/partidos.json), edita el JSON y confirma el cambio en `main`. No hace falta token de GitHub en el frontend. La página vuelve a consultar el archivo mediante GitHub API cuando se carga.

Formato:

```json
{
  "version": 1,
  "matches": [
    {
      "id": "jornada-1-midnight-vs-neon",
      "homeTeamId": "midnight-crew",
      "awayTeamId": "neon-arena",
      "date": "2026-10-20",
      "homeMaps": null,
      "awayMaps": null
    }
  ]
}
```

- `id` debe ser único dentro del archivo.
- `homeTeamId` y `awayTeamId` deben coincidir con IDs de `equipos.json` y no pueden ser iguales.
- `date` usa `AAAA-MM-DD`.
- Partido pendiente: `homeMaps` y `awayMaps` son ambos `null`.
- Resultado final: ambos son enteros de 0 a 99, por ejemplo `2` y `1`. No dejes un solo marcador vacío.
- Para corregir o retirar un partido, edita o elimina el objeto y confirma el cambio. El historial permanece en Git.

Puntuación: victoria = 3 puntos, empate = 1 punto para cada equipo, derrota = 0. La clasificación desempata por puntos, diferencia global de mapas, mini-tabla de enfrentamientos directos entre los equipos igualados y diferencia de mapas en esa mini-tabla. Si persiste el empate, se ordenan alfabéticamente.

## Arquitectura y publicación

- `index.html`: frontend público; lee los dos JSON desde `https://api.github.com/repos/lordshadow-code/PHANTOM-LEAGUE/contents/{archivo}?ref=main`.
- `equipos.json`: lista pública de equipos.
- `partidos.json`: calendario y resultados públicos.
- `css/style.css` e `images/`: presentación del sitio.
- `.github/workflows/pages.yml`: publicación de GitHub Pages al hacer push a `main`.

La API de GitHub para repositorios públicos no usa token de lectura, pero tiene límite de solicitudes anónimas. El sitio hace una solicitud por cada JSON al cargar. Si el repositorio se vuelve privado o se agota el límite, aparecerá un error de lectura; no se publican datos locales como alternativa silenciosa.

Las escrituras se hacen autenticándose en GitHub y confirmando un cambio en el repositorio. El botón del sitio abre la edición de `partidos.json`; GitHub aplica los permisos normales de colaboradores. No se incluye escritura API desde el navegador porque eso requeriría exponer una credencial con permiso de escritura.

## Migración desde los registros de equipos anteriores

Si todavía necesitas los equipos guardados en la tabla Supabase `phantom_teams`, exporta esos registros y transforma cada fila al formato de `equipos.json`:

- `id` → usa un ID corto, estable y único; actualiza a la vez los IDs referenciados en `partidos.json`.
- `name`, `captain`, `members`, `player_name`, `rank` → `name`, `captain`, `members`, `playerName`, `rank`.
- `logo_data`: es preferible guardar cada imagen como archivo en `images/` y usar su ruta en `logo`.
- `member_trackers`: mapéalo a `trackers`. Conserva únicamente los datos que quieres exponer públicamente.
- No copies `discord_name`, `captain_user_id`, `invite_token` ni emails al archivo público.

No se importan cuentas Discord, propiedad de capitán, sesiones ni enlaces de invitación antiguos: esta versión es pública y de solo lectura. Verifica la lista exportada antes de hacer commit.

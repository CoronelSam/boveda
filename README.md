# La Bóveda

API REST de secretos para una agencia de inteligencia, hecha con Node, Express 5, MySQL (usuarios), MongoDB Atlas (secretos) y JWT.

**Regla de oro: nadie, ni siquiera el jefe, puede leer un secreto por su cuenta.** Un secreto solo se abre si se cumple al menos una de estas condiciones:

- **Quórum:** 2 agentes distintos lo solicitaron en los últimos 5 minutos.
- **Tiempo:** la hora del servidor es igual o posterior a `fechaApertura`.

## Requisitos

- Node 24
- pnpm
- MySQL en local
- Una cuenta de MongoDB Atlas (sirve el cluster gratuito)

## Puesta en marcha

### 1. Instalar dependencias

```bash
pnpm install
```

### 2. Crear el archivo `.env`

```bash
cp .env.example .env
```

`.env` no se sube al repositorio. Los pasos siguientes explican cómo completar cada valor.

### 3. Generar los dos secretos JWT

Ejecuta este comando **dos veces** y usa un resultado distinto para `JWT_SECRET` y para `JWT_REVELAR_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

El servidor no arranca si falta alguno, si tiene menos de 32 caracteres o si los dos son iguales.

Los valores de ejemplo de `.env.example` son demasiado cortos a propósito: el servidor no arranca hasta que los reemplaces.

### 4. Crear el cluster de MongoDB Atlas

1. Crea un cluster gratuito en [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. En *Database Access*, crea un usuario con permiso `readWrite` solo sobre la base `boveda`.
3. En *Network Access*, agrega tu IP. Si cambias de red (por ejemplo, en clase), agrégala de nuevo o la conexión fallará por timeout.
4. Copia la cadena de conexión `mongodb+srv://...` en `MONGO_URI`, dentro de `.env`, y revisa dos cosas:
   - Agrega `/boveda` antes del `?`. Sin eso, Mongoose usa la base `test`.
   - Si el password tiene caracteres especiales (`@`, `:`, `/`, `#`), codifícalo con `encodeURIComponent`:

     ```bash
     node -e "console.log(encodeURIComponent(process.argv[1]))" 'tu-password'
     ```

La cadena queda con esta forma:

```dotenv
MONGO_URI=mongodb+srv://usuario:clave@tu-cluster.mongodb.net/boveda?retryWrites=true&w=majority
```

### 5. Crear la base y el usuario de MySQL

Si instalaste MySQL con Homebrew, inícialo (ajusta la versión a la que tengas):

```bash
brew services start mysql@9.7
```

Crea la base y el usuario. Antes de ejecutarlo, cambia `cambia-esta-clave` por una clave propia. El comando pide la clave de `root`; si no tiene, pulsa Enter:

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS boveda; CREATE USER IF NOT EXISTS 'boveda'@'localhost' IDENTIFIED BY 'cambia-esta-clave'; GRANT ALL PRIVILEGES ON boveda.* TO 'boveda'@'localhost';"
```

Pon esa misma clave en `MYSQL_PASSWORD`, dentro de `.env`. Las tablas se crean solas al arrancar.

### 6. Arrancar el servidor

```bash
pnpm dev
```

Por defecto escucha en el puerto 3001 (`http://localhost:3001`). Si todo está bien, la consola muestra que MySQL y MongoDB se conectaron.

## Pruebas

### Regla de apertura

```bash
pnpm test
```

Prueba la regla de apertura con casos límite. No necesita servidor ni bases de datos, porque la hora se inyecta en la función.

### Colección de Postman

Necesita la API corriendo y las dos bases conectadas.

1. En Postman, elige **Import** y selecciona `postman/boveda.postman_collection.json`.
2. Abre la colección y elige **Run**.
3. Deja el orden como está y ejecuta. Si la API no está en `http://localhost:3001`, cambia antes la variable de colección `baseUrl`.

La colección está pensada para correr completa y de arriba abajo: cada request usa los tokens y el id que guardaron los anteriores. Cada corrida usa un sufijo nuevo, así que se puede repetir sin que los emails choquen.

Cada corrida deja datos en las bases: 4 cuentas con email `agente-*@prueba.local` y un secreto con título `PRUEBA ...`. La API no tiene endpoints para borrarlos; consulta [Preparación del atraco](#preparación-del-atraco) para limpiarlos.

## Endpoints

Todas las respuestas son JSON. Los errores siempre tienen la forma `{ "error": "mensaje legible" }`. Las rutas `/secretos/*` exigen el header `Authorization: Bearer <jwt>`.

| Método | Ruta | Auth | Body | Respuestas |
|---|---|---|---|---|
| `POST` | `/auth/registro` | No | `{ nombre, email, password }`: strings; `password` de al menos 8 caracteres. `rol` se ignora: siempre se crea como `agente` | **201** `{ id, nombre, email, rol }`<br>**400** datos inválidos<br>**409** email ya registrado |
| `POST` | `/auth/login` | No | `{ email, password }` | **200** `{ token }` (payload `{ id, rol }`, HS256, expira en 1 h)<br>**400** datos inválidos<br>**401** `Credenciales inválidas`, igual si el email no existe o si el password no coincide |
| `POST` | `/secretos` | Bearer | `{ titulo, contenido, fechaApertura? }`: `titulo` y `contenido` son strings no vacíos; `fechaApertura` es una fecha ISO. Cualquier otro campo se ignora | **201** `{ id, titulo, fechaApertura, creadoPor }`, sin contenido<br>**400** datos inválidos<br>**401** token inválido |
| `GET` | `/secretos` | Bearer | Ninguno | **200** `[{ id, titulo, fechaApertura, numSolicitudes }]`<br>**401** token inválido |
| `POST` | `/secretos/:id/solicitar` | Bearer | Ninguno; si llega, se ignora | **200** `{ mensaje, solicitudesVigentes, faltan }`<br>**401** token inválido<br>**403** `El creador no cuenta para el quórum`<br>**404** no existe o id mal formado |
| `GET` | `/secretos/:id/abrir` | Bearer | Ninguno | **200** `{ tokenRevelar, expiraEn: 60 }`, sin contenido<br>**401** token inválido<br>**403** regla no cumplida, explicando qué falta<br>**404** no existe o id mal formado |
| `GET` | `/secretos/:id/revelar` | Bearer y header `X-Token-Revelar` | Ninguno | **200** `{ contenido }`, una sola vez<br>**401** token inválido, vencido, de otra cuenta o de otro secreto<br>**403** `Token ya utilizado`<br>**404** no existe o id mal formado |

Si un agente solicita de nuevo, se renueva la fecha de su solicitud y no se crea otra.

Ejemplo de 403 en `/abrir`:

```json
{
  "error": "El secreto sigue cerrado",
  "faltan": 1,
  "detalle": "Se necesitan solicitudes de 2 agentes distintos (sin contar al creador ni a cuentas creadas después del secreto) en los últimos 5 minutos, y tú debes ser uno de ellos. Hay 1 vigente.",
  "fechaApertura": "2026-11-03T20:00:00.000Z"
}
```

Códigos de estado:

| Código | Cuándo |
|---|---|
| 400 | Datos faltantes o con tipo inválido |
| 401 | Sin token, token mal formado, inválido o expirado; credenciales incorrectas |
| 403 | Regla de apertura no cumplida o acción no permitida |
| 404 | El recurso no existe (incluye ids mal formados) |
| 409 | Email ya registrado |
| 413 | El cuerpo JSON supera el límite de 10 kb |
| 500 | Cualquier otro error, con el mensaje genérico `Error interno` |

## Decisiones de la regla de apertura

| Pregunta | Decisión | Motivo |
|---|---|---|
| ¿Qué pasa si el mismo agente solicita dos veces? | Cuenta una sola vez: se renueva su fecha y además se cuentan `userId` distintos | Un agente no es un quórum |
| ¿Cuenta el creador para el quórum? | No. No puede solicitar su propio secreto y, si aparece, se descarta | Si contara, al creador le bastaría un solo cómplice para abrirlo |
| ¿Y si mandan la fecha o su `userId` en el body? | Se ignoran; siempre se usan el token y el reloj del servidor | La identidad sale solo del JWT y las fechas solo del servidor |
| ¿El jefe se salta las reglas? | No | "Nadie, ni siquiera el jefe" |
| ¿Quién puede llamar a `/abrir` cuando hay quórum? | Solo uno de los agentes que forman el quórum vigente | Si no, un atacante esperaría a que dos agentes legítimos soliciten y abriría él dentro de esos 5 min |
| ¿Y cuando abre por tiempo? | Cualquier agente autenticado | La fecha de apertura ya llegó |
| ¿Cómo se mide la ventana? | Al momento de `/abrir`, cada solicitud debe tener `fecha >= ahora − 5 min` (límite inclusivo) | "Dentro de los últimos 5 minutos" |

## Preparación del atraco

Otro equipo intentará leer nuestro secreto `¡Nos robaron!` sin cumplir la regla, solo a través de la API.

### 1. Limpiar los datos de prueba

Si corriste la colección contra estas mismas bases, borra sus datos antes de seguir. Las cuentas `@prueba.local` usan la contraseña publicada en la colección: quien consiga uno de esos emails puede entrar con ella y usar la cuenta para formar quórum.

```bash
mysql -u boveda -p boveda -e "DELETE FROM usuarios WHERE email LIKE '%@prueba.local';"
```

Los secretos de prueba se borran desde Atlas: en *Browse Collections*, abre `boveda.secretos`, filtra con `{ "titulo": { "$regex": "^PRUEBA " } }` y elimina los resultados.

### 2. Crear la cuenta para el equipo atacante

No entregues todavía la URL: si el atacante la tiene antes de que exista el secreto, puede registrar cuentas que sí contarían para el quórum.

Cambia el email y la clave por los que vayas a entregarles:

```bash
curl -X POST http://localhost:3001/auth/registro -H "Content-Type: application/json" -d '{"nombre":"Equipo atacante","email":"atacante@ejemplo.com","password":"cambia-esta-clave"}'
```

### 3. Crear el secreto con otra cuenta

Registra la cuenta que será dueña del secreto:

```bash
curl -X POST http://localhost:3001/auth/registro -H "Content-Type: application/json" -d '{"nombre":"Custodio","email":"custodio@ejemplo.com","password":"cambia-esta-otra-clave"}'
```

Inicia sesión para obtener su token:

```bash
curl -X POST http://localhost:3001/auth/login -H "Content-Type: application/json" -d '{"email":"custodio@ejemplo.com","password":"cambia-esta-otra-clave"}'
```

Crea el secreto con ese token, sin `fechaApertura`, para que no se pueda abrir por tiempo durante el atraco:

```bash
curl -X POST http://localhost:3001/secretos -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d '{"titulo":"Expediente","contenido":"¡Nos robaron!"}'
```

### 4. Entregar la URL y la cuenta de prueba

Con el secreto ya creado, entrega al otro equipo la cuenta del paso 2 y la URL. Cualquier cuenta que registren a partir de aquí no cuenta para el quórum.

El servidor ya escucha en `0.0.0.0`, así que la URL es `http://<IP-LAN>:3001`. En macOS, la IP se obtiene con:

```bash
ipconfig getifaddr en0
```

O bien abre un túnel:

```bash
cloudflared tunnel --url http://localhost:3001
```

### 5. Durante el atraco

No solicites ese secreto con cuentas propias: abriría una ventana de quórum.

Al atacar a otro equipo:

- Solo se ataca a través de su API (Postman, Thunder Client, curl). No se toca su código ni su base de datos.
- Están prohibidos la denegación de servicio, los scripts que saturen el servidor y borrar datos.
- Documenta en [`ATRACO.md`](ATRACO.md) los pasos exactos de lo que funcione: un ataque exitoso y bien explicado da +5%.

## Fase 2 — defensa y bonus implementados

La Fase 2 conserva los endpoints originales y modifica el comportamiento de `GET /secretos/:id/abrir`.

### Defensa contra cuentas desechables

Solo las cuentas cuya fecha `usuarios.createdAt` en MySQL sea **estrictamente anterior** a `secretos.createdAt` en MongoDB pueden formar el quórum. El servidor consulta MySQL y entrega la lista de cuentas elegibles al evaluador puro. Ni `userId` ni las fechas de las solicitudes se toman del cliente. La apertura por `fechaApertura` sigue funcionando aunque la cuenta sea nueva.

**Orden obligatorio de la demostración:** registra A, B y C **antes** de crear el secreto. Si usas la colección de Postman actualizada, este orden ya está preparado. Las cuentas nuevas creadas después de un secreto existente no sirven para conseguir su quórum. Una cuenta creada antes sigue siendo un riesgo si el atacante controla sus credenciales: no equivale a una aprobación de identidad.

### Revelación con token de un solo uso

1. `GET /secretos/:id/abrir` con `Authorization: Bearer <tokenSesion>` comprueba el quórum o la hora y devuelve `{ "tokenRevelar": "...", "expiraEn": 60 }` (sin contenido).
2. `GET /secretos/:id/revelar` exige **dos** headers: `Authorization: Bearer <tokenSesion>` y `X-Token-Revelar: <tokenRevelar>`. Devuelve `{ "contenido": "..." }` solo una vez.
3. El token de revelación está firmado con `JWT_REVELAR_SECRET`, dura 60 segundos, está vinculado al usuario y al secreto y tiene `jti` único. La colección MongoDB `tokenusados` garantiza la invalidación atómica mediante índice único; el índice TTL elimina documentos expirados eventualmente.
4. El segundo uso devuelve `403 Token ya utilizado`; un token inválido, vencido, de otra cuenta o de otro secreto devuelve `401`. El JWT de sesión no sirve en `X-Token-Revelar` ni el de revelar sirve como Bearer.

### Ejecución y pruebas

```bash
pnpm install
pnpm test
pnpm dev
```

Importa `postman/boveda.postman_collection.json` en Postman. Ejecuta la colección completa en orden y revisa todos los tests, especialmente `B abre el secreto`, `B revela el secreto` y el intento de reutilización. La variable `baseUrl` inicia como `http://localhost:3001`.

El servidor requiere `.env` local con las variables de `.env.example` y MySQL/MongoDB accesibles. Nunca compartas `.env` ni `node_modules` al entregar el ZIP. El índice único de `TokenUsado` se inicializa durante el arranque, antes de aceptar solicitudes.

Las pruebas unitarias no sustituyen las verificaciones HTTP contra las dos bases reales. Revisa `AUDITORIA_FASE2.md` para las quince pruebas defensivas.

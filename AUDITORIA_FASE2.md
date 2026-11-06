# Auditoría de la Fase 2 — checklist de seguridad

**Estado:** el 6 de noviembre de 2026 se probó el commit `98b8a6e` por HTTP, desde un clon limpio del repositorio arrancado con `pnpm dev`, con MySQL local y MongoDB Atlas conectados. Los 15 ataques dieron el resultado esperado. El ataque 14 pasa en su mensaje, pero deja un riesgo abierto: no hay límite de intentos.

| Prueba | Resultado |
|---|---|
| `pnpm test` | 20 de 20 |
| Colección de Postman, corrida con newman | 30 requests y 84 comprobaciones, sin fallos |
| 15 ataques y 3 comprobaciones extra | 18 de 18 |
| Contrato de la API, con los campos exactos de cada respuesta | 82 de 82 |
| Tiempos con el reloj real | 6 de 6 |

## Los 15 ataques

| # | Prueba | Resultado esperado | Resultado real |
|---|---|---|---|
| 1 | Revisar POST /secretos, GET /secretos y respuestas 403 | Nunca aparece `contenido` | Crear 201, listar 200, abrir 403; el contenido no aparece en ninguna |
| 2 | Enviar `rol: jefe` al registro | Se crea `agente` | 201, rol `agente` |
| 3 | Suplantar `userId` y `fecha` en `/solicitar` | Se ignoran | 1 vigente, falta 1; abrir da 403 |
| 4 | Inyectar `creadoPor` y `solicitudes` en POST /secretos | Se ignoran | `creadoPor` sale del token, 0 solicitudes; abrir da 403 |
| 5 | Solicitar repetidamente y en paralelo con el mismo token | Un solo agente cuenta | 20 solicitudes en paralelo dejan 1 entrada; abrir da 403 |
| 6 | El creador intenta solicitar | 403 | Solicitar 403; creador más un agente no abren (403) |
| 7 | Un tercero ajeno al quórum intenta abrir | 403 | Tercero 403; participante 200, sin contenido |
| 8 | JWT alterado, vencido, con `alg: none` o firmado con otra clave | 401 | 401 en los 7 casos: `alg: none`, payload editado, secretos `secret`, `123456` y `jwt_secret`, vencido y HS512 |
| 9 | Intercambiar el token de sesión y el de revelar | 401 | 401 en los 4 casos: revelar como Bearer, sesión como revelar, revelar firmado con la clave de sesión y sesión con claim `tipo` |
| 10 | Reutilizar el token de revelar, canjearlo en paralelo o usarlo en otro secreto | Solo un canje da 200; los demás, 403 o 401 | Primer uso 200, segundo 403; 12 canjes en paralelo dan 1×200 y 11×403; otro secreto, otra cuenta, vencido, sin `jti`, sin token y sin sesión dan 401 |
| 11 | Enviar `{ "email": { "$ne": null } }` y `{ "titulo": { "$gt": "" } }` | 400 | Login, registro y crear dan 400 |
| 12 | Usar id `abc`, `%7B%7D`, `%`, `%E0%A4%A`, uno de 12 caracteres y uno inexistente | 404, sin stack trace | 404 en los 18 casos de `abrir`, `solicitar` y `revelar`. Con un id inexistente y un token de otro secreto, `revelar` responde 401 porque valida el token antes de buscar el id |
| 13 | Mandar JSON de más de 10 KB | 413, sin filtraciones | 413 con mensaje genérico |
| 14 | Intentar contraseñas incorrectas en login | 401 genérico; **no hay límite de intentos** | Mismo cuerpo 401 con email existente e inexistente; 5 intentos seguidos sin bloqueo. **Riesgo abierto** |
| 15 | Crear dos cuentas después del secreto, solicitar y abrir | 403, no cuentan para el quórum | 0 vigentes para ambas; abrir 403; antigua más nueva 403; nueva con quórum ajeno 403; dos antiguas 200 |

Comprobaciones extra:

- Con `fechaApertura` pasada, una cuenta nueva abre y revela (200). Con fecha futura, un token con rol `jefe` recibe 403.
- En las 138 respuestas de estos ataques, `contenido` solo salió en `/revelar` con 200. No hubo errores 5xx ni mensajes internos de Mongo o Sequelize.

## Tiempos con el reloj real

| Prueba | Resultado |
|---|---|
| Token de revelar a los 50 s | 200 |
| Token de revelar, nunca usado, a los 62 s | 401 |
| Quórum a los 4 min 40 s | 200 |
| Quórum a los 5 min 5 s | 403, faltan 2 |
| Solo un agente renueva su solicitud | 403, falta 1 |
| Los dos agentes renuevan su solicitud | 200 |

## Invariantes de seguridad

| Invariante | Cómo se comprobó |
|---|---|
| `contenido` solo sale al revelar | `select: false` en el modelo; solo `revelar` pide `+contenido`; aparece únicamente en `/revelar` con 200 |
| La identidad sale solo del JWT | El código usa `req.usuario`; ataques 3 y 4 |
| Las fechas salen del reloj del servidor | `solicitudes[].fecha` usa `new Date()`; ataque 3 |
| Lista blanca de campos | Los `create` reciben objetos explícitos; ataques 2 y 4 |
| El rol `jefe` no se salta nada | `jefe` solo aparece en el ENUM de `Usuario`; token con rol `jefe` recibe 403 |
| El password nunca sale | Ninguna respuesta trae `password` ni un hash; las 21 cuentas de la corrida se guardaron con bcrypt de costo 10 |
| JWT estricto | El servidor no arranca sin `.env` ni con los valores de `.env.example`; HS256 fijo, expira en 1 h; ataque 8 |
| Errores sin filtraciones | Los 49 errores del contrato tienen la forma `{ error }`, sin stack ni mensajes internos |
| Validación de tipos | Ataque 11; objetos, arreglos y números en los campos de texto y de fecha dan 400 |
| Sin endpoints fuera del contrato | 14 rutas como `PUT` y `DELETE` sobre secretos, `/usuarios`, `/debug`, `/admin` y `/.env` dan 404 |

También se comprobó:

- `tokenusados` tiene índice único en `jti` e índice TTL en `expiraEn`.
- El log del servidor no tiene contenido, passwords, hashes, JWT ni la cadena de Mongo.
- Los valores reales de `.env` no aparecen en el historial de git.

## Riesgos restantes

- **Sin límite de intentos en login.** Es opcional para este reto. Para una exposición pública conviene añadir un límite por IP y por cuenta. Usen contraseñas largas en las cuentas propias.
- **Una cuenta anterior al secreto sigue siendo elegible.** La fecha de creación solo frena las cuentas registradas después. Si el atacante recibe la URL antes de que exista el secreto, puede registrar cuentas que sí cuenten. Por eso la URL se entrega al final.
- **Una cuenta anterior puede sumarse a un quórum legítimo.** Si un agente legítimo ya solicitó, la cuenta de prueba del atacante, si es anterior al secreto, puede solicitar y abrir dentro de esos 5 minutos. Por eso no se debe solicitar el secreto con cuentas propias durante el atraco.
- **Limpieza con retraso.** El índice TTL borra los tokens usados con algo de retraso. No afecta a la seguridad: el token ya venció cuando se borra su registro.

## Qué no se probó

- Abrir la colección en la aplicación de Postman: se corrió con newman.
- Esperar 1 hora real a que venza una sesión: se probó con un token firmado con una fecha ya pasada.
- Crear desde cero un cluster de Atlas y la base de MySQL: se usaron los que ya existían.

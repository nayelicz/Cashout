# Evidencias (Devnet)

Program ID: `7nrJPFyaGoRgDpGi4hakZ2sX9smCpoTUnLEhm4oxgQrX`

| Archivo | Qué muestra |
|---|---|
| `00-portada.png` | Frontend corriendo en Codespaces, conectado al programa en Devnet |
| `02-reserva-creada.png` | `initialize_reservation` firmado con Phantom (wallet Remitente) y confirmado |
| `08-cobro-comercio.png` | `validate_cashout` desde `/merchant`: 99.75 % al comercio, 0.25 % a tesorería |
| `token-de-prueba.png` | `yarn demo-token:devnet`: token SPL de prueba repartido a remitente y comercio |
| `cancelacion-devnet.txt` | Baja condicionada: rechazo `WaitUntilExpiration` y `cancel_reservation` exitoso; historial completo de la reserva |
| `pruebas-localnet.txt` | Salida de la suite de 24 pruebas |

Las firmas de todas las transacciones están en la sección 8 del README principal.

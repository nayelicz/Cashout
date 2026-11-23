# Evidencias (Devnet)

Program ID: `7nrJPFyaGoRgDpGi4hakZ2sX9smCpoTUnLEhm4oxgQrX`

| Archivo | Qué muestra |
|---|---|
| `00-portada.png` | Frontend corriendo en Codespaces, conectado al programa en Devnet |
| `01-wallet-conectada.png` | Wallet del remitente (Phantom, Devnet) conectada y formulario de reserva |
| `02-reserva-creada.png` | `initialize_reservation` firmado y confirmado (PDA + Tx) |
| `03-mis-reservas.png` | **Lectura**: "Mis reservas" lee la cuenta on-chain (monto, estado, vencimiento) |
| `04-extender.png` | **Modificación**: `update_reservation` (+1 día, vence 11/27) confirmada |
| `04b-extender-explorer.png` | La transacción de `update_reservation` en Solana Explorer (Success) |
| `05-error-cancelar.png` | **Regla de baja**: el remitente no puede cancelar antes del vencimiento (`WaitUntilExpiration`) |
| `06a-confirmar-aprobacion.png` | Phantom pidiendo firma para `mark_verified` |
| `06-aprobada.png` | Reserva "verificada ✓" tras `mark_verified` |
| `08a-comercio-conectado.png` | Wallet del comercio (en whitelist) conectada |
| `08b-confirmar-cobro.png` | Phantom mostrando el cobro: +9.975 tokens al comercio |
| `08-cobro-comercio.png` | `validate_cashout` completado desde `/merchant` (99.75 % comercio, 0.25 % tesorería) |
| `token-de-prueba.png` | `yarn demo-token:devnet`: token SPL de prueba repartido |
| `cancelacion-devnet.txt` | Baja condicionada: rechazo `WaitUntilExpiration` y `cancel_reservation` exitoso + historial de la reserva |
| `pruebas-localnet.txt` | Salida de la suite de 24 pruebas |

Las firmas de todas las transacciones están en la sección 8 del README principal.

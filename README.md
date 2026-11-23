# Cashout: remesas con retiro en efectivo sobre Solana

> **Ruta elegida: Proyecto propio.**
> Programa Anchor + cliente TypeScript coherente con su IDL + frontend Next.js con wallet, conectado a **Devnet**.

| | |
|---|---|
| **Program ID (Devnet)** | `7nrJPFyaGoRgDpGi4hakZ2sX9smCpoTUnLEhm4oxgQrX` · [Explorer](https://explorer.solana.com/address/7nrJPFyaGoRgDpGi4hakZ2sX9smCpoTUnLEhm4oxgQrX?cluster=devnet) |
| **Nombre para el certificado** | `<Nombre completo>` |
| **Correo de registro** | `<correo usado en el registro>` |
| **Versión de partida** | Proyecto base (`nayelicz/remesa-liquidez`, rama `feature/tia-updates`) |

---

## 1. Propósito

En LATAM, quien recibe una remesa muchas veces necesita **efectivo**. Cashout bloquea la remesa en un *escrow* on-chain y la libera solo cuando un **comercio autorizado** entrega el efectivo al receptor:

1. El **remitente** deposita tokens en una bóveda (PDA) a nombre del receptor, con fecha de vencimiento.
2. El remitente **aprueba la identidad** del receptor (`mark_verified`).
3. Un **comercio del whitelist** liquida (`validate_cashout`): recibe los tokens menos una comisión de 0.25 % que va a la tesorería, y la reserva se cierra.
4. Si no se cobra, la reserva puede **darse de baja** con reembolso, según reglas de permiso y tiempo.

Las integraciones de WhatsApp, voz (ElevenLabs), World ID y FX del proyecto base quedan **fuera del flujo evaluado**: el flujo completo se prueba solo con wallets de Devnet.

---

## 2. Modelo de cuentas (PDAs relacionadas)

| Cuenta | Seeds | Relación | Rol |
|---|---|---|---|
| `Config` | `["config"]` | singleton | Guarda la autoridad `admin` del protocolo |
| `MerchantAccount` | `["merchant", merchant]` | creada por `config.admin` | Whitelist de comercios (`active`) |
| `TurnReservation` | `["reservation", receiver]` | `sender`, `receiver`, `merchant`, `mint` | La remesa (estado, monto, vencimiento, verificación) |
| `vault` (token account) | `["vault", reservation]` | authority = reservation PDA | Custodia los tokens de la reserva |
| `treasury` / `treasury_vault` | `["treasury"]`, `["treasury_vault", mint]` | por mint | Acumula las comisiones |

## 3. Operaciones y reglas del programa

| Operación | Tipo | Quién puede | Regla aplicada en Rust |
|---|---|---|---|
| `initialize_config` | Crear | primer admin | PDA singleton (`init`) |
| `register_merchant` | Crear | **solo `config.admin`** | `constraint config.admin == admin` → `UnauthorizedAdmin` |
| `set_merchant_status` | Modificar | **solo `config.admin`** | idem → `UnauthorizedAdmin` |
| `initialize_reservation` | Crear | remitente (firma) | `amount > 0`, `expiry > 0`; transfiere al vault |
| `update_reservation` | Modificar | **solo el remitente original** | `has_one = sender`; solo `Active`, **sin verificar** y vigente (`ReservationLocked`, `ReservationExpired`, `NothingToUpdate`) |
| `mark_verified` | Modificar | solo el remitente original | `has_one = sender`; no repetir (`AlreadyVerified`) |
| `validate_cashout` | Modificar + **cierre** | comercio del whitelist activo | verificado, vigente, comercio asignado si lo hay; **cierra reserva y vault** (`close = sender`) |
| `cancel_reservation` | **Baja condicionada** | receptor o remitente | receptor: siempre; remitente: **solo después del vencimiento** (`WaitUntilExpiration`); otro: `UnauthorizedCancellation`. Reembolsa y cierra |
| `withdraw_treasury` | Modificar | solo `config.admin` | `UnauthorizedAdmin`, `InsufficientTreasury` |
| Lectura | Leer | cualquiera | Frontend: `program.account.turnReservation.all([memcmp sender])` |

**Equivalencia con los casos de "Pruebas y evidencias"** (los nombres cambian, las competencias son las mismas):

| Caso del curso | En Cashout |
|---|---|
| Registro (negocio) | `Config` + `MerchantAccount`: alta de comercio controlada por la autoridad |
| Cliente | `TurnReservation`: cuenta del remitente/receptor con su vault |
| Venta | `validate_cashout`: liquidación con comisión a tesorería |
| Baja de cliente | `cancel_reservation`: cierre condicionado por permiso y vencimiento |

---

## 4. Aporte propio (qué añadí o corregí y cómo se comprueba)

Partí de mi proyecto base. Estos son los cambios **funcionales** de esta entrega; cada uno tiene pruebas marcadas `[aporte]` en `tests/remesa-liquidez.ts`.

| # | Cambio | Antes | Ahora | Prueba |
|---|---|---|---|---|
| 1 | **Corrección de autoridad** en `register_merchant` | Cualquier wallet podía registrarse como comercio y cobrar reservas abiertas | Solo `config.admin` | `register_merchant: non-admin cannot whitelist itself (UnauthorizedAdmin)` |
| 2 | **Corrección de ciclo de vida**: cierre al cobrar | La reserva quedaba en `Completed`; como la PDA es `["reservation", receiver]`, **ese receptor ya no podía recibir otra remesa** y el rent quedaba bloqueado | `validate_cashout` cierra reserva y vault, y el rent vuelve al remitente | `cashout closes the reservation + vault…`, `same receiver can get a second remittance…`, `cashout rejects a wrong sender account` |
| 3 | **Nueva operación** `update_reservation` | El remitente no podía corregir su reserva | Extiende el vencimiento y/o cambia el comercio; bloqueada una vez verificada | 4 pruebas `update_reservation: …` (éxito, otro firmante, bloqueada, vacía) |
| 4 | Error correcto en `set_merchant_status` | Devolvía `UnauthorizedCancellation` | Valida contra `Config` y devuelve `UnauthorizedAdmin` | `set_merchant_status: non-admin is rejected…` |
| 5 | **Frontend: "Mis reservas"** | Solo crear y verificar | Lee las cuentas del remitente; permite aprobar, extender y cancelar; simula antes de firmar; confirma, refresca y traduce los errores del programa al español | Capturas en `docs/evidencias/` |
| 6 | Reproducibilidad | Dependía de USDC devnet, backend y servicios externos | `yarn demo-token:devnet` crea y fondea un token de prueba; devcontainer para Codespaces; lockfile compatible con platform-tools v1.51 | Pasos de la sección 6 |

Usé IA como apoyo; revisé, entiendo y probé cada cambio integrado.

---

## 5. Estructura

```
programs/remesa-liquidez/src/   Programa Anchor (Rust)
  instructions/update_reservation.rs   ← nueva
  instructions/register_merchant.rs    ← autoridad corregida
  instructions/validate_cashout.rs     ← cierre al liquidar
tests/remesa-liquidez.ts        24 pruebas (9 nuevas [aporte])
client/index.ts                 Cliente TS (builders de instrucciones + PDAs)
web/idl/remesa_liquidez.json    IDL de esta versión
web/types/remesa_liquidez.ts    Tipos TS generados del IDL
web/                            Frontend Next.js + wallet adapter
  components/MyReservations.tsx ← lectura / update / cancel
  lib/errors.ts                 ← errores del programa en español
scripts/                        demo-token, register-merchants, e2e (Devnet)
migrations/deploy.ts            initialize_config tras desplegar
docs/evidencias/                Capturas y salida de pruebas
```

---

## 6. Configuración y ejecución

### Requisitos
- Rust (el `rust-toolchain.toml` fija 1.89.0 para el host)
- Solana CLI **Agave 3.0.x** (platform-tools v1.51)
- Anchor CLI **0.32.1** (`cargo install anchor-cli --version 0.32.1`)
- Node 20+ y Yarn

**Codespaces:** abre el repo en un Codespace; `.devcontainer/setup.sh` instala todo.

### a) Pruebas locales
```bash
yarn install
anchor build
anchor test          # levanta solana-test-validator y corre las 24 pruebas
```

### b) Desplegar en Devnet
```bash
solana config set --url devnet
solana airdrop 2              # o https://faucet.solana.com (necesitas ~3 SOL)
anchor build
anchor keys sync              # pone TU program ID en declare_id!, Anchor.toml
anchor build                  # recompila con el ID correcto
anchor deploy --provider.cluster devnet
anchor migrate --provider.cluster devnet     # initialize_config (tu wallet = admin)
yarn anchor:sync-web          # copia IDL y tipos a web/
```
Después, actualiza el **Program ID** al inicio de este README y en `web/.env.local`.

### c) Datos de prueba en Devnet
```bash
# Comercio: registra la wallet que usarás en /merchant (solo el admin puede)
MERCHANT_PUBKEYS=<wallet_comercio> yarn register-merchants:devnet

# Token de prueba: fondea remitente y comercio, e imprime NEXT_PUBLIC_USDC_MINT
RECIPIENTS=<wallet_remitente>,<wallet_comercio> yarn demo-token:devnet
```

### d) Frontend
```bash
cp .env.example web/.env.local    # pega PROGRAM_ID y USDC_MINT
cd web && npm install --legacy-peer-deps && npm run dev
# http://localhost:3000  (Phantom/Solflare en Devnet)
```

### e) Flujo completo por script (opcional)
```bash
yarn e2e:devnet    # mint → reserva → verificación → cobro, imprime las firmas
```

---

## 7. Cómo probarlo (guion de demo)

| Paso | Dónde | Qué esperar |
|---|---|---|
| 1. Conectar wallet | `/` | Wallet en Devnet |
| 2. Crear reserva | `/` · "01 initialize_reservation" | Firma → confirmación → enlace a Explorer |
| 3. Leer | `/` · "03 mis reservas" | Aparece la reserva (monto, vencimiento, estado) |
| 4. Modificar | "Extender 1 día" | `expires_at` aumenta tras confirmar |
| 5. Rechazo de baja | "Cancelar y reembolsar" antes de vencer | Mensaje: *solo puedes cancelar después del vencimiento* (`WaitUntilExpiration`) |
| 6. Aprobar receptor | "Aprobar receptor" | `verificada ✓` |
| 7. Edición bloqueada | "Extender 1 día" otra vez | Mensaje: *ya fue verificada y no se puede editar* (`ReservationLocked`) |
| 8. Cobro | `/merchant` con la wallet del comercio | Tokens al comercio, 0.25 % a tesorería; la reserva desaparece de "Mis reservas" (cerrada) |
| 9. Baja exitosa | crear reserva con vencimiento corto y cancelar después | Reembolso y cierre de cuenta |

## 8. Transacciones verificables (Devnet)

| Operación | Firma |
|---|---|
| Deploy del programa | [`CshY4sQQ…Mazbe`](https://explorer.solana.com/tx/CshY4sQQUN1AajzMmYTG7GZeetrkCpF7eWxebKXwzJvsBsLo12MK8gvKMCWwyYfzsfQVJ4p2m6XwGJfWn9Mazbe?cluster=devnet) |
| `initialize_config` | [`5KiNDVR5…jqpWU`](https://explorer.solana.com/tx/5KiNDVR5AwASuxXjUvhwdFCCSrUg3inLyYio9tdivuSXFAg8XGUhx5mrNh7MyE1vX55h9Rfrs1hnyxY9aV6jqpWU?cluster=devnet) |
| `register_merchant` | `<firma>` |
| `initialize_reservation` | `<firma>` |
| `update_reservation` | `<firma>` |
| `mark_verified` | `<firma>` |
| `validate_cashout` | `<firma>` |
| `cancel_reservation` | `<firma>` |

Formato de enlace: `https://explorer.solana.com/tx/<firma>?cluster=devnet`

Salida de la suite de pruebas: [`docs/evidencias/pruebas-localnet.txt`](docs/evidencias/pruebas-localnet.txt)

---

## 9. Notas técnicas
- **Lockfile:** se fijaron `blake3 1.8.2`, `proc-macro-crate 3.3.0`, `indexmap 2.11.4` y `unicode-segmentation 1.12.0` porque sus versiones más nuevas requieren Rust/Cargo ≥ 1.85 (edition 2024), y el `cargo-build-sbf` de platform-tools v1.51 usa Cargo 1.84.
- La PDA de la reserva se deriva del receptor: **una reserva activa por receptor a la vez**. El cierre al cobrar (aporte 2) es lo que permite reutilizarla.
- `mark_verified` lo firma el remitente: en el proyecto base, su backend es quien valida la identidad (World ID) fuera de la cadena.

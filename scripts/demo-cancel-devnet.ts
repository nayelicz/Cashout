/**
 * Demuestra la baja condicionada (`cancel_reservation`) en devnet:
 *   1. El admin (~/.config/solana/id.json) crea una reserva con vencimiento corto.
 *   2. Intenta cancelarla ANTES del vencimiento → rechazo WaitUntilExpiration.
 *   3. Espera el vencimiento y la cancela → reembolso y cierre de cuentas.
 *
 * Uso:
 *   DEMO_MINT=<mint> yarn demo-cancel:devnet
 * (el admin debe ser mint authority de DEMO_MINT, como con `yarn demo-token:devnet`)
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { AnchorProvider, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, Transaction, clusterApiUrl } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

import idl from "../target/idl/remesa_liquidez.json";
import type { RemesaLiquidez } from "../target/types/remesa_liquidez";
import {
  buildCancelReservationIx,
  buildInitializeReservationIx,
  findReservationPda,
} from "../client/index";

const EXPIRY_SECONDS = 15;
const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const connection = new Connection(
    process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet"),
    "confirmed"
  );
  const walletPath =
    process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config/solana/id.json");
  const admin = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8")))
  );
  if (!process.env.DEMO_MINT) throw new Error("Define DEMO_MINT=<mint>");
  const mint = new PublicKey(process.env.DEMO_MINT);

  const provider = new AnchorProvider(connection, new Wallet(admin), {
    commitment: "confirmed",
  });
  const program = new Program<RemesaLiquidez>(idl as unknown as Idl, provider) as unknown as Program<RemesaLiquidez>;

  // Fondos del remitente (admin) para la reserva
  const senderAta = await getOrCreateAssociatedTokenAccount(connection, admin, mint, admin.publicKey);
  await mintTo(connection, admin, mint, senderAta.address, admin, 5_000_000);

  const receiver = Keypair.generate().publicKey;
  const [reservation] = findReservationPda(program.programId, receiver);

  const initIx = await buildInitializeReservationIx({
    program,
    sender: admin.publicKey,
    receiver,
    mint,
    senderTokenAccount: senderAta.address,
    amount: 5_000_000,
    expirySeconds: EXPIRY_SECONDS,
  });
  const initSig = await provider.sendAndConfirm(new Transaction().add(initIx), [admin]);
  console.log(`[cancel] reserva creada (vence en ${EXPIRY_SECONDS}s): ${reservation.toBase58()}`);
  console.log(`[cancel] initialize_reservation ${explorer(initSig)}`);

  const cancelIx = await buildCancelReservationIx({
    program,
    signer: admin.publicKey,
    sender: admin.publicKey,
    receiver,
    mint,
    senderTokenAccount: senderAta.address,
  });

  // Antes del vencimiento: debe rechazarse
  try {
    await provider.sendAndConfirm(new Transaction().add(cancelIx), [admin]);
    console.log("[cancel] ⚠ se esperaba un rechazo y no ocurrió");
  } catch (e) {
    const msg = String(e);
    console.log(
      `[cancel] rechazo antes del vencimiento: ${/WaitUntilExpiration/.test(msg) ? "WaitUntilExpiration ✓" : msg.slice(0, 200)}`
    );
  }

  console.log(`[cancel] esperando ${EXPIRY_SECONDS + 5}s al vencimiento…`);
  await sleep((EXPIRY_SECONDS + 5) * 1000);

  const sig = await provider.sendAndConfirm(new Transaction().add(cancelIx), [admin]);
  const closed = (await connection.getAccountInfo(reservation)) === null;
  console.log(`[cancel] cancel_reservation ${explorer(sig)}`);
  console.log(`[cancel] cuenta de la reserva cerrada: ${closed ? "sí ✓" : "no"}`);
  console.log(`\nFirma cancel_reservation: ${sig}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

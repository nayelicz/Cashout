/**
 * Crea (o reutiliza) un token SPL de prueba en devnet y fondea wallets para
 * probar el frontend sin depender de USDC devnet.
 *
 * Uso:
 *   RECIPIENTS='<walletRemitente>,<walletComercio>' yarn demo-token:devnet
 *   DEMO_MINT=<mint existente> RECIPIENTS='<wallet>' yarn demo-token:devnet
 *
 * El admin (ANCHOR_WALLET o ~/.config/solana/id.json) paga y es mint authority.
 * Al final imprime la línea para `web/.env.local`: NEXT_PUBLIC_USDC_MINT=<mint>
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

const DECIMALS = 6;
const AMOUNT_PER_WALLET = 1_000 * 10 ** DECIMALS; // 1,000 tokens

async function main() {
  const rpc = process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet");
  const connection = new Connection(rpc, "confirmed");
  const walletPath =
    process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config/solana/id.json");
  const admin = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8")))
  );

  const recipients = (process.env.RECIPIENTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new PublicKey(s));
  if (recipients.length === 0) {
    throw new Error("Define RECIPIENTS='<pubkey1>,<pubkey2>'");
  }

  const mint = process.env.DEMO_MINT
    ? new PublicKey(process.env.DEMO_MINT)
    : await createMint(connection, admin, admin.publicKey, null, DECIMALS);
  console.log(`[demo-token] mint ${mint.toBase58()}`);

  for (const r of recipients) {
    const ata = await getOrCreateAssociatedTokenAccount(connection, admin, mint, r);
    const sig = await mintTo(connection, admin, mint, ata.address, admin, AMOUNT_PER_WALLET);
    console.log(
      `[demo-token] 1000 tokens → ${r.toBase58()}  https://explorer.solana.com/tx/${sig}?cluster=devnet`
    );
  }

  console.log("\nAgrega a web/.env.local:");
  console.log(`NEXT_PUBLIC_USDC_MINT=${mint.toBase58()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

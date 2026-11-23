"use client";

/**
 * MyReservations — lectura y gestión de las reservas del remitente conectado.
 *
 * - Lee on-chain todas las `TurnReservation` cuyo `sender` es la wallet
 *   (getProgramAccounts con filtro memcmp en el offset 8).
 * - Por reserva permite:
 *     · mark_verified       (aprobar identidad del receptor)
 *     · update_reservation  (extender 1 día; bloqueado si ya está verificada)
 *     · cancel_reservation  (baja condicionada: el remitente solo después del vencimiento)
 * - Cada acción: construir → firmar → confirmar → refrescar, con errores en español.
 */

import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useCallback, useEffect, useMemo, useState } from "react";

import idlJson from "@/idl/remesa_liquidez.json";
import type { RemesaLiquidez } from "@/types/remesa_liquidez";
import { friendlyError } from "@/lib/errors";
import { findReservationPda, findVaultPda } from "@/lib/pdas";

const accent = "#14F195";
const surface = "#151223";
const border = "#2a2340";
const fg = "#e9ecf3";
const fgMuted = "rgba(233,236,243,0.58)";
const errorColor = "#ff6b6b";
const mono = "ui-monospace, monospace";

const ONE_DAY = 60 * 60 * 24;

interface Row {
  pda: PublicKey;
  receiver: PublicKey;
  merchant: PublicKey;
  mint: PublicKey;
  amount: BN;
  expiresAt: number;
  isVerified: boolean;
  status: string;
}

type Action = "verify" | "extend" | "cancel";

export function MyReservations({ refreshKey = 0 }: { refreshKey?: number }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // `${pda}:${action}`
  const [error, setError] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);

  const program = useMemo(() => {
    if (!publicKey) return null;
    const provider = new AnchorProvider(
      connection,
      {
        publicKey,
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
      },
      { commitment: "confirmed" }
    );
    return new Program<RemesaLiquidez>(
      idlJson as unknown as Idl,
      provider
    ) as unknown as Program<RemesaLiquidez>;
  }, [connection, publicKey]);

  const load = useCallback(async () => {
    if (!program || !publicKey) return;
    setLoading(true);
    try {
      const accounts = await program.account.turnReservation.all([
        { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
      ]);
      setRows(
        accounts
          .map(({ publicKey: pda, account }) => ({
            pda,
            receiver: account.receiver,
            merchant: account.merchant,
            mint: account.mint,
            amount: account.amount,
            expiresAt: account.expiresAt.toNumber(),
            isVerified: account.isVerified,
            status: Object.keys(account.status)[0] ?? "unknown",
          }))
          .sort((a, b) => b.expiresAt - a.expiresAt)
      );
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [program, publicKey]);

  useEffect(() => {
    if (connected) void load();
    else setRows([]);
  }, [connected, load, refreshKey]);

  const run = useCallback(
    async (row: Row, action: Action) => {
      if (!program || !publicKey) return;
      setBusy(`${row.pda.toBase58()}:${action}`);
      setError(null);
      setLastSig(null);
      try {
        const [reservation] = findReservationPda(program.programId, row.receiver);
        let ix;
        if (action === "verify") {
          ix = await program.methods
            .markVerified()
            .accountsStrict({ sender: publicKey, reservation })
            .instruction();
        } else if (action === "extend") {
          ix = await program.methods
            .updateReservation(new BN(ONE_DAY), null)
            .accountsStrict({ sender: publicKey, reservation })
            .instruction();
        } else {
          const [vault] = findVaultPda(program.programId, reservation);
          ix = await program.methods
            .cancelReservation()
            .accountsStrict({
              signer: publicKey,
              sender: publicKey,
              reservation,
              mint: row.mint,
              vault,
              senderTokenAccount: getAssociatedTokenAddressSync(row.mint, publicKey),
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .instruction();
        }

        const latest = await connection.getLatestBlockhash("confirmed");
        const tx = new Transaction({ feePayer: publicKey, ...latest }).add(ix);

        // Simulación previa: muestra el error del programa antes de pedir firma.
        const sim = await connection.simulateTransaction(tx);
        if (sim.value.err) {
          throw Object.assign(new Error(JSON.stringify(sim.value.err)), {
            logs: sim.value.logs ?? [],
          });
        }

        const sig = await sendTransaction(tx, connection);
        await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
        setLastSig(sig);
        await load();
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setBusy(null);
      }
    },
    [program, publicKey, connection, sendTransaction, load]
  );

  if (!connected) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: fgMuted, fontFamily: mono }}>
        Conecta tu wallet para ver tus reservas.
      </p>
    );
  }

  const now = Math.floor(Date.now() / 1000);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: fgMuted, fontFamily: mono }}>
          {loading ? "Leyendo cuentas on-chain…" : `${rows.length} reserva(s) activa(s)`}
        </span>
        <button onClick={() => void load()} disabled={loading} style={btn(false)}>
          Actualizar
        </button>
      </div>

      {rows.map((r) => {
        const key = r.pda.toBase58();
        const expired = now >= r.expiresAt;
        const open = r.merchant.equals(PublicKey.default);
        return (
          <div
            key={key}
            style={{
              padding: 14,
              border: `1px solid ${border}`,
              borderRadius: 8,
              background: surface,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontFamily: mono,
              fontSize: 12,
              color: fg,
            }}
          >
            <span>
              PDA <span style={{ color: accent, wordBreak: "break-all" }}>{key}</span>
            </span>
            <span style={{ color: fgMuted }}>
              Receptor {short(r.receiver)} · Monto {(r.amount.toNumber() / 1e6).toFixed(2)} ·{" "}
              Comercio {open ? "abierto" : short(r.merchant)}
            </span>
            <span style={{ color: fgMuted }}>
              Estado {r.status} · {r.isVerified ? "verificada ✓" : "sin verificar"} · Vence{" "}
              {new Date(r.expiresAt * 1000).toLocaleString()} {expired ? "(vencida)" : ""}
            </span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              <button
                style={btn(busy === `${key}:verify`)}
                disabled={!!busy || r.isVerified}
                onClick={() => void run(r, "verify")}
              >
                Aprobar receptor
              </button>
              <button
                style={btn(busy === `${key}:extend`)}
                disabled={!!busy}
                onClick={() => void run(r, "extend")}
              >
                Extender 1 día
              </button>
              <button
                style={btn(busy === `${key}:cancel`)}
                disabled={!!busy}
                onClick={() => void run(r, "cancel")}
              >
                Cancelar y reembolsar
              </button>
            </div>
          </div>
        );
      })}

      {lastSig && (
        <a
          href={`https://explorer.solana.com/tx/${lastSig}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
          style={{ color: accent, fontSize: 12, fontFamily: mono }}
        >
          ✓ Confirmada — ver transacción en Explorer
        </a>
      )}
      {error && (
        <p style={{ margin: 0, fontSize: 13, color: errorColor, fontFamily: mono }}>✕ {error}</p>
      )}
    </div>
  );
}

function short(pk: PublicKey) {
  const s = pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function btn(active: boolean): React.CSSProperties {
  return {
    padding: "6px 10px",
    fontSize: 12,
    fontFamily: mono,
    background: active ? accent : "transparent",
    color: active ? "#0c0a14" : accent,
    border: `1px solid ${accent}`,
    borderRadius: 6,
    cursor: "pointer",
  };
}

/**
 * Traduce errores del programa (códigos Anchor) y de la wallet a mensajes
 * en español para la UI. Los códigos propios empiezan en 6000 en el orden de
 * `programs/remesa-liquidez/src/errors.rs` (ver también `web/idl`).
 */
import idl from "@/idl/remesa_liquidez.json";

const ES: Record<string, string> = {
  ReservationNotActive: "La reserva ya no está activa.",
  InvalidMerchant: "El comercio no está autorizado o no coincide con el asignado.",
  ReservationExpired: "La reserva ya venció.",
  UnauthorizedCancellation: "No tienes permiso para cancelar esta reserva.",
  WaitUntilExpiration:
    "Como remitente solo puedes cancelar después del vencimiento (el receptor puede cancelar en cualquier momento).",
  InvalidAmount: "El monto debe ser mayor a cero.",
  InvalidExpiry: "El plazo indicado no es válido.",
  SenderMismatch: "Solo el remitente original puede hacer esta operación.",
  ReceiverMismatch: "El receptor no coincide con la reserva.",
  MintMismatch: "El token no coincide con el de la reserva.",
  NumericOverflow: "Error numérico (desbordamiento).",
  ReceiverNotVerified: "El receptor aún no ha sido verificado.",
  AlreadyVerified: "La reserva ya estaba verificada.",
  UnauthorizedAdmin: "Solo el administrador del protocolo puede hacer esto.",
  InsufficientTreasury: "La tesorería no tiene fondos suficientes.",
  ReservationLocked: "La reserva ya fue verificada y no se puede editar.",
  NothingToUpdate: "No indicaste ningún cambio.",
};

const BY_CODE = new Map<number, string>(
  ((idl as { errors?: { code: number; name: string }[] }).errors ?? []).map(
    (e) => [e.code, e.name]
  )
);

export function friendlyError(err: unknown): string {
  const raw =
    err instanceof Error ? `${err.message} ${(err as { logs?: string[] }).logs?.join(" ") ?? ""}` : String(err);

  if (/User rejected|rejected the request/i.test(raw)) {
    return "Cancelaste la firma en la wallet.";
  }
  if (/insufficient (funds|lamports)|Attempt to debit/i.test(raw)) {
    return "Saldo insuficiente de SOL para pagar la transacción (usa faucet.solana.com).";
  }

  // "custom program error: 0x1771" o "Error Number: 6001"
  const hex = raw.match(/custom program error: 0x([0-9a-f]+)/i);
  const dec = raw.match(/Error Number: (\d+)/);
  const code = hex ? parseInt(hex[1], 16) : dec ? Number(dec[1]) : null;
  if (code !== null && BY_CODE.has(code)) {
    const name = BY_CODE.get(code)!;
    return ES[name] ?? name;
  }
  for (const name of Object.keys(ES)) {
    if (raw.includes(name)) return ES[name];
  }
  return err instanceof Error ? err.message : raw;
}

use anchor_lang::prelude::*;

use crate::errors::ErrorCode;
use crate::state::{ReservationStatus, TurnReservation};

/// APORTE (nueva operación de modificación): el remitente puede corregir su
/// reserva —cambiar el comercio preferido y/o extender el vencimiento—
/// mientras siga activa, vigente y SIN verificar. Una vez que el remitente
/// aprueba la identidad del receptor (`mark_verified`), la reserva queda
/// bloqueada para que el comercio/plazo no cambien con el receptor en camino.
#[derive(Accounts)]
pub struct UpdateReservation<'info> {
    pub sender: Signer<'info>,

    #[account(
        mut,
        seeds = [TurnReservation::SEED_PREFIX, reservation.receiver.as_ref()],
        bump = reservation.bump,
        has_one = sender @ ErrorCode::SenderMismatch,
    )]
    pub reservation: Account<'info, TurnReservation>,
}

/// * `extend_seconds`  — segundos a sumar a `expires_at` (opcional, > 0).
/// * `preferred_merchant` — nuevo comercio preasignado (opcional).
///   `Pubkey::default()` deja la reserva abierta a cualquier comercio activo.
pub fn handler(
    ctx: Context<UpdateReservation>,
    extend_seconds: Option<i64>,
    preferred_merchant: Option<Pubkey>,
) -> Result<()> {
    require!(
        extend_seconds.is_some() || preferred_merchant.is_some(),
        ErrorCode::NothingToUpdate
    );

    let clock = Clock::get()?;
    let reservation = &mut ctx.accounts.reservation;

    require!(
        reservation.status == ReservationStatus::Active,
        ErrorCode::ReservationNotActive
    );
    require!(!reservation.is_verified, ErrorCode::ReservationLocked);
    require!(
        clock.unix_timestamp < reservation.expires_at,
        ErrorCode::ReservationExpired
    );

    if let Some(secs) = extend_seconds {
        require!(secs > 0, ErrorCode::InvalidExpiry);
        reservation.expires_at = reservation
            .expires_at
            .checked_add(secs)
            .ok_or(ErrorCode::NumericOverflow)?;
    }

    if let Some(m) = preferred_merchant {
        reservation.merchant = m;
    }

    msg!(
        "Reservation updated: receiver={}, merchant={}, expires_at={}",
        reservation.receiver,
        reservation.merchant,
        reservation.expires_at
    );

    Ok(())
}

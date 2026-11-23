use anchor_lang::prelude::*;

use crate::errors::ErrorCode;
use crate::state::{Config, MerchantAccount};

/// Alta de un comercio en el whitelist.
///
/// APORTE (corrección de autoridad): en la versión original cualquier wallet
/// podía registrar cualquier comercio, porque solo se pedía un `Signer` que
/// pagara el rent. Como una reserva sin comercio preasignado puede cobrarla
/// cualquier comercio del whitelist, eso permitía que un tercero se diera de
/// alta y cobrara reservas ajenas. Ahora solo `config.admin` puede registrar.
#[derive(Accounts)]
#[instruction(merchant: Pubkey)]
pub struct RegisterMerchant<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [Config::SEED_PREFIX],
        bump = config.bump,
        constraint = config.admin == admin.key() @ ErrorCode::UnauthorizedAdmin,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = admin,
        space = MerchantAccount::SPACE,
        seeds = [MerchantAccount::SEED_PREFIX, merchant.as_ref()],
        bump,
    )]
    pub merchant_account: Account<'info, MerchantAccount>,

    pub system_program: Program<'info, System>,
}

pub fn register_handler(ctx: Context<RegisterMerchant>, merchant: Pubkey) -> Result<()> {
    let acc = &mut ctx.accounts.merchant_account;
    acc.merchant = merchant;
    acc.admin = ctx.accounts.admin.key();
    acc.active = true;
    acc.bump = ctx.bumps.merchant_account;
    msg!("Merchant registered: {}", merchant);
    Ok(())
}

/// Activa/desactiva un comercio. Solo `config.admin`.
///
/// APORTE: antes la validación devolvía `UnauthorizedCancellation` (error de
/// otra regla). Ahora se valida contra `Config` y devuelve `UnauthorizedAdmin`.
#[derive(Accounts)]
pub struct SetMerchantStatus<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [Config::SEED_PREFIX],
        bump = config.bump,
        constraint = config.admin == admin.key() @ ErrorCode::UnauthorizedAdmin,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [MerchantAccount::SEED_PREFIX, merchant_account.merchant.as_ref()],
        bump = merchant_account.bump,
    )]
    pub merchant_account: Account<'info, MerchantAccount>,
}

pub fn set_status_handler(ctx: Context<SetMerchantStatus>, active: bool) -> Result<()> {
    ctx.accounts.merchant_account.active = active;
    msg!(
        "Merchant {} active flag set to {}",
        ctx.accounts.merchant_account.merchant,
        active
    );
    Ok(())
}

// src/strings/es/trade.ts
// Trade modal (also shared inventory panel words used by the pickup modal).

export const trade = {
  title: (partner: string) => `Intercambio con ${partner}`,
  hint: 'Tocá un objeto y después dónde querés moverlo.',
  hintSelected: 'Ahora tocá un espacio o la zona de oferta.',
  yourEquipment: 'Tu equipo',
  discard: 'Descarte',
  iGive: 'Yo doy',
  partnerGives: (partner: string) => `${partner} da`,
  offerEmpty: 'Tocá un objeto y después acá para ofrecerlo',
  partnerOfferEmpty: 'Todavía no ofreció nada',
  me: 'Vos',
  ready: 'Listo',
  notReady: 'Pendiente',
  status: (who: string, state: string) => `${who}: ${state}`,
  cancel: 'Cancelar',
  accept: 'Aceptar',
  unaccept: 'Deshacer',
  badgeGet: 'Recibís',
} as const;

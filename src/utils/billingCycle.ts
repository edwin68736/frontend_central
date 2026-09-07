/**
 * Ciclo de facturación de una suscripción, derivado de `billed_months` (meses VENDIDOS en esa
 * suscripción/renovación puntual — lo que realmente se cobró). A propósito NO se usa
 * `billing_cycle`: ese campo solo copia el billing_cycle ESTÁTICO del plan (monthly | yearly |
 * lifetime, casi siempre "monthly" en el catálogo actual) y no varía aunque el tenant haya
 * contratado 3, 6 o 12 meses de una vez.
 */
export const CYCLE_MONTHS_LABELS: Record<number, string> = {
  1: 'Mensual',
  3: 'Trimestral',
  6: 'Semestral',
  12: 'Anual',
}

/** Opciones para selects de filtro (los 4 ciclos fijos del sistema, ver saas.FixedPlanCycleMonths). */
export const CYCLE_MONTHS_OPTIONS = [1, 3, 6, 12].map(months => ({
  value: months,
  label: CYCLE_MONTHS_LABELS[months],
}))

export function cycleLabelFromMonths(months?: number | null): string {
  if (!months || months <= 0) return '—'
  return CYCLE_MONTHS_LABELS[months] ?? `${months} meses`
}

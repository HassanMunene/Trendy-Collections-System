import type { PaymentMethod } from '../api/types'

/**
 * How customers pay, in the words of the sales book. Numbers confirmed by Mum on 22 Nov 2026;
 * the Paybill is issued through I&M Bank.
 */
export const PAYMENT_METHODS: { key: PaymentMethod; label: string; hint: string; mpesa: boolean }[] = [
  { key: 'cash', label: 'Cash', hint: 'Into the drawer', mpesa: false },
  { key: 'send_money', label: 'Send money', hint: '0712 403 671', mpesa: true },
  { key: 'paybill', label: 'Paybill', hint: '492438', mpesa: true },
  { key: 'account', label: 'To pay', hint: 'Customer owes it', mpesa: false },
]

/** Same list as App\Models\Expense::CATEGORIES. */
export const EXPENSE_CATEGORIES: { key: string; label: string }[] = [
  { key: 'transport', label: 'Transport' },
  { key: 'tailor_pay', label: 'Tailor pay' },
  { key: 'food', label: 'Food' },
  { key: 'materials', label: 'Materials & thread' },
  { key: 'rent', label: 'Rent' },
  { key: 'airtime', label: 'Airtime & data' },
  { key: 'other', label: 'Other' },
]

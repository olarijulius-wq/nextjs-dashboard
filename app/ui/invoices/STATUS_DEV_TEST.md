# Invoice Status Badge Dev Check

Quick manual check in local dev:

1. Start the app: `pnpm dev`.
2. Open invoice list: `/dashboard/invoices`.
3. Open one invoice detail page: `/dashboard/invoices/<invoice-id>`.
4. Confirm status badge text and styling render for each value:
   - `pending` -> `Pending`
   - `paid` -> `Paid`
   - `overdue` -> `Overdue`
   - `refunded` -> `Refunded`
   - `partially_refunded` -> `Partially refunded`
   - `disputed` -> `Disputed`
   - `failed` -> `Failed`
5. For an unknown status (example: `manual_review`), confirm badge renders a neutral style with label `Manual_review`.

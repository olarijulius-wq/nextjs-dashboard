import type { FaqItem } from '@/app/lib/seo/jsonld';

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Who is Lateless for?',
    answer:
      'Lateless is for freelancers, consultants, and small agencies that want a straightforward invoice flow with automated reminders and Stripe payouts.',
  },
  {
    question: 'What is the difference between created and issued invoice dates?',
    answer:
      'Created is when a draft invoice is made. Issued is when the invoice is sent to a customer. Reminder timing is based on issued and due dates.',
  },
  {
    question: 'How do reminder emails work?',
    answer:
      'When reminders are enabled, Lateless can send follow-ups for overdue invoices on day 1, day 7, and day 21 after the due date.',
  },
  {
    question: 'How do Stripe payouts work?',
    answer:
      'Customers pay through Stripe Checkout. Funds are processed by Stripe and paid out to your connected Stripe account using your Stripe payout settings.',
  },
  {
    question: 'Do plan limits reset?',
    answer:
      'Yes. Plan invoice limits reset monthly based on your plan.',
  },
  {
    question: 'Do I lose invoice history after a reset?',
    answer:
      'No. Invoice history remains available even after monthly usage resets.',
  },
  {
    question: 'Can I upgrade later?',
    answer:
      'Yes. You can change plans in billing settings. Plan capabilities and limits update based on your active subscription.',
  },
  {
    question: 'Are card details stored by Lateless?',
    answer:
      'No. Card processing and payment methods are handled by Stripe.',
  },
];

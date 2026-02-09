import { Metadata } from 'next';
import SmtpSettingsPanel from './smtp-settings-panel';

export const metadata: Metadata = {
  title: 'SMTP Settings',
};

export default function SmtpSettingsPage() {
  return <SmtpSettingsPanel />;
}

import { Metadata } from 'next';
import UnsubscribeSettingsPanel from './unsubscribe-settings-panel';

export const metadata: Metadata = {
  title: 'Unsubscribe Settings',
};

export default function UnsubscribeSettingsPage() {
  return <UnsubscribeSettingsPanel />;
}

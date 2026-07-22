import { Phone, MessageSquare, Settings } from 'lucide-react';

export const STAGE_LABEL: Record<string, string> = {
  manager_call: 'Manager Call',
  technical: 'Technical',
  final_result: 'Final Result',
};

export const PREP_TYPE_CONFIG: Record<string, { label: string; icon: typeof Phone; bg: string; color: string; border: string }> = {
  call: { label: 'Call', icon: Phone, bg: '#FEF9EE', color: '#854F0B', border: '#F5E6C8' },
  message: { label: 'Message', icon: MessageSquare, bg: '#FEF9EE', color: '#854F0B', border: '#F5E6C8' },
  call_setup: { label: 'Call + Setup', icon: Settings, bg: '#EEF0FE', color: '#534AB7', border: '#D9DEFB' },
};

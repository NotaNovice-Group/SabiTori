import { Banknote, Building2, CalendarClock, Clock, FileText, GraduationCap, Hand, HeartPulse, Info, Landmark, Phone, Scale, ShieldAlert, Signal, Smartphone, Stamp, TriangleAlert, Zap, Droplets, type LucideIcon } from 'lucide-react';
import type { CardSection, MessageKind, Urgency } from '@sabitori/core';

export const SECTION_ICON: Record<CardSection, LucideIcon> = {
  scam: ShieldAlert,
  sender: Building2,
  about: FileText,
  action: Hand,
  deadline: CalendarClock,
  money: Banknote,
  help: Phone,
  urgency: Info,
};

export const URGENCY_ICON: Record<Urgency, LucideIcon> = { info: Info, soon: Clock, urgent: TriangleAlert };

export const KIND_ICON: Record<MessageKind, LucideIcon> = {
  electricity_bill: Zap,
  water_bill: Droplets,
  mobile_money: Smartphone,
  telecom: Signal,
  bank: Landmark,
  health: HeartPulse,
  school: GraduationCap,
  administrative: Stamp,
  legal: Scale,
  other: FileText,
};

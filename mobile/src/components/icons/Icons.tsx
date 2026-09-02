import Svg, { Path, Circle } from 'react-native-svg';
import type { IconProps } from './types';

// Ícones convertidos 1:1 dos <svg> inline de dooplaapphome.html
// (mesmo viewBox 0 0 24 24, mesmos paths) — nenhum ícone novo
// inventado aqui, só a versão react-native-svg dos mesmos desenhos.
const DEFAULT_SIZE = 20;
const DEFAULT_STROKE = 1.8;

export function BellIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M10 21a2 2 0 0 0 4 0" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function ForumPeopleIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={8} r={3} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={17} cy={9} r={2.6} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M2 20c1-3.5 3.5-5.5 7-5.5s6 2 7 5.5" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M14.5 14.6c2.7.4 4.3 2 5 5.4" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function ChevronDownIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = 2.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = 2.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ChevronLeftIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = 2.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 6l-6 6 6 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function DealTagIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 10V6a2 2 0 0 1 2-2h4l10 10-6 6L4 10z" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function ClockIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 8v4l3 3" stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function NegotiationIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 5h16v11H8l-4 4z" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function HourglassIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 2h12M6 22h12M8 2c0 5 8 5 8 10s-8 5-8 10M16 2c0 5-8 5-8 10s8 5 8 10"
        stroke={color}
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
}

export function CheckIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6 9 17l-5-5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function MoneyIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7H14a3.5 3.5 0 1 1 0 7H6" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function MailIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 4h16v16H4z" stroke={color} strokeWidth={strokeWidth} />
      <Path d="m4 4 8 8 8-8" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function LinkIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function ChatBubbleOutlineIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function HashIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function WhatsAppLogoIcon({ size = DEFAULT_SIZE, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M17.5 14.4c-.3-.1-1.7-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.2-.4.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1.1 2.8 1.2 3c.1.2 2.1 3.3 5.2 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3z"
      />
      <Path
        fill={color}
        d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 20.2 12 8.2 8.2 0 0 1 12 20.2z"
      />
    </Svg>
  );
}

export function HomeTabIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function BookingsTabIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 5h16v15H4z" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M8 3v4M16 3v4M4 10h16" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function AgendaTabIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 5h16v15H4z" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M4 10h16M9 3v4" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function MaisTabIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={5} cy={12} r={1.6} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={12} cy={12} r={1.6} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={19} cy={12} r={1.6} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function DecisoesIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 11l3 3L22 4M2 12l3 3 3-3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function MateriaisIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 3h9l3 3v15H6z" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M9 10h6M9 14h6" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function AnalyticsIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 17l6-6 4 4 8-8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ConfiguracoesIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = DEFAULT_STROKE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2 1.2L10 21h4l.5-2.6c.7-.3 1.4-.7 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.2-.8.2-1.2z"
        stroke={color}
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
}

export function SendIcon({ size = DEFAULT_SIZE, color = '#fff', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Single place for colours, spacing and text sizes so every screen looks consistent.
export const colors = {
  primary: '#0B6E4F',
  primaryDark: '#084C37',
  onPrimary: '#FFFFFF',
  background: '#F3F6F4',
  surface: '#FFFFFF',
  text: '#14201B',
  textMuted: '#4F5D56', // contrast on white/background is above 6:1
  border: '#C5D0CA',
  danger: '#B3261E',
  onDanger: '#FFFFFF',
  warningBg: '#FFF4D6',
  errorBg: '#FDECEA',
  disabled: '#9AA7A0',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const radius = { sm: 8, md: 12 };

export const font = { small: 14, body: 16, large: 18, title: 22, heading: 28 };

/** Android recommends at least 48dp touch targets. */
export const MIN_TOUCH = 48;

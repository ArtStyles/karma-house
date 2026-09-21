import { Platform } from 'react-native';

export const colors = {
  ink: '#1D1D1F', muted: '#68686D', primary: '#0066D6', softBlue: '#EAF3FF',
  paper: '#F5F5F7', white: '#FFFFFF', border: '#E5E5EA', green: '#227A46',
  softGreen: '#EDF8F0', danger: '#C32935', amber: '#8A5C15',
};
export const typefaces = { display: Platform.select({ ios: 'System', android: 'sans-serif', default: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }) };
export const layout = { tabContentBottom: 144 };
export const formatMoney = (value: number) => `$ ${new Intl.NumberFormat('es-CU', { maximumFractionDigits: 0 }).format(value)}`;

import { Platform } from 'react-native';

export const colors = {
  ink: '#132D43', muted: '#61717B', primary: '#145BDE', softBlue: '#EAF1FF',
  paper: '#F8F7F3', white: '#FFFFFF', border: '#E3E7E7', green: '#277258',
  softGreen: '#EAF3ED', danger: '#A82935', amber: '#8A5C15',
};
export const typefaces = { display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' }) };
export const formatMoney = (value: number) => `$ ${new Intl.NumberFormat('es-CU', { maximumFractionDigits: 0 }).format(value)}`;

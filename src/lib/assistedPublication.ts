export const ASSISTED_PUBLICATION_EMAIL = 'fejames07@gmail.com';

export function assistedPublicationMailto(): string {
  const subject = 'Ayuda para publicar en KarmaHouse';
  const body = [
    'Hola, quiero ayuda para preparar un anuncio en KarmaHouse.',
    '',
    'Operación (venta, permuta, alquiler o búsqueda):',
    'Provincia y zona aproximada:',
    'Tipo de vivienda y características:',
    'Precio y moneda, o condiciones de la permuta:',
    'Descripción:',
    'Fotos: las adjuntaré si corresponden.',
    '',
    'Quiero conocer el proceso y revisar el anuncio antes de autorizar su publicación.',
  ].join('\n');
  return `mailto:${ASSISTED_PUBLICATION_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function openAssistedPublicationRequest(openURL: (url: string) => Promise<unknown>): Promise<boolean> {
  try {
    await openURL(assistedPublicationMailto());
    return true;
  } catch {
    return false;
  }
}

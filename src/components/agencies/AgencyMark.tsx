import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { decodePublicAgencyProfile } from '../../agencies/profile';
import { supabase } from '../../lib/supabase';
import { useDataSaverState } from '../../settings/useDataSaver';
import { createThemedStyles, typography } from '../../theme';
import { ArchImage } from '../ArchImage';
import { agencyInitials } from './agencyInitials';

const LOGO = /^[0-9a-f-]{36}\/logos\/[0-9a-f-]{36}\.jpg$/i;
// Signed for 5 minutes; reused for 4, so a mark mounted near the end never asks for an expired file.
const signed = new Map<string, { uri: Promise<string | null>; until: number }>();
// Where an agency keeps its logo when the caller does not know it (an invitation). Read once per session.
const published = new Map<string, Promise<string | null>>();

function signLogo(path: string): Promise<string | null> {
  const cached = signed.get(path);
  if (cached && cached.until > Date.now()) return cached.uri;
  const uri = !supabase ? Promise.resolve(null) : supabase.storage.from('agency-assets').createSignedUrl(path, 300)
    .then(({ data, error }) => error || !data?.signedUrl ? null : data.signedUrl).catch(() => null);
  signed.set(path, { uri, until: Date.now() + 240_000 });
  // A failed signature is not kept: the next mark tries again.
  void uri.then(value => { if (!value) signed.delete(path); });
  return uri;
}

function publishedLogo(agencyId: string): Promise<string | null> {
  let path = published.get(agencyId);
  if (!path) {
    path = !supabase ? Promise.resolve(null) : Promise.resolve(supabase.rpc('kh_public_agency_profile', { p_agency_id: agencyId }))
      .then(({ data, error }) => error || data == null ? null : decodePublicAgencyProfile(data).logoPath).catch(() => null);
    published.set(agencyId, path);
  }
  return path;
}

/**
 * An agency's identity in a cream arch: its logo when it has one, its initials in Calistoga otherwise, while the
 * logo loads, if it fails, or under «Ahorro de datos» (`eager` shows it anyway where the logo is managed). Pass the
 * `logoPath` the screen already has; without it (`undefined`) the mark looks up the published one. A new logo comes
 * with a new path, so a refreshed workspace shows it without restarting the app.
 */
export function AgencyMark({ agencyId, name, logoPath, width, height, bottom, glow = false, eager = false, textStyle }: {
  agencyId: string; name: string; logoPath?: string | null; width: number; height: number; bottom: number;
  glow?: boolean; eager?: boolean; textStyle?: StyleProp<TextStyle>;
}) {
  const { styles } = useStyles();
  const { enabled: dataSaver, ready } = useDataSaverState();
  const wanted = ready && (!dataSaver || eager);
  const [logo, setLogo] = useState<{ path: string; uri: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!wanted || logoPath === null) return;
    let active = true;
    void (logoPath === undefined ? publishedLogo(agencyId) : Promise.resolve(logoPath)).then(async path => {
      if (!path || !LOGO.test(path)) return;
      const uri = await signLogo(path);
      if (active && uri) setLogo({ path, uri });
    });
    return () => { active = false; };
  }, [agencyId, logoPath, wanted]);
  const current = logo && wanted && logoPath !== null && (logoPath === undefined || logo.path === logoPath) && failed !== logo.uri ? logo : null;
  return <ArchImage width={width} height={height} bottom={bottom} glow={glow} style={styles.ground}>
    <Text style={[styles.initials, textStyle]}>{agencyInitials(name)}</Text>
    {current && <Image accessible={false} source={{ uri: current.uri }} resizeMode="cover" onError={() => setFailed(current.uri)} style={styles.logo} />}
  </ArchImage>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  ground: { backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  initials: { ...typography.cardTitle, color: colors.creamInk },
  // Over the initials, with no ground of its own: until the file arrives (or if it never does) the initials show through.
  logo: { ...StyleSheet.absoluteFill },
}));

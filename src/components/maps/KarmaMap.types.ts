import type { StyleProp, ViewStyle } from 'react-native';
import type { Coordinates, LocationPrecision } from '../../domain/geo';

export interface MapMarker {
  id: string;
  coordinate: Coordinates;
  label?: string;
  precision?: LocationPrecision;
}

export interface KarmaMapProps {
  markers?: readonly MapMarker[];
  center?: Coordinates;
  zoom?: number;
  selectedMarkerId?: string;
  onMarkerPress?: (id: string) => void;
  onMapPress?: (coordinate: Coordinates) => void;
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

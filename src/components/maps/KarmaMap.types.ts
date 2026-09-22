import type { StyleProp, ViewStyle } from 'react-native';
import type { BoundingBox, Coordinates, LocationPrecision } from '../../domain/geo';

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
  /** Fires when a pan or zoom settles, with the box now visible. */
  onRegionChange?: (bounds: BoundingBox, zoom: number) => void;
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

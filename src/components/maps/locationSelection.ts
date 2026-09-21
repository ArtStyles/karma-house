import { isMapLocation, normalizeMapLocation, type Coordinates, type LocationPrecision, type MapLocation } from '../../domain/geo.ts';

export interface LocationSelection {
  coordinate?: Coordinates;
  precision: LocationPrecision;
}

type LocationSelectionAction =
  | { type: 'point'; coordinate: Coordinates }
  | { type: 'precision'; precision: LocationPrecision }
  | { type: 'clear' };

export function beginLocationSelection(value?: MapLocation): LocationSelection {
  return {
    coordinate: value ? { latitude: value.latitude, longitude: value.longitude } : undefined,
    precision: value?.precision ?? 'approximate',
  };
}

export function locationSelectionReducer(state: LocationSelection, action: LocationSelectionAction): LocationSelection {
  switch (action.type) {
    case 'point': return isMapLocation({ ...action.coordinate, precision: state.precision }) ? { ...state, coordinate: { ...action.coordinate } } : state;
    case 'precision': return { ...state, precision: action.precision };
    case 'clear': return { ...state, coordinate: undefined };
  }
}

// The raw point exists only while the picker is open. Drafts receive this public position.
export function publishedSelection(selection: LocationSelection): MapLocation | undefined {
  return selection.coordinate ? normalizeMapLocation({ ...selection.coordinate, precision: selection.precision }) : undefined;
}

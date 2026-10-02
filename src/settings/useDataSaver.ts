import { useSyncExternalStore } from 'react';
import { draftStorage } from '../data/draftStorage';
import { createDataSaverStore } from './dataSaver';

// One module-level store: every card, map and the switch in Mi espacio read the same value.
const saver = createDataSaverStore({ storage: draftStorage });
void saver.hydrate();

export function setDataSaver(value: boolean): void {
  void saver.setEnabled(value);
}

export function useDataSaverState() {
  return useSyncExternalStore(saver.subscribe, saver.getState, saver.getState);
}

export function useDataSaver(): boolean {
  return useDataSaverState().enabled;
}

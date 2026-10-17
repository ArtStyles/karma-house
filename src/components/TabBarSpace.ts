import { createContext, useContext } from 'react';

/**
 * How far the floating tab bar reaches up from the bottom edge. The bar floats over the tab screens so they
 * scroll behind its glass; each one ends its content this far up. It is 0 outside the tabs and on wide screens.
 */
export const TabBarSpace = createContext(0);
export const useTabBarSpace = () => useContext(TabBarSpace);

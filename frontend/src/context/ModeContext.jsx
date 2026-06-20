import React, { createContext, useContext, useState } from 'react';

/* Global Beginner ⟷ Pro display mode. Beginner is the default: advanced features
   stay accessible but are translated into plain-language visuals; Pro reveals the
   raw institutional data. Consumed across every dashboard tab via useMode(). */
const ModeContext = createContext(null);
export const useMode = () => useContext(ModeContext);

export function ModeProvider({ children }) {
  const [pro, setPro] = useState(false);
  const value = { pro, setPro, toggle: () => setPro((p) => !p) };
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

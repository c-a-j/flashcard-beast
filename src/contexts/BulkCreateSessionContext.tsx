import { createContext, useContext, useState } from "react";

type BulkCreateSessionContextValue = {
  sessionActive: boolean;
  setSessionActive: (active: boolean) => void;
};

const BulkCreateSessionContext = createContext<BulkCreateSessionContextValue>({
  sessionActive: false,
  setSessionActive: () => {},
});

export function useBulkCreateSession() {
  return useContext(BulkCreateSessionContext);
}

export function BulkCreateSessionProvider({ children }: { children: React.ReactNode }) {
  const [sessionActive, setSessionActive] = useState(false);
  return (
    <BulkCreateSessionContext.Provider value={{ sessionActive, setSessionActive }}>
      {children}
    </BulkCreateSessionContext.Provider>
  );
}

import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

type NetworkStatusValue = {
  /** True once the first connectivity reading is available. */
  isInitialized: boolean;
  /** Connectivity toggles false only when we are confident we are offline. */
  isOffline: boolean;
  isOnline: boolean;
  /** Increments every time connectivity transitions offline -> online. */
  reconnectEpoch: number;
};

const NetworkStatusContext = createContext<NetworkStatusValue | null>(null);

function deriveIsOnline(state: NetInfoState) {
  // `isInternetReachable` starts as null while NetInfo measures it; treat that
  // as unknown (online) instead of flapping the UI into offline mode.
  if (state.isConnected === false) {
    return false;
  }

  if (state.isInternetReachable === false) {
    return false;
  }

  return true;
}

export function NetworkStatusProvider({ children }: PropsWithChildren) {
  const [isOnline, setIsOnline] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [reconnectEpoch, setReconnectEpoch] = useState(0);

  const isInitializedRef = useRef(false);
  const wasOnlineRef = useRef(true);

  useEffect(() => {
    let isMounted = true;

    const applyState = (state: NetInfoState) => {
      if (!isMounted) {
        return;
      }

      const nextIsOnline = deriveIsOnline(state);
      setIsOnline(nextIsOnline);

      if (!isInitializedRef.current) {
        isInitializedRef.current = true;
        setIsInitialized(true);
        wasOnlineRef.current = nextIsOnline;
        return;
      }

      if (nextIsOnline && !wasOnlineRef.current) {
        setReconnectEpoch((epoch) => epoch + 1);
      }

      wasOnlineRef.current = nextIsOnline;
    };

    // NetInfo emits the current state on subscribe, but fetch() guarantees we
    // have a reading even if the listener is slow to fire.
    void NetInfo.fetch()
      .then(applyState)
      .catch(() => {
        if (isMounted && !isInitializedRef.current) {
          isInitializedRef.current = true;
          setIsInitialized(true);
        }
      });

    const unsubscribe = NetInfo.addEventListener(applyState);

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<NetworkStatusValue>(
    () => ({
      isInitialized,
      isOffline: isInitialized && !isOnline,
      isOnline,
      reconnectEpoch,
    }),
    [isInitialized, isOnline, reconnectEpoch],
  );

  return (
    <NetworkStatusContext.Provider value={value}>
      {children}
    </NetworkStatusContext.Provider>
  );
}

export function useNetworkStatus() {
  const context = useContext(NetworkStatusContext);

  if (!context) {
    throw new Error("useNetworkStatus must be used within a NetworkStatusProvider");
  }

  return context;
}

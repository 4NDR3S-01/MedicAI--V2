import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';

type PortalApi = {
  set: (key: string, node: ReactNode) => void;
  remove: (key: string) => void;
};

const PortalContext = createContext<PortalApi | null>(null);

/**
 * Capa raíz para paneles y diálogos propios. A diferencia de <Modal>, lo que se
 * muestra aquí vive en la ventana principal: cubre la barra de pestañas y,
 * sobre todo, recibe correctamente los eventos de teclado en Android con
 * edge-to-edge (en un <Modal> el teclado tapa el contenido).
 */
export function PortalProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [nodes, setNodes] = useState<Record<string, ReactNode>>({});

  const api = useMemo<PortalApi>(
    () => ({
      set: (key, node) => setNodes((current) => ({ ...current, [key]: node })),
      remove: (key) =>
        setNodes((current) => {
          if (!(key in current)) return current;
          const next = { ...current };
          delete next[key];
          return next;
        }),
    }),
    [],
  );

  const entries = Object.entries(nodes);

  return (
    <PortalContext.Provider value={api}>
      {children}
      {entries.length ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {entries.map(([key, node]) => (
            <Fragment key={key}>{node}</Fragment>
          ))}
        </View>
      ) : null}
    </PortalContext.Provider>
  );
}

/** Renderiza `children` en la capa del PortalProvider (o en su sitio si no hay). */
export function Portal({ children }: Readonly<{ children: ReactNode }>) {
  const api = useContext(PortalContext);
  const key = useId();

  // Layout effect: el contenido del portal se actualiza en el mismo frame
  // (evita que los campos de texto controlados vayan un frame por detrás).
  useLayoutEffect(() => {
    api?.set(key, children);
  }, [api, key, children]);

  useEffect(() => () => api?.remove(key), [api, key]);

  return api ? null : <>{children}</>;
}

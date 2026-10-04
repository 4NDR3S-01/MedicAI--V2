import { useEffect, useRef, useState, type Ref } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

/**
 * TextInput controlado que no "pelea" con el teclado.
 *
 * Los paneles (FormSheet) se dibujan a través del Portal, que recibe el
 * contenido nuevo un render después del cambio. En ese render intermedio el
 * TextInput de React Native ya conoce el texto escrito pero recibe todavía el
 * `value` anterior, y lo reescribe en el campo nativo: el cursor salta y, al
 * escribir en medio de un texto, las letras salen en orden inverso.
 *
 * Aquí el campo muestra lo que se acaba de escribir (estado propio, que se
 * actualiza en el mismo render) y solo acepta el `value` de fuera cuando de
 * verdad cambió desde fuera: al reiniciar el formulario o cuando quien lo usa
 * transforma lo escrito (p. ej. deja solo dígitos).
 */
export function BufferedTextInput({
  value,
  onChangeText,
  inputRef,
  ...props
}: TextInputProps & { inputRef?: Ref<TextInput> }) {
  const [text, setText] = useState(value);
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setText(value);
    }
  }, [value]);

  return (
    <TextInput
      ref={inputRef}
      {...props}
      value={text}
      onChangeText={(next) => {
        lastEmitted.current = next;
        setText(next);
        onChangeText?.(next);
      }}
    />
  );
}

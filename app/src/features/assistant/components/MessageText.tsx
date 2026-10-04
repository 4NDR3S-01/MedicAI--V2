import { StyleSheet, Text, View, type TextStyle } from 'react-native';

/**
 * Formato ligero de las respuestas: **negritas** y listas con "- ", "• " o
 * "1. ". El resto de marcas de markdown se quitan.
 */
export function MessageText({ text, color, mutedColor }: Readonly<{ text: string; color: string; mutedColor: string }>) {
  const lines = text
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .split('\n');

  return (
    <View style={styles.block}>
      {lines.map((line, index) => {
        const bullet = /^\s*(?:[-*•+]|\d+[.)])\s+(.*)$/.exec(line);
        if (!line.trim()) return <View key={index} style={styles.gap} />;
        if (bullet) {
          const marker = /^\s*(\d+[.)])/.exec(line)?.[1] ?? '•';
          return (
            <View key={index} style={styles.bulletRow}>
              <Text style={[styles.text, styles.marker, { color: mutedColor }]}>{marker}</Text>
              <Text style={[styles.text, styles.flex, { color }]}>{renderInline(bullet[1])}</Text>
            </View>
          );
        }
        return <Text key={index} style={[styles.text, { color }]}>{renderInline(line)}</Text>;
      })}
    </View>
  );
}

const bold: TextStyle = { fontWeight: '900' };

function renderInline(line: string) {
  return line.split(/(\*\*[^*]+\*\*|__[^_]+__)/g).map((part, index) =>
    /^(\*\*|__)/.test(part) ? (
      <Text key={index} style={bold}>{part.slice(2, -2)}</Text>
    ) : (
      part.replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$)/g, '$1$2')
    ));
}

const styles = StyleSheet.create({
  block: { gap: 2 },
  gap: { height: 6 },
  text: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  bulletRow: { flexDirection: 'row', gap: 8, paddingLeft: 2 },
  marker: { fontWeight: '800', minWidth: 14 },
  flex: { flex: 1 },
});

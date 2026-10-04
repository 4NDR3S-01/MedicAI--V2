import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

export type ChatPhoto = { uri: string; dataUrl: string };

/** Lado mayor de la foto enviada: se lee bien una caja o una receta y pesa ~150 KB. */
const MAX_SIDE = 1280;

/**
 * Toma o elige una foto y la prepara para el asistente: más pequeña y en JPEG
 * (cada imagen gasta cupo del plan gratuito, así que no vale la pena enviarla
 * a resolución completa). null si se cancela o no hay permiso.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<ChatPhoto | null> {
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      source === 'camera' ? 'Cámara desactivada' : 'Fotos desactivadas',
      'Puedes permitirlo en los ajustes del teléfono.',
      [{ text: 'Ahora no', style: 'cancel' }, { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() }],
    );
    return null;
  }

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;

  const landscape = (asset.width ?? 0) >= (asset.height ?? 0);
  const resize = Math.max(asset.width ?? 0, asset.height ?? 0) > MAX_SIDE
    ? [{ resize: landscape ? { width: MAX_SIDE } : { height: MAX_SIDE } }]
    : [];
  const processed = await manipulateAsync(asset.uri, resize, { compress: 0.6, format: SaveFormat.JPEG, base64: true });
  if (!processed.base64) return null;
  return { uri: processed.uri, dataUrl: `data:image/jpeg;base64,${processed.base64}` };
}

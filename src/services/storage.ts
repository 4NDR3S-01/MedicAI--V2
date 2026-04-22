import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const isWeb = Platform.OS === 'web';
const inMemoryStorage = new Map<string, string>();

const webStorage: StorageLike = {
  getItem: async (key) => {
    try {
      return globalThis.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      globalThis.localStorage.setItem(key, value);
    } catch {
      // no-op
    }
  },
  removeItem: async (key) => {
    try {
      globalThis.localStorage.removeItem(key);
    } catch {
      // no-op
    }
  },
};

const nativeStorage: StorageLike = {
  getItem: async (key) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return inMemoryStorage.get(key) ?? null;
    }
  },
  setItem: async (key, value) => {
    try {
      await AsyncStorage.setItem(key, value);
      return;
    } catch {
      inMemoryStorage.set(key, value);
    }
  },
  removeItem: async (key) => {
    try {
      await AsyncStorage.removeItem(key);
      return;
    } catch {
      inMemoryStorage.delete(key);
    }
  },
};

export const appStorage: StorageLike = isWeb ? webStorage : nativeStorage;

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import * as Location from 'expo-location';

import type { AppTheme } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (address: string) => void;
  theme: AppTheme;
}

const MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{height:100%;width:100%}
body{font-family:-apple-system,system-ui,sans-serif}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map,selectedPoi;

function initMap(lat,lng){
  map=L.map('map',{center:[lat,lng],zoom:16,zoomControl:true});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,attribution:'© OpenStreetMap'
  }).addTo(map);

  L.circleMarker([lat,lng],{
    radius:7,color:'#4F46E5',fillColor:'#4F46E5',fillOpacity:0.8
  }).addTo(map);

  fetchNearbyPOIs(lat,lng);

  map.on('moveend',function(){
    if(selectedPoi){
      selectedPoi=null;
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'poiCleared'}));
    }
  });
}

function fetchNearbyPOIs(lat,lng){
  var q='[out:json];('+
    'node["amenity"="clinic"](around:1500,'+lat+','+lng+');'+
    'node["amenity"="hospital"](around:1500,'+lat+','+lng+');'+
    'node["amenity"="doctors"](around:1500,'+lat+','+lng+');'+
    ');out body;';

  fetch('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(q))
    .then(function(r){return r.json()})
    .then(function(data){
      data.elements.forEach(function(el){
        var name=el.tags.name||el.tags.amenity||'Centro medico';
        var m=L.marker([el.lat,el.lon]).addTo(map);
        m.bindPopup('<b>'+esc(name)+'</b>');
        m.on('click',function(){
          map.setView([el.lat,el.lon],map.getZoom());
          selectedPoi={name:name,lat:el.lat,lon:el.lon};
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'poiSelected',name:name}));
        });
      });
    })
    .catch(function(err){console.log(err)});
}

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

function handleConfirm(){
  var c=map.getCenter();
  if(selectedPoi){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'confirmResult',address:selectedPoi.name,lat:c.lat,lng:c.lng}));
    return;
  }
  var url='https://nominatim.openstreetmap.org/reverse?format=json&lat='+c.lat+'&lon='+c.lng+'&addressdetails=1';
  fetch(url).then(function(r){return r.json()})
    .then(function(d){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'confirmResult',address:d.display_name||'Ubicacion seleccionada',lat:c.lat,lng:c.lng}));
    })
    .catch(function(){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'confirmResult',address:'Ubicacion seleccionada',lat:c.lat,lng:c.lng}));
    });
}

window.addEventListener('message',function(e){
  try{
    var d=JSON.parse(e.data);
    if(d.type==='init')initMap(d.lat,d.lng);
    else if(d.type==='confirm')handleConfirm();
  }catch(err){console.log(err)}
});

document.addEventListener('message',function(e){
  window.postMessage(e.data,'*');
});
</script>
</body>
</html>
`;

export function LeafletMapModal({ visible, onClose, onConfirm, theme }: Props) {
  const webViewRef = useRef<WebView>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [selectedPoiName, setSelectedPoiName] = useState<string | null>(null);
  const pendingInit = useRef<{ lat: number; lng: number } | null>(null);
  const webViewReady = useRef(false);

  const sendInit = useCallback((lat: number, lng: number) => {
    webViewRef.current?.postMessage(JSON.stringify({ type: 'init', lat, lng }));
  }, []);

  const handleWebViewLoad = useCallback(() => {
    webViewReady.current = true;
    if (pendingInit.current) {
      sendInit(pendingInit.current.lat, pendingInit.current.lng);
      pendingInit.current = null;
    }
  }, [sendInit]);

  useEffect(() => {
    if (!visible) {
      pendingInit.current = null;
      webViewReady.current = false;
      setSelectedPoiName(null);
      setIsConfirming(false);
      return;
    }

    (async () => {
      setIsGettingLocation(true);
      setSelectedPoiName(null);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        let lat = -34.6037;
        let lng = -58.3816;
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }

        if (webViewReady.current) {
          sendInit(lat, lng);
        } else {
          pendingInit.current = { lat, lng };
        }
      } catch {
        if (webViewReady.current) {
          sendInit(-34.6037, -58.3816);
        } else {
          pendingInit.current = { lat: -34.6037, lng: -58.3816 };
        }
      } finally {
        setIsGettingLocation(false);
      }
    })();
  }, [visible, sendInit]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        switch (data.type) {
          case 'poiSelected':
            setSelectedPoiName(data.name);
            break;
          case 'poiCleared':
            setSelectedPoiName(null);
            break;
          case 'confirmResult':
            setIsConfirming(false);
            onConfirm(data.address);
            onClose();
            break;
        }
      } catch {
        // ignore parse errors
      }
    },
    [onConfirm, onClose],
  );

  const handleConfirm = useCallback(() => {
    setIsConfirming(true);
    webViewRef.current?.postMessage(JSON.stringify({ type: 'confirm' }));
  }, []);

  const handleClose = useCallback(() => {
    if (!isConfirming) {
      setSelectedPoiName(null);
      onClose();
    }
  }, [isConfirming, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.mapOverlay}>
        <View style={[styles.mapContent, { backgroundColor: theme.colors.background }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Elegir ubicacion</Text>
            <Pressable onPress={handleClose} disabled={isConfirming}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.mapWrapper}>
            <WebView
              ref={webViewRef}
              source={{ html: MAP_HTML }}
              style={styles.map}
              onMessage={handleMessage}
              onLoad={handleWebViewLoad}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
            />

            <View style={styles.mapPinOverlay} pointerEvents="none">
              <MaterialCommunityIcons
                name="map-marker"
                size={40}
                color={theme.colors.accentSecondary}
                style={{ marginTop: -20 }}
              />
            </View>

            <View style={[styles.previewBar, { backgroundColor: theme.colors.surface }]}>
              <MaterialCommunityIcons
                name={selectedPoiName ? 'hospital-building' : 'map-marker-outline'}
                size={24}
                color={theme.colors.accentSecondary}
                style={{ marginRight: 12 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.previewLabel, { color: theme.colors.textMuted }]}>
                  {selectedPoiName ? 'Centro seleccionado' : 'Ubicacion'}
                </Text>
                <Text style={[styles.previewText, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                  {selectedPoiName || 'Ubicacion en el mapa'}
                </Text>
              </View>
            </View>

            {(isGettingLocation || isConfirming) && (
              <View style={[StyleSheet.absoluteFill, styles.loadingOverlay]}>
                <ActivityIndicator size="large" color={theme.colors.accentSecondary} />
                <Text style={{ fontSize: 13, color: theme.colors.textPrimary, marginTop: 8 }}>
                  {isConfirming ? 'Obteniendo direccion...' : 'Buscando...'}
                </Text>
              </View>
            )}
          </View>

          <Pressable
            style={[
              styles.confirmButton,
              { backgroundColor: theme.colors.accentSecondary, opacity: isConfirming ? 0.7 : 1 },
            ]}
            onPress={handleConfirm}
            disabled={isConfirming}
          >
            <Text style={[styles.confirmText, { color: theme.colors.buttonText }]}>Confirmar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mapOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  mapContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 24,
    paddingHorizontal: 16,
    paddingBottom: 32,
    height: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  mapWrapper: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  mapPinOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewBar: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  previewLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  previewText: {
    fontSize: 15,
    fontWeight: '700',
  },
  loadingOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  confirmButton: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    alignSelf: 'center',
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '700',
  },
});

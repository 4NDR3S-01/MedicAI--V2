import { registerRootComponent } from 'expo';

// Lo primero: así también se reportan los fallos al arrancar.
import { initErrorReporting } from './src/shared/services/error-reporting';

initErrorReporting();

import App from './App';
// Antes de montar la app: la tarea de avisos silenciosos debe existir aunque
// Android despierte la app solo para ejecutarla.
import { registerPushTasks } from './src/app/push-tasks';

registerPushTasks();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

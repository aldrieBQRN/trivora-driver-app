import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
// Background tasks must be defined at module load, before the app renders (and on a headless
// relaunch, when nothing renders at all).
import './src/tasks/notificationTask';
import App from './App';

registerRootComponent(App);

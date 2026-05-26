import { lazy } from 'react';
import { moduleRegistry } from './ModuleRegistry';
import { logger } from '../../logger/Logger';
import { 
  LucideLayoutDashboard, 
  LucideServer, 
  LucideNetwork, 
  LucideGlobe, 
  LucideTerminal, 
  LucideMic, 
  LucideWorkflow, 
  LucideLayers, 
  LucideSettings 
} from 'lucide-react';

export function registerAllModules() {
  if (moduleRegistry.isRegistered()) return;

  logger.info('MODULE_REGISTRY', 'Boot sequence started');
  logger.info('MODULE_REGISTRY', 'Registering modules...');

  moduleRegistry.register({
    id: 'dashboard',
    name: 'ORION Dashboard',
    version: '2.0.0',
    route: '/',
    icon: LucideLayoutDashboard,
    component: lazy(() => import('../../../../modules/orion-core/views/DashboardView').then(m => ({ default: m.DashboardView }))),
    metadata: { description: 'Central system intelligence & health overview' }
  });

  moduleRegistry.register({
    id: 'devices',
    name: 'Device Matrix',
    version: '1.5.0',
    route: '/devices',
    icon: LucideServer,
    component: lazy(() => import('../../../../modules/devices/views/DevicesView').then(m => ({ default: m.DevicesView }))),
    metadata: { description: 'Networked nodes management & control' }
  });

  moduleRegistry.register({
    id: 'mqtt',
    name: 'MQTT Bridge',
    version: '1.2.0',
    route: '/mqtt',
    icon: LucideNetwork,
    component: lazy(() => import('../../../../modules/mqtt/views/MQTTView').then(m => ({ default: m.MQTTView }))),
    healthcheck: async () => {
      const { mqttManager } = await import('../../runtime/MqttManager');
      return mqttManager.getState() === 'CONNECTED';
    },
    metadata: { description: 'Real-time protocol monitor & broker link' }
  });

  moduleRegistry.register({
    id: 'google-home',
    name: 'Google Home',
    version: '1.0.0',
    route: '/google-home',
    icon: LucideGlobe,
    component: lazy(() => import('../../../../modules/google-home/views/GoogleHomeView').then(m => ({ default: m.GoogleHomeView }))),
    metadata: { description: 'Cloud synchronization & Home Graph link' }
  });

  moduleRegistry.register({
    id: 'triggercmd',
    name: 'TriggerCMD',
    version: '1.1.0',
    route: '/triggercmd',
    icon: LucideTerminal,
    component: lazy(() => import('../../../../modules/triggercmd/views/TriggerCMDView').then(m => ({ default: m.TriggerCMDView }))),
    metadata: { description: 'Remote command execution engine' }
  });

  moduleRegistry.register({
    id: 'voice',
    name: 'Voice System',
    version: '2.0.0',
    route: '/voice',
    icon: LucideMic,
    component: lazy(() => import('../../../../modules/voice/views/VoiceView').then(m => ({ default: m.VoiceView }))),
    metadata: { description: 'Natural language processing & voice engine' }
  });

  moduleRegistry.register({
    id: 'automation',
    name: 'Automations',
    version: '1.0.0',
    route: '/automation',
    icon: LucideWorkflow,
    component: lazy(() => import('../../../../modules/automation/views/AutomationView').then(m => ({ default: m.AutomationView }))),
    metadata: { description: 'Rules, scenes and trigger-action logic' }
  });

  moduleRegistry.register({
    id: 'ecosystem',
    name: 'Ecosystem',
    version: '1.0.0',
    route: '/ecosystem',
    icon: LucideLayers,
    component: lazy(() => import('../../../../modules/ecosystem/views/EcosystemView').then(m => ({ default: m.EcosystemView }))),
    metadata: { description: 'Cross-platform integration overview' }
  });

  // Observability / Runtime Observatory module
  moduleRegistry.register({
    id: 'observability',
    name: 'Observability',
    version: '1.0.0',
    route: '/observability',
    icon: LucideLayers,
    component: lazy(() => import('../../../../modules/observability/views/RuntimeObservatory').then(m => ({ default: m.RuntimeObservatory }))),
    metadata: { description: 'Runtime observability and diagnostics' }
  });

  moduleRegistry.register({
    id: 'settings',
    name: 'System Config',
    version: '1.0.0',
    route: '/settings',
    icon: LucideSettings,
    component: lazy(() => import('../../../../modules/settings/views/SettingsView').then(m => ({ default: m.SettingsView }))),
    metadata: { description: 'Core parameters & security hardening' }
  });

  moduleRegistry.setRegistered(true);
  logger.info('MODULE_REGISTRY', 'Validation complete');
  logger.info('MODULE_REGISTRY', 'Ready');
}

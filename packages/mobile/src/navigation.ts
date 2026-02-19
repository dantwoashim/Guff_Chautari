export type MobileRouteName =
  | 'chat'
  | 'knowledge'
  | 'decision'
  | 'workflow'
  | 'settings';

export interface MobileRouteDefinition {
  name: MobileRouteName;
  path: string;
  title: string;
}

export const MOBILE_ROUTES: MobileRouteDefinition[] = [
  { name: 'chat', path: '/chat', title: 'Chat' },
  { name: 'knowledge', path: '/knowledge', title: 'Knowledge' },
  { name: 'decision', path: '/decision', title: 'Decision Room' },
  { name: 'workflow', path: '/workflow', title: 'Workflow' },
  { name: 'settings', path: '/settings', title: 'Settings' },
];

export const resolveMobileRoute = (name: MobileRouteName): MobileRouteDefinition => {
  const found = MOBILE_ROUTES.find((route) => route.name === name);
  if (!found) {
    throw new Error(`Route ${name} not found.`);
  }
  return found;
};

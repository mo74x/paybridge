import { GatewayProvider } from 'generated/prisma/enums';

export enum RoutingStrategy {
  CURRENCY_OPTIMIZED = 'CURRENCY_OPTIMIZED',
  FEE_OPTIMIZED = 'FEE_OPTIMIZED',
  LOWEST_LATENCY = 'LOWEST_LATENCY',
}

export interface RoutingContext {
  amount: number;
  currency: string;
  preferredGateway?: GatewayProvider;
  strategy?: RoutingStrategy;
}

export interface RoutingResult {
  candidates: GatewayProvider[];
  primary: GatewayProvider;
  strategyUsed: RoutingStrategy;
}

/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';
import { CircuitBreakerService } from '../common/resilience/circuit-breaker/circuit-breaker.service';

describe('HealthService', () => {
  let service: HealthService;
  let prismaService: jest.Mocked<PrismaService>;
  let circuitBreakerService: jest.Mocked<CircuitBreakerService>;

  beforeEach(async () => {
    const mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const mockCircuitBreaker = {
      getAllBreakersStatus: jest.fn().mockReturnValue({
        STRIPE: 'CLOSED',
        PAYMOB: 'CLOSED',
        FAWRY: 'CLOSED',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CircuitBreakerService, useValue: mockCircuitBreaker },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    prismaService = module.get(PrismaService);
    circuitBreakerService = module.get(CircuitBreakerService);
  });

  it('should return UP report when all services are healthy', async () => {
    // Mock checkRedis to return UP
    jest
      .spyOn(service as any, 'checkRedis')
      .mockResolvedValue({ status: 'UP', latencyMs: 2 });

    const report = await service.checkHealth();

    expect(report.status).toBe('UP');
    expect(report.services.database.status).toBe('UP');
    expect(report.services.redis.status).toBe('UP');
    expect(report.services.circuitBreakers.status).toBe('UP');
  });

  it('should return DEGRADED report when one circuit breaker is open', async () => {
    jest
      .spyOn(service as any, 'checkRedis')
      .mockResolvedValue({ status: 'UP', latencyMs: 2 });

    circuitBreakerService.getAllBreakersStatus.mockReturnValue({
      STRIPE: 'OPEN',
      PAYMOB: 'CLOSED',
      FAWRY: 'CLOSED',
    } as any);

    const report = await service.checkHealth();

    expect(report.status).toBe('DEGRADED');
    expect(report.services.circuitBreakers.status).toBe('DEGRADED');
  });

  it('should return DOWN report when database check fails', async () => {
    jest
      .spyOn(service as any, 'checkRedis')
      .mockResolvedValue({ status: 'UP', latencyMs: 2 });

    prismaService.$queryRaw.mockRejectedValue(new Error('Connection timeout'));

    const report = await service.checkHealth();

    expect(report.status).toBe('DOWN');
    expect(report.services.database.status).toBe('DOWN');
  });
});

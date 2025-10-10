import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Connection, PublicKey } from '@solana/web3.js';

const prisma = new PrismaClient();

export class SystemController {
  /**
   * 🔍 Comprehensive system health check
   */
  static async healthCheck(req: Request, res: Response) {
    const startTime = Date.now();
    const checks: any = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'Multi-Tenant POAP Infrastructure',
      version: '2.0.0',
      environment: process.env.NODE_ENV || 'development',
    };

    try {
      // Database connectivity check
      try {
        await prisma.$queryRaw`SELECT 1`;
        const organizerCount = await prisma.organizer.count();
        const campaignCount = await prisma.campaign.count();
        const claimCount = await prisma.claim.count();
        
        checks.database = {
          status: 'connected',
          provider: 'postgresql',
          organizers: organizerCount,
          campaigns: campaignCount,
          claims: claimCount,
          responseTime: Date.now() - startTime,
        };
      } catch (dbError) {
        checks.database = {
          status: 'error',
          error: dbError instanceof Error ? dbError.message : 'Unknown database error',
          responseTime: Date.now() - startTime,
        };
      }

      // Solana RPC connectivity check
      try {
        const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
        const connection = new Connection(rpcUrl, 'confirmed');
        const slot = await connection.getSlot();
        const blockTime = await connection.getBlockTime(slot);
        
        checks.solana = {
          status: 'connected',
          network: 'devnet',
          rpcUrl,
          currentSlot: slot,
          blockTime: blockTime ? new Date(blockTime * 1000).toISOString() : null,
          responseTime: Date.now() - startTime - (checks.database.responseTime || 0),
        };
      } catch (solanaError) {
        checks.solana = {
          status: 'error',
          error: solanaError instanceof Error ? solanaError.message : 'Unknown Solana error',
          responseTime: Date.now() - startTime - (checks.database.responseTime || 0),
        };
      }

      // Relayer status check
      try {
        const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
        if (relayerPrivateKey) {
          const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');
          const privateKeyArray = JSON.parse(relayerPrivateKey);
          const relayerKeypair = require('@solana/web3.js').Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
          const balance = await connection.getBalance(relayerKeypair.publicKey);
          
          checks.relayer = {
            status: balance > 0.01 * 1e9 ? 'healthy' : 'low_balance',
            publicKey: relayerKeypair.publicKey.toString(),
            balance: balance / 1e9,
            balanceLamports: balance,
            warning: balance < 0.01 * 1e9 ? 'Low balance - may affect minting operations' : null,
          };
        } else {
          checks.relayer = {
            status: 'not_configured',
            error: 'RELAYER_PRIVATE_KEY not set',
          };
        }
      } catch (relayerError) {
        checks.relayer = {
          status: 'error',
          error: relayerError instanceof Error ? relayerError.message : 'Unknown relayer error',
        };
      }

      // Environment variables check
      const requiredEnvVars = [
        'DATABASE_URL',
        'RELAYER_PRIVATE_KEY',
        'SOLANA_RPC_URL',
        'JWT_SECRET',
      ];
      
      const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
      
      checks.environment = {
        status: missingEnvVars.length === 0 ? 'complete' : 'incomplete',
        required: requiredEnvVars.length,
        configured: requiredEnvVars.length - missingEnvVars.length,
        missing: missingEnvVars,
      };

      // Overall system status
      const hasErrors = [
        checks.database?.status === 'error',
        checks.solana?.status === 'error',
        checks.relayer?.status === 'error',
        checks.environment?.status === 'incomplete',
      ].some(Boolean);

      const hasWarnings = [
        checks.relayer?.status === 'low_balance',
        checks.relayer?.status === 'not_configured',
      ].some(Boolean);

      checks.overall = {
        status: hasErrors ? 'error' : hasWarnings ? 'warning' : 'healthy',
        ready: !hasErrors,
        totalResponseTime: Date.now() - startTime,
      };

      // Return appropriate status code
      const statusCode = hasErrors ? 503 : hasWarnings ? 200 : 200;
      
      return res.status(statusCode).json({
        success: !hasErrors,
        data: checks,
      });

    } catch (error) {
      console.error('❌ Health check error:', error);
      return res.status(500).json({
        success: false,
        error: 'Health check failed',
        data: {
          ...checks,
          overall: {
            status: 'error',
            ready: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            totalResponseTime: Date.now() - startTime,
          },
        },
      });
    }
  }

  /**
   * 📊 System statistics and metrics
   */
  static async getSystemStats(req: Request, res: Response) {
    try {
      const [
        organizerStats,
        campaignStats,
        claimStats,
        recentActivity,
      ] = await Promise.all([
        // Organizer statistics
        prisma.organizer.aggregate({
          _count: true,
          where: { isActive: true },
        }),
        
        // Campaign statistics
        prisma.campaign.aggregate({
          _count: true,
          where: { isActive: true },
        }),
        
        // Claim statistics
        prisma.claim.aggregate({
          _count: true,
          _sum: { gasCost: true },
        }),
        
        // Recent activity (last 24 hours)
        prisma.claim.findMany({
          where: {
            claimedAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
          include: {
            campaign: {
              select: {
                name: true,
                organizer: {
                  select: { name: true },
                },
              },
            },
          },
          orderBy: { claimedAt: 'desc' },
          take: 10,
        }),
      ]);

      // Calculate daily stats for the last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const dailyStats = await prisma.claim.groupBy({
        by: ['claimedAt'],
        where: {
          claimedAt: { gte: sevenDaysAgo },
        },
        _count: true,
      });

      // Process daily stats
      const dailyClaimsMap = new Map<string, number>();
      dailyStats.forEach(stat => {
        const date = new Date(stat.claimedAt).toISOString().split('T')[0];
        dailyClaimsMap.set(date, (dailyClaimsMap.get(date) || 0) + stat._count);
      });

      const dailyClaims = Array.from(dailyClaimsMap.entries()).map(([date, count]) => ({
        date,
        claims: count,
      }));

      return res.json({
        success: true,
        data: {
          overview: {
            totalOrganizers: organizerStats._count,
            totalCampaigns: campaignStats._count,
            totalClaims: claimStats._count,
            totalGasCost: claimStats._sum.gasCost || 0,
            totalGasCostSOL: (claimStats._sum.gasCost || 0) / 1e9,
          },
          activity: {
            recentClaims: recentActivity,
            dailyClaims,
          },
          timestamp: new Date().toISOString(),
        },
      });

    } catch (error) {
      console.error('❌ Error getting system stats:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get system statistics',
      });
    }
  }

  /**
   * 🔧 Database migration status
   */
  static async getMigrationStatus(req: Request, res: Response) {
    try {
      // Check if all required tables exist
      const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      `;

      const requiredTables = ['organizers', 'campaigns', 'claims', 'api_keys', 'usage'];
      const existingTables = tables.map(t => t.table_name);
      const missingTables = requiredTables.filter(table => !existingTables.includes(table));

      return res.json({
        success: true,
        data: {
          status: missingTables.length === 0 ? 'complete' : 'incomplete',
          requiredTables,
          existingTables,
          missingTables,
          migrationNeeded: missingTables.length > 0,
        },
      });

    } catch (error) {
      console.error('❌ Error checking migration status:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to check migration status',
      });
    }
  }

  /**
   * 🧪 Test database operations
   */
  static async testDatabaseOperations(req: Request, res: Response) {
    const testResults: any = {
      timestamp: new Date().toISOString(),
      tests: [],
    };

    try {
      // Test 1: Basic connection
      try {
        await prisma.$queryRaw`SELECT 1 as test`;
        testResults.tests.push({
          name: 'Database Connection',
          status: 'passed',
          message: 'Successfully connected to database',
        });
      } catch (error) {
        testResults.tests.push({
          name: 'Database Connection',
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Test 2: Read operations
      try {
        const count = await prisma.organizer.count();
        testResults.tests.push({
          name: 'Read Operations',
          status: 'passed',
          message: `Successfully read organizer count: ${count}`,
        });
      } catch (error) {
        testResults.tests.push({
          name: 'Read Operations',
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Test 3: Write operations (create and delete test record)
      try {
        const testOrganizer = await prisma.organizer.create({
          data: {
            email: `test-${Date.now()}@example.com`,
            name: 'Test Organizer',
            passwordHash: 'test-hash',
            tier: 'free',
          },
        });

        await prisma.organizer.delete({
          where: { id: testOrganizer.id },
        });

        testResults.tests.push({
          name: 'Write Operations',
          status: 'passed',
          message: 'Successfully created and deleted test record',
        });
      } catch (error) {
        testResults.tests.push({
          name: 'Write Operations',
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Test 4: Complex queries
      try {
        const result = await prisma.campaign.findMany({
          include: {
            organizer: true,
            _count: { select: { claims: true } },
          },
          take: 1,
        });

        testResults.tests.push({
          name: 'Complex Queries',
          status: 'passed',
          message: `Successfully executed complex query, found ${result.length} campaigns`,
        });
      } catch (error) {
        testResults.tests.push({
          name: 'Complex Queries',
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      const passedTests = testResults.tests.filter((t: any) => t.status === 'passed').length;
      const totalTests = testResults.tests.length;

      testResults.summary = {
        passed: passedTests,
        failed: totalTests - passedTests,
        total: totalTests,
        success: passedTests === totalTests,
      };

      return res.json({
        success: testResults.summary.success,
        data: testResults,
      });

    } catch (error) {
      console.error('❌ Error testing database operations:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to test database operations',
        data: testResults,
      });
    }
  }
}
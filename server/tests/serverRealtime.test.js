import http from 'http';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { io as ioClient } from 'socket.io-client';
import request from 'supertest';
import { User, Job, JobRun, EVENTS_CHANNEL, REALTIME_EVENTS } from '@scraper/shared';
import app from '../src/app.js';
import { generateToken } from '../src/utils/jwt.js';
import {
  initRealtime,
  closeRealtime,
  ConnectionManager,
} from '../src/realtime/index.js';

describe('Phase 5: Server Socket.io Realtime Layer', () => {
  let httpServer;
  let serverPort;
  let mockSubscriber;
  let subscriberMessageHandler;
  let customConnectionManager;

  const userA = { _id: '507f1f77bcf86cd799439011', email: 'usera@example.com' };
  const userB = { _id: '507f1f77bcf86cd799439022', email: 'userb@example.com' };
  let tokenA;
  let tokenB;

  beforeEach(async () => {
    tokenA = generateToken(userA);
    tokenB = generateToken(userB);

    jest.spyOn(User, 'findById').mockImplementation((id) => {
      const idStr = id?.toString();
      if (idStr === userA._id) {
        return {
          select: jest.fn().mockResolvedValue(userA),
        };
      }
      if (idStr === userB._id) {
        return {
          select: jest.fn().mockResolvedValue(userB),
        };
      }
      return {
        select: jest.fn().mockResolvedValue(null),
      };
    });

    subscriberMessageHandler = null;
    mockSubscriber = {
      status: 'ready',
      connect: jest.fn().mockResolvedValue(true),
      subscribe: jest.fn().mockResolvedValue(1),
      unsubscribe: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn((event, handler) => {
        if (event === 'message') {
          subscriberMessageHandler = handler;
        }
      }),
    };

    customConnectionManager = new ConnectionManager({ maxSocketsPerUser: 2 });

    httpServer = http.createServer(app);
    await initRealtime(httpServer, {
      enableRedisAdapter: false,
      enableSubscriber: true,
      eventsSubscriber: mockSubscriber,
      connectionManager: customConnectionManager,
    });

    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        serverPort = httpServer.address().port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await closeRealtime();
    await new Promise((resolve) => {
      httpServer.close(resolve);
    });
    jest.restoreAllMocks();
  });

  const createClientSocket = (opts = {}) => {
    return ioClient(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
      ...opts,
    });
  };

  describe('1. Authentication Middleware', () => {
    it('successfully connects when a valid Bearer JWT is passed in socket.handshake.auth.token', (done) => {
      const client = createClientSocket({
        auth: { token: tokenA },
      });

      client.on('connect', () => {
        expect(client.connected).toBe(true);
        client.disconnect();
        done();
      });

      client.on('connect_error', (err) => {
        done(err);
      });
    });

    it('rejects connection when token is missing', (done) => {
      const client = createClientSocket({
        auth: {},
      });

      client.on('connect', () => {
        client.disconnect();
        done(new Error('Should not have connected without token'));
      });

      client.on('connect_error', (err) => {
        expect(err.message).toMatch(/Authentication token required/i);
        client.disconnect();
        done();
      });
    });

    it('rejects connection when token is invalid or malformed', (done) => {
      const client = createClientSocket({
        auth: { token: 'invalid.jwt.token' },
      });

      client.on('connect', () => {
        client.disconnect();
        done(new Error('Should not have connected with invalid token'));
      });

      client.on('connect_error', (err) => {
        expect(err.message).toMatch(/Invalid or expired authentication token/i);
        client.disconnect();
        done();
      });
    });

    it('strictly rejects connection when token is passed in query string instead of auth', (done) => {
      const client = createClientSocket({
        query: { token: tokenA },
        auth: {},
      });

      client.on('connect', () => {
        client.disconnect();
        done(new Error('Should not have connected with token in query string'));
      });

      client.on('connect_error', (err) => {
        expect(err.message).toMatch(/Token in query string is not permitted/i);
        client.disconnect();
        done();
      });
    });
  });

  describe('2. Room Isolation and Redis Pub/Sub Relay', () => {
    it('user A never receives events emitted to user B (strict room isolation)', (done) => {
      const clientA = createClientSocket({ auth: { token: tokenA } });
      const clientB = createClientSocket({ auth: { token: tokenB } });

      let aReceivedEvent = false;

      clientA.on('run:progress', () => {
        aReceivedEvent = true;
      });

      clientB.on('run:progress', (event) => {
        expect(event.userId).toBe(userB._id);
        expect(event.scraped).toBe(4);

        // Give a short delay to verify user A never received it
        setTimeout(() => {
          expect(aReceivedEvent).toBe(false);
          clientA.disconnect();
          clientB.disconnect();
          done();
        }, 100);
      });

      let connectedCount = 0;
      const onConnect = () => {
        connectedCount += 1;
        if (connectedCount === 2) {
          // Simulate Redis message arriving for user B
          const redisMessage = JSON.stringify({
            type: REALTIME_EVENTS.RUN_PROGRESS,
            userId: userB._id,
            jobId: 'job_456',
            runId: 'run_789',
            ts: Date.now(),
            scraped: 4,
            failed: 0,
            skipped: 0,
            total: 10,
            cacheHits: 1,
          });

          subscriberMessageHandler(EVENTS_CHANNEL, redisMessage);
        }
      };

      clientA.on('connect', onConnect);
      clientB.on('connect', onConnect);
    });

    it('relays valid page:batch event from Redis subscriber to user room', (done) => {
      const clientA = createClientSocket({ auth: { token: tokenA } });

      clientA.on('page:batch', (event) => {
        expect(event.type).toBe('page:batch');
        expect(event.userId).toBe(userA._id);
        expect(event.pages).toHaveLength(2);
        expect(event.pages[0].url).toBe('https://example.com/item1');
        clientA.disconnect();
        done();
      });

      clientA.on('connect', () => {
        const redisMessage = JSON.stringify({
          type: REALTIME_EVENTS.PAGE_BATCH,
          userId: userA._id,
          jobId: 'job_123',
          runId: 'run_999',
          ts: Date.now(),
          pages: [
            { url: 'https://example.com/item1', outcome: 'scraped', cached: false },
            { url: 'https://example.com/item2', outcome: 'skipped', code: 'DUPLICATE', cached: true },
          ],
        });

        subscriberMessageHandler(EVENTS_CHANNEL, redisMessage);
      });
    });

    it('drops malformed Redis pub/sub messages without crashing process or emitting', (done) => {
      const clientA = createClientSocket({ auth: { token: tokenA } });

      let receivedUnexpected = false;
      clientA.onAny(() => {
        receivedUnexpected = true;
      });

      clientA.on('connect', () => {
        // Send corrupt JSON and invalid schema objects
        subscriberMessageHandler(EVENTS_CHANNEL, '{ not: valid json');
        subscriberMessageHandler(EVENTS_CHANNEL, JSON.stringify({ invalid: 'shape' }));
        subscriberMessageHandler(
          EVENTS_CHANNEL,
          JSON.stringify({ type: 'unknown:type', userId: userA._id })
        );

        setTimeout(() => {
          expect(receivedUnexpected).toBe(false);
          clientA.disconnect();
          done();
        }, 150);
      });
    });
  });

  describe('3. Connection Limit (MAX_SOCKETS_PER_USER)', () => {
    it('enforces maximum sockets per user and rejects connections beyond the limit', (done) => {
      // Limit configured to 2 in beforeEach
      const socket1 = createClientSocket({ auth: { token: tokenA } });

      socket1.on('connect', () => {
        const socket2 = createClientSocket({ auth: { token: tokenA } });

        socket2.on('connect', () => {
          // Third socket should exceed limit and be rejected
          const socket3 = createClientSocket({ auth: { token: tokenA } });

          socket3.on('connect', () => {
            socket1.disconnect();
            socket2.disconnect();
            socket3.disconnect();
            done(new Error('Third socket should have been rejected by MAX_SOCKETS_PER_USER'));
          });

          socket3.on('connect_error', (err) => {
            expect(err.message).toMatch(/Maximum connections per user exceeded/i);
            socket1.disconnect();
            socket2.disconnect();
            socket3.disconnect();
            done();
          });
        });
      });
    });
  });

  describe('4. REST Snapshot Endpoint: GET /jobs/:id/runs/latest', () => {
    it('returns the latest run snapshot for resyncing after reconnect', async () => {
      const mockJob = {
        _id: '507f1f77bcf86cd799439033',
        userId: userA._id,
        name: 'Test Job',
      };

      const mockLatestRun = {
        _id: '507f1f77bcf86cd799439044',
        jobId: mockJob._id,
        userId: userA._id,
        status: 'running',
        totalUrls: 50,
        pagesScraped: 25,
        pagesFailed: 2,
        pagesSkipped: 3,
        cacheHits: 10,
        startedAt: new Date(),
      };

      jest.spyOn(Job, 'findOne').mockResolvedValue(mockJob);
      jest.spyOn(JobRun, 'findOne').mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockLatestRun),
      });

      const res = await request(app)
        .get(`/jobs/${mockJob._id}/runs/latest`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.run).toBeDefined();
      expect(res.body.run.pagesScraped).toBe(25);
      expect(res.body.run.totalUrls).toBe(50);
    });

    it('returns 404 when job does not exist or belongs to another user', async () => {
      jest.spyOn(Job, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .get('/jobs/nonexistent_id/runs/latest')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });
});

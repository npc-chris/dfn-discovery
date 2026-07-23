import { Kafka, Producer, Partitioners } from 'kafkajs';
import { getRedisClient } from './redis-client';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const AUDIT_TOPIC = process.env.AUDIT_TOPIC || 'dfn.audit.events';
const FAILOVER_QUEUE_KEY = 'audit:failover_queue';

let producer: Producer | null = null;
let isConnecting = false;

// Retry configuration
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000;

export async function initAuditProducer() {
  if (producer || isConnecting) return;
  isConnecting = true;

  try {
    const kafka = new Kafka({
      clientId: 'dfn-discovery',
      brokers: KAFKA_BROKERS,
    });

    producer = kafka.producer({
      createPartitioner: Partitioners.DefaultPartitioner,
      idempotent: true, // Requires acks: 'all', ensures exactly-once semantics
    });

    await producer.connect();
    console.log('[Audit] Kafka producer connected');
    
    // Start background processor for failover queue
    processFailoverQueue();
  } catch (error) {
    console.error('[Audit] Failed to connect Kafka producer:', error);
    producer = null;
  } finally {
    isConnecting = false;
  }
}

export interface AuditEvent {
  eventType: string;
  actorOrgId: string;
  actorUserId?: string;
  resourceId?: string;
  status: 'success' | 'failure';
  details?: Record<string, any>;
  timestamp?: string;
}

export async function emitAuditEvent(event: AuditEvent): Promise<void> {
  const payload = {
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
  };

  try {
    if (!producer) {
      throw new Error('Kafka producer not connected');
    }

    await producer.send({
      topic: AUDIT_TOPIC,
      messages: [
        {
          key: event.actorOrgId, // Partition by orgId
          value: JSON.stringify(payload),
        },
      ],
      acks: -1, // Wait for all replicas
    });
  } catch (error) {
    console.error('[Audit] Failed to emit event to Kafka, pushing to failover queue:', error);
    
    // Push to Redis failover queue
    const failoverItem = {
      payload,
      retryCount: 0,
    };
    const redis = getRedisClient();
    if (redis) {
      await redis.lpush(FAILOVER_QUEUE_KEY, JSON.stringify(failoverItem));
    }
  }
}

async function processFailoverQueue() {
  while (true) {
    try {
      const redis = getRedisClient();
      if (producer && redis) {
        const itemStr = await redis.rpop(FAILOVER_QUEUE_KEY);
        if (itemStr) {
          const item = JSON.parse(itemStr);
          try {
            await producer.send({
              topic: AUDIT_TOPIC,
              messages: [{ key: item.payload.actorOrgId, value: JSON.stringify(item.payload) }],
              acks: -1,
            });
            console.log(`[Audit] Successfully flushed failover event for ${item.payload.actorOrgId}`);
          } catch (error) {
            item.retryCount++;
            if (item.retryCount <= MAX_RETRIES) {
              const backoffMs = BASE_BACKOFF_MS * Math.pow(2, item.retryCount);
              console.warn(`[Audit] Retry ${item.retryCount} failed. Backing off for ${backoffMs}ms`);
              
              // We simulate backoff by re-inserting it after a delay
              // In production, a proper delayed queue or sorted set should be used
              setTimeout(async () => {
                const redis = getRedisClient();
                if (redis) await redis.lpush(FAILOVER_QUEUE_KEY, JSON.stringify(item));
              }, backoffMs);
            } else {
              console.error('[Audit] Max retries exceeded for event, dropping:', item.payload);
            }
          }
        } else {
          // No items, wait before polling again
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      } else {
        // Producer not ready, wait
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error('[Audit] Error processing failover queue:', error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

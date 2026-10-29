declare module 'cors';
declare module 'kafkajs' {
  export class Kafka {
    constructor(config: any);
    producer(config?: any): Producer;
  }
  export interface Producer {
    connect(): Promise<void>;
    send(record: any): Promise<any>;
    disconnect(): Promise<void>;
  }
  export const Partitioners: {
    DefaultPartitioner: any;
    LegacyPartitioner: any;
  };
}

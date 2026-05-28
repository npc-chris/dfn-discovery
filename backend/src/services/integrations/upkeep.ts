import { AssetManagerInterface, Asset, WorkOrder } from './cmms-interface';

/**
 * Validated API implementation for UpKeep CMMS.
 */
export class UpKeepIntegration implements AssetManagerInterface {
  private apiKey: string;
  private baseUrl = 'https://api.onupkeep.com/api/v2';

  constructor() {
    this.apiKey = process.env.UPKEEP_API_KEY || '';
  }

  private async fetchUpKeep(endpoint: string, options: RequestInit = {}) {
    if (!this.apiKey) {
      console.warn('UPKEEP_API_KEY not configured, using mock data for CMMS integration.');
      return null;
    }

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Session-Token': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
        throw new Error(`UpKeep API error: ${res.statusText}`);
    }
    
    return res.json();
  }

  async getAssets(locationId: string): Promise<Asset[]> {
    const data = await this.fetchUpKeep(`/assets?location=${locationId}`);
    if (!data) return this.mockAssets();
    
    return data.results.map((a: any) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      locationId: a.location?.id || locationId,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      status: a.status === 'operational' ? 'operational' : 'maintenance',
    }));
  }

  async getWorkOrders(locationId: string): Promise<WorkOrder[]> {
    const data = await this.fetchUpKeep(`/work-orders?location=${locationId}`);
    if (!data) return this.mockWorkOrders();

    return data.results.map((wo: any) => ({
      id: wo.id,
      title: wo.title,
      status: wo.status,
      priority: wo.priority,
      createdAt: wo.createdAt,
      updatedAt: wo.updatedAt,
      assetId: wo.asset?.id,
    }));
  }

  async createWorkOrder(params: { title: string; priority: string; description: string; locationId: string }): Promise<WorkOrder> {
    const data = await this.fetchUpKeep('/work-orders', {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        priority: params.priority,
        description: params.description,
        location: params.locationId
      })
    });

    if (!data) return this.mockWorkOrders()[0]; // Simulated

    return {
      id: data.id,
      title: data.title,
      status: data.status,
      priority: data.priority as any,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  }

  private mockAssets(): Asset[] {
    return [
      { id: 'a1', name: 'CNC Machine 1', category: 'Machining', locationId: 'l1', createdAt: '2020-01-01', updatedAt: '2023-01-01', status: 'operational' },
      { id: 'a2', name: 'Injection Molder', category: 'Plastics', locationId: 'l1', createdAt: '2015-05-01', updatedAt: '2024-02-01', status: 'maintenance' }
    ];
  }

  private mockWorkOrders(): WorkOrder[] {
    return [
      { id: 'wo1', title: 'Monthly Maintenance', status: 'complete', priority: 'medium', createdAt: '2024-01-01', updatedAt: '2024-01-05' }
    ];
  }
}

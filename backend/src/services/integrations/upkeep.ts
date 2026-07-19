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
      return { results: [], data: {} };
    }

    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Session-Token': this.apiKey,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!res.ok) {
        console.warn(`UpKeep API error ${res.status}: ${res.statusText}`);
        return { results: [], data: {} };
      }

      return res.json();
    } catch (err) {
      console.warn('[UpKeepIntegration] API request failed:', err);
      return { results: [], data: {} };
    }
  }

  async getAssets(locationId: string): Promise<Asset[]> {
    const data = await this.fetchUpKeep(`/assets?location=${locationId}`);
    const results = Array.isArray(data?.results) ? data.results : [];

    return results.map((a: any) => ({
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
    const results = Array.isArray(data?.results) ? data.results : [];

    return results.map((wo: any) => ({
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

    return {
      id: data.id,
      title: data.title,
      status: data.status,
      priority: data.priority as any,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  }
}

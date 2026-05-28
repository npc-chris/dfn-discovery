export interface Asset {
  id: string;
  name: string;
  category: string;
  locationId: string;
  createdAt: string;
  updatedAt: string;
  status: 'operational' | 'down' | 'maintenance';
}

export interface WorkOrder {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'on_hold' | 'complete';
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  updatedAt: string;
  assetId?: string;
}

export interface AssetManagerInterface {
  getAssets(locationId: string): Promise<Asset[]>;
  getWorkOrders(locationId: string): Promise<WorkOrder[]>;
  createWorkOrder(params: { title: string; priority: string; description: string; locationId: string }): Promise<WorkOrder>;
}

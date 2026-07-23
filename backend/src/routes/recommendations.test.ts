import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getRecommendationsHandler,
  getTopRecommendationHandler,
  getDetailedReportHandler,
  getComparisonTableHandler,
  getExplanationHandler,
  dbRecToScoringResult,
} from './recommendations';
import { getRecommendationsForJob, getFactoriesByIds, getJobById } from '../db/queries';
import { getPresentationLayer } from '../services/presentation-layer';
import type { Request, Response } from 'express';

// Mock DB queries
vi.mock('../db/queries', () => ({
  getRecommendationsForJob: vi.fn(),
  getFactoriesByIds: vi.fn(),
  getJobById: vi.fn(),
}));

// Mock Presentation Layer
vi.mock('../services/presentation-layer', () => ({
  getPresentationLayer: vi.fn(),
}));

describe('Recommendations Route Handlers', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextMock: any;
  let mockPresentationLayer: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      params: { jobId: 'job-123' },
      query: {},
    };

    mockRes = {
      locals: { auth: { orgId: 'test-org' } },
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
    };

    nextMock = vi.fn();

    mockPresentationLayer = {
      formatRecommendation: vi.fn().mockResolvedValue({
        recommendationId: 'rec-1',
        rank: 1,
        factoryName: 'Test Factory',
        fitScore: 85,
        confidenceLevel: 'high',
        leadTimeEstimate: '3-5 business days',
      }),
      formatRecommendationSummary: vi.fn().mockReturnValue({
        jobId: 'job-123',
        totalRecommendations: 1,
        gatePassed: true,
      }),
      generateExplanation: vi.fn().mockResolvedValue('Deterministic explanation details.\n• Point 1\n• Point 2'),
      generateDetailedReport: vi.fn().mockResolvedValue('<html>HTML Report</html>'),
      buildComparisonTable: vi.fn().mockReturnValue({
        criteria: ['Fit Score'],
        factories: [{ factoryId: 'f-1', name: 'Test Factory', scores: [85] }],
      }),
    };

    (getPresentationLayer as any).mockReturnValue(mockPresentationLayer);
  });

  describe('getRecommendationsHandler', () => {
    it('returns a formatted recommendation summary successfully', async () => {
      (getRecommendationsForJob as any).mockResolvedValue([
        { id: 'rec-1', job_id: 'job-123', factory_id: 'f-1', fit_score: 85 },
      ]);
      (getFactoriesByIds as any).mockResolvedValue([
        { id: 'f-1', factory_name: 'Test Factory' },
      ]);
      (getJobById as any).mockResolvedValue({
        id: 'job-123',
        company_name: 'DFN Labs',
      });

      await getRecommendationsHandler(mockReq as Request, mockRes as Response, nextMock);

      expect(getRecommendationsForJob).toHaveBeenCalledWith('job-123', 'test-org');
      expect(getJobById).toHaveBeenCalledWith('job-123', 'test-org');
      expect(mockPresentationLayer.formatRecommendation).toHaveBeenCalled();
      expect(mockPresentationLayer.formatRecommendationSummary).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-123' }));
    });

    it('returns 404 if no recommendations found in database', async () => {
      (getRecommendationsForJob as any).mockResolvedValue([]);

      await getRecommendationsHandler(mockReq as Request, mockRes as Response, nextMock);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'No recommendations found for this job' });
    });

    it('returns 404 if the job is not found', async () => {
      (getRecommendationsForJob as any).mockResolvedValue([
        { id: 'rec-1', job_id: 'job-123', factory_id: 'f-1' },
      ]);
      (getFactoriesByIds as any).mockResolvedValue([{ id: 'f-1' }]);
      (getJobById as any).mockResolvedValue(null);

      await getRecommendationsHandler(mockReq as Request, mockRes as Response, nextMock);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Job not found' });
    });
  });

  describe('getTopRecommendationHandler', () => {
    it('returns the top formatted recommendation', async () => {
      (getRecommendationsForJob as any).mockResolvedValue([
        { id: 'rec-1', job_id: 'job-123', factory_id: 'f-1', fit_score: 85 },
      ]);
      (getFactoriesByIds as any).mockResolvedValue([
        { id: 'f-1', factory_name: 'Test Factory' },
      ]);
      (getJobById as any).mockResolvedValue({ id: 'job-123' });

      await getTopRecommendationHandler(mockReq as Request, mockRes as Response, nextMock);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ recommendationId: 'rec-1' }));
    });
  });

  describe('getDetailedReportHandler', () => {
    it('generates HTML report by default', async () => {
      (getRecommendationsForJob as any).mockResolvedValue([
        { id: 'rec-1', job_id: 'job-123', factory_id: 'f-1' },
      ]);
      (getFactoriesByIds as any).mockResolvedValue([{ id: 'f-1' }]);
      (getJobById as any).mockResolvedValue({ id: 'job-123' });

      await getDetailedReportHandler(mockReq as Request, mockRes as Response, nextMock);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
      expect(mockRes.send).toHaveBeenCalledWith('<html>HTML Report</html>');
    });

    it('generates JSON report if format=json', async () => {
      mockReq.query = { format: 'json' };
      (getRecommendationsForJob as any).mockResolvedValue([
        { id: 'rec-1', job_id: 'job-123', factory_id: 'f-1' },
      ]);
      (getFactoriesByIds as any).mockResolvedValue([{ id: 'f-1' }]);
      (getJobById as any).mockResolvedValue({ id: 'job-123' });

      mockPresentationLayer.generateDetailedReport.mockResolvedValue(JSON.stringify({ test: 'report' }));

      await getDetailedReportHandler(mockReq as Request, mockRes as Response, nextMock);

      expect(mockRes.json).toHaveBeenCalledWith({ test: 'report' });
    });
  });

  describe('getComparisonTableHandler', () => {
    it('returns a comparison table matrix', async () => {
      (getRecommendationsForJob as any).mockResolvedValue([
        { id: 'rec-1', job_id: 'job-123', factory_id: 'f-1' },
      ]);
      (getFactoriesByIds as any).mockResolvedValue([{ id: 'f-1' }]);
      (getJobById as any).mockResolvedValue({ id: 'job-123' });

      await getComparisonTableHandler(mockReq as Request, mockRes as Response, nextMock);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          criteria: expect.any(Array),
          factories: expect.any(Array),
        }),
      );
    });
  });

  describe('getExplanationHandler', () => {
    it('returns structured explanation and extracted keyPoints', async () => {
      mockReq.params = { jobId: 'job-123', factoryId: 'f-1' };
      (getRecommendationsForJob as any).mockResolvedValue([
        { id: 'rec-1', job_id: 'job-123', factory_id: 'f-1' },
      ]);
      (getFactoriesByIds as any).mockResolvedValue([{ id: 'f-1' }]);
      (getJobById as any).mockResolvedValue({ id: 'job-123' });

      await getExplanationHandler(mockReq as Request, mockRes as Response, nextMock);

      expect(mockRes.json).toHaveBeenCalledWith({
        explanation: 'Deterministic explanation details.\n• Point 1\n• Point 2',
        keyPoints: ['Point 1', 'Point 2'],
      });
    });

    it('returns 404 if requested factory does not have recommendation', async () => {
      mockReq.params = { jobId: 'job-123', factoryId: 'f-not-found' };
      (getRecommendationsForJob as any).mockResolvedValue([
        { id: 'rec-1', job_id: 'job-123', factory_id: 'f-1' },
      ]);

      await getExplanationHandler(mockReq as Request, mockRes as Response, nextMock);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('dbRecToScoringResult helper', () => {
    it('correctly maps DB schema row fields', () => {
      const row = {
        id: 'rec-uuid',
        job_id: 'job-123',
        factory_id: 'f-1',
        fit_score: 90,
        feasibility_score: 85,
        confidence_score: 80,
        component_scores: { processMatch: 90 },
        evidence: [],
        caveats: ['Requires certifications verification'],
        rank: 2,
      };

      const result = dbRecToScoringResult(row);

      expect(result.recommendationId).toBe('rec-uuid');
      expect(result.jobId).toBe('job-123');
      expect(result.fitScore).toBe(90);
      expect(result.gatePassed).toBe(false);
      expect(result.gateFaiureReason).toBe('Requires certifications verification');
      expect(result.rank).toBe(2);
    });
  });
});

import { apiPost } from './client';

export interface AnalyticsReportRequest {
  region?: string | null;
  type?: string | null;
  year_from: number;
  year_to: number;
}

export interface AnalyticsReportResponse {
  provider: string;
  model_name: string | null;
  region: string | null;
  municipality_type: string | null;
  year_from: number;
  year_to: number;
  report_text: string;
}

export async function fetchAnalyticsReport(
  payload: AnalyticsReportRequest,
): Promise<AnalyticsReportResponse> {
  return apiPost<AnalyticsReportResponse, AnalyticsReportRequest>('/api/v1/reports/analytics', payload);
}
